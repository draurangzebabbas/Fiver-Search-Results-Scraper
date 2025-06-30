import { createPlaywrightRouter, Dataset } from 'crawlee';
import { Actor } from 'apify';

export const router = createPlaywrightRouter();

interface Gig {
    id: string;
    title: string;
    link: string;
    rating: number;
    reviewCount: number;
    price: string;
    seller: string;
    sellerLevel: string;
    thumbnail: string;
    tags: string[];
}

interface InputParams {
    keyword: string;
    minReviews: number;
    maxReviews?: number;
    pages: number;
    sortBy: string;
}

let currentPage = 1;

router.addHandler('search_results', async ({ request, page, log, enqueueLinks }) => {
    try {
        log.info(`Processing search results page: ${currentPage}`, { url: request.loadedUrl });

        // Get input parameters
        const inputParams = await Actor.getValue('INPUT_PARAMS') as InputParams;
        log.info(`Input parameters:`, inputParams);
        
        // Wait for the page to load completely
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); // Additional wait for dynamic content

        // Debug: Take a screenshot to see what the page looks like
        await page.screenshot({ path: `debug-page-${currentPage}.png`, fullPage: true });
        log.info(`Screenshot saved as debug-page-${currentPage}.png`);

        // Debug: Log the page title and URL
        const pageTitle = await page.title();
        log.info(`Page title: ${pageTitle}`);
        log.info(`Current URL: ${page.url()}`);

        // Wait for gig listings to appear with multiple selectors
        const possibleSelectors = [
            '[data-gig-id]',
            '.gig-card-layout', 
            '.gig-wrapper',
            '.gig-card',
            '[data-impression-collected]',
            '.basic-gig-card'
        ];

        let gigElementsFound = false;
        for (const selector of possibleSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                log.info(`Found elements with selector: ${selector}`);
                gigElementsFound = true;
                break;
            } catch (error) {
                log.info(`Selector ${selector} not found, trying next...`);
            }
        }

        if (!gigElementsFound) {
            log.warning('No gig listings found with any of the expected selectors');
            // Debug: Log the page content to see what's actually there
            const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
            log.info(`Page body content (first 1000 chars): ${bodyText}`);
        }

        // Extract gig data from the current page with enhanced logging
        const gigs = await page.evaluate(() => {
            console.log('Starting gig extraction...');
            
            // Try multiple selectors for gig elements
            const selectors = [
                '[data-gig-id]',
                '.gig-card-layout', 
                '.gig-wrapper',
                '.gig-card',
                '[data-impression-collected]',
                '.basic-gig-card',
                '.gig-card-footer-wrapper'
            ];
            
            let gigElements: NodeListOf<Element> | null = null;
            let usedSelector = '';
            
            for (const selector of selectors) {
                gigElements = document.querySelectorAll(selector);
                if (gigElements.length > 0) {
                    usedSelector = selector;
                    console.log(`Found ${gigElements.length} elements with selector: ${selector}`);
                    break;
                }
            }
            
            if (!gigElements || gigElements.length === 0) {
                console.log('No gig elements found with any selector');
                console.log('Available elements on page:', document.querySelectorAll('*').length);
                return [];
            }

            console.log(`Using selector: ${usedSelector}, found ${gigElements.length} elements`);
            const extractedGigs: any[] = [];

            gigElements.forEach((gigElement, index) => {
                try {
                    console.log(`Processing gig element ${index + 1}/${gigElements!.length}`);
                    
                    // Try multiple selectors for title
                    const titleSelectors = [
                        'h3 a',
                        '.gig-title a',
                        '[data-gig-title] a',
                        'a[data-impression-collected]',
                        '.gig-link',
                        'h2 a',
                        'h4 a'
                    ];
                    
                    let titleElement: Element | null = null;
                    let title = '';
                    let link = '';
                    
                    for (const selector of titleSelectors) {
                        titleElement = gigElement.querySelector(selector);
                        if (titleElement) {
                            title = titleElement.textContent?.trim() || '';
                            link = titleElement.getAttribute('href') || '';
                            if (title && link) {
                                console.log(`Found title with selector ${selector}: ${title.substring(0, 50)}...`);
                                break;
                            }
                        }
                    }
                    
                    if (!title || !link) {
                        console.log(`No title/link found for element ${index}, skipping`);
                        return;
                    }
                    
                    // Try multiple selectors for rating
                    const ratingSelectors = [
                        '.rating-score',
                        '[data-rating]',
                        '.gig-rating',
                        '.rating-wrapper span',
                        '.star-rating-score'
                    ];
                    
                    let rating = 0;
                    for (const selector of ratingSelectors) {
                        const ratingElement = gigElement.querySelector(selector);
                        if (ratingElement) {
                            const ratingText = ratingElement.textContent?.trim() || '0';
                            rating = parseFloat(ratingText) || 0;
                            if (rating > 0) {
                                console.log(`Found rating: ${rating}`);
                                break;
                            }
                        }
                    }
                    
                    // Try multiple selectors for review count
                    const reviewSelectors = [
                        '.rating-count',
                        '[data-reviews-count]',
                        '.reviews-count',
                        '.rating-wrapper .count'
                    ];
                    
                    let reviewCount = 0;
                    for (const selector of reviewSelectors) {
                        const reviewElement = gigElement.querySelector(selector);
                        if (reviewElement) {
                            const reviewText = reviewElement.textContent?.trim() || '0';
                            reviewCount = parseInt(reviewText.replace(/[^\d]/g, '')) || 0;
                            if (reviewCount > 0) {
                                console.log(`Found review count: ${reviewCount}`);
                                break;
                            }
                        }
                    }

                    // Try multiple selectors for price
                    const priceSelectors = [
                        '.price',
                        '[data-price]',
                        '.gig-price',
                        '.price-wrapper',
                        '.starting-at'
                    ];
                    
                    let price = '';
                    for (const selector of priceSelectors) {
                        const priceElement = gigElement.querySelector(selector);
                        if (priceElement) {
                            price = priceElement.textContent?.trim() || '';
                            if (price) {
                                console.log(`Found price: ${price}`);
                                break;
                            }
                        }
                    }

                    // Try multiple selectors for seller
                    const sellerSelectors = [
                        '.seller-name',
                        '[data-seller]',
                        '.username',
                        '.seller-info .name'
                    ];
                    
                    let seller = '';
                    for (const selector of sellerSelectors) {
                        const sellerElement = gigElement.querySelector(selector);
                        if (sellerElement) {
                            seller = sellerElement.textContent?.trim() || '';
                            if (seller) {
                                console.log(`Found seller: ${seller}`);
                                break;
                            }
                        }
                    }
                    
                    const sellerLevelElement = gigElement.querySelector('.seller-level, [data-seller-level]');
                    const sellerLevel = sellerLevelElement?.textContent?.trim() || '';

                    // Extract thumbnail
                    const thumbnailElement = gigElement.querySelector('img');
                    const thumbnail = thumbnailElement?.getAttribute('src') || thumbnailElement?.getAttribute('data-src') || '';

                    // Extract tags (if available)
                    const tagElements = gigElement.querySelectorAll('.tag, .gig-tag, [data-tag]');
                    const tags = Array.from(tagElements).map(tag => tag.textContent?.trim() || '').filter(Boolean);

                    // Generate ID from data attribute or create one
                    const id = gigElement.getAttribute('data-gig-id') || 
                              gigElement.getAttribute('data-gig') || 
                              `gig-${Date.now()}-${index}`;

                    console.log(`Extracted gig data:`, {
                        title: title.substring(0, 30) + '...',
                        link: link.substring(0, 50) + '...',
                        rating,
                        reviewCount,
                        price,
                        seller
                    });

                    extractedGigs.push({
                        id,
                        title,
                        link: link.startsWith('http') ? link : `https://www.fiverr.com${link}`,
                        rating,
                        reviewCount,
                        price,
                        seller,
                        sellerLevel,
                        thumbnail: thumbnail.startsWith('http') ? thumbnail : (thumbnail ? `https:${thumbnail}` : ''),
                        tags
                    });
                    
                } catch (error) {
                    console.log(`Error extracting gig data for element ${index}:`, error);
                }
            });

            console.log(`Total extracted gigs: ${extractedGigs.length}`);
            return extractedGigs;
        });

        log.info(`Extracted ${gigs.length} gigs from page ${currentPage}`);
        
        // Debug: Log details of first few gigs
        if (gigs.length > 0) {
            log.info(`First gig details:`, {
                title: gigs[0].title,
                link: gigs[0].link,
                rating: gigs[0].rating,
                reviewCount: gigs[0].reviewCount,
                price: gigs[0].price
            });
        } else {
            log.warning('No gigs were extracted from the page');
        }

        // Save gigs to dataset
        for (const gig of gigs) {
            await Dataset.pushData(gig);
        }

        log.info(`Saved ${gigs.length} gigs to dataset`);

        // Check if we should continue to next page
        if (currentPage < inputParams.pages) {
            log.info(`Checking for next page. Current: ${currentPage}, Target: ${inputParams.pages}`);
            
            // Look for next page link with multiple selectors
            const nextPageExists = await page.evaluate(() => {
                const nextSelectors = [
                    '.pagination-next',
                    '[aria-label="Next"]',
                    '.next-page',
                    '.pagination .next',
                    'a[aria-label="Go to next page"]'
                ];
                
                for (const selector of nextSelectors) {
                    const nextButton = document.querySelector(selector);
                    if (nextButton && !nextButton.hasAttribute('disabled') && 
                        !nextButton.classList.contains('disabled')) {
                        console.log(`Found next page button with selector: ${selector}`);
                        return true;
                    }
                }
                
                console.log('No next page button found or it is disabled');
                return false;
            });

            log.info(`Next page exists: ${nextPageExists}`);

            if (nextPageExists) {
                currentPage++;
                log.info(`Navigating to page ${currentPage}`);
                
                // Add delay before navigating to next page
                await page.waitForTimeout(3000);
                
                log.info('Attempting to enqueue next page link');
                await enqueueLinks({
                    selector: '.pagination-next, [aria-label="Next"], .next-page, .pagination .next, a[aria-label="Go to next page"]',
                    label: 'search_results',
                });
                log.info('Successfully enqueued next page link');
            } else {
                log.info('No more pages available or reached the end');
            }
        } else {
            log.info(`Reached maximum pages limit: ${inputParams.pages}`);
        }

    } catch (error) {
        log.error('Error processing search results page:', error);
        throw error;
    }
});

// Default handler for any unmatched requests
router.addDefaultHandler(async ({ request, log }) => {
    log.info(`Processing default handler for: ${request.url}`);
    // This might catch any redirects or unexpected URLs
    // We'll treat them as search results pages
    await router.getHandler('search_results')?.({ request } as any);
});