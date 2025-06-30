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

router.addHandler('search_results', async ({ request, page, log, enqueueLinks, session }) => {
    try {
        log.info(`Processing search results page: ${currentPage}`, { url: request.loadedUrl });

        // Get input parameters
        const inputParams = await Actor.getValue('INPUT_PARAMS') as InputParams;
        log.info(`Input parameters:`, inputParams);
        
        // Enhanced stealth measures
        await page.addInitScript(() => {
            // Remove webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });

            // Mock plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });

            // Mock languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });

            // Mock permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );

            // Mock chrome object
            window.chrome = {
                runtime: {},
            };
        });

        // Set realistic headers
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
        });

        // Set viewport to common desktop size
        await page.setViewportSize({ width: 1366, height: 768 });

        // Navigate with realistic user behavior
        log.info(`Navigating to: ${request.url}`);
        
        // Add random delay before navigation
        await page.waitForTimeout(Math.random() * 3000 + 2000);
        
        try {
            // Wait for page to load with increased timeout
            await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
            log.info('Page DOM content loaded');
            
            // Wait for network to be idle
            await page.waitForLoadState('networkidle', { timeout: 30000 });
            log.info('Page network idle');
            
        } catch (loadError) {
            log.warning(`Load state timeout, continuing anyway: ${loadError}`);
        }

        // Additional wait for dynamic content
        await page.waitForTimeout(5000);

        // Check if we're blocked or redirected
        const currentUrl = page.url();
        const pageTitle = await page.title();
        log.info(`Current URL: ${currentUrl}`);
        log.info(`Page title: ${pageTitle}`);

        // Check for common blocking indicators
        const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
        const blockingKeywords = ['blocked', 'access denied', 'forbidden', 'captcha', 'security check'];
        const isBlocked = blockingKeywords.some(keyword => bodyText.includes(keyword));
        
        if (isBlocked) {
            log.warning('Page appears to be blocked, marking session as bad');
            session?.markBad();
            throw new Error('Page blocked by anti-bot protection');
        }

        // Take screenshot for debugging
        await page.screenshot({ path: `debug-page-${currentPage}.png`, fullPage: true });
        log.info(`Screenshot saved as debug-page-${currentPage}.png`);

        // Simulate human-like scrolling
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if(totalHeight >= scrollHeight){
                        clearInterval(timer);
                        resolve(null);
                    }
                }, 100);
            });
        });

        // Wait for gig listings to appear with multiple selectors
        const possibleSelectors = [
            '[data-gig-id]',
            '.gig-card-layout', 
            '.gig-wrapper',
            '.gig-card',
            '[data-impression-collected]',
            '.basic-gig-card',
            '.gig-card-footer-wrapper',
            '[data-testid="gig-card"]',
            '.gig-card-container'
        ];

        let gigElementsFound = false;
        let workingSelector = '';
        
        for (const selector of possibleSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 10000 });
                const elementCount = await page.locator(selector).count();
                if (elementCount > 0) {
                    log.info(`Found ${elementCount} elements with selector: ${selector}`);
                    gigElementsFound = true;
                    workingSelector = selector;
                    break;
                }
            } catch (error) {
                log.info(`Selector ${selector} not found, trying next...`);
            }
        }

        if (!gigElementsFound) {
            log.warning('No gig listings found with any of the expected selectors');
            // Log page content for debugging
            const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
            log.info(`Page body content (first 2000 chars): ${bodyText}`);
            
            // Check if we need to handle cookie consent or other overlays
            const overlaySelectors = [
                '[data-testid="cookie-banner"]',
                '.cookie-consent',
                '.gdpr-banner',
                '.modal-overlay',
                '.popup-overlay'
            ];
            
            for (const overlaySelector of overlaySelectors) {
                try {
                    const overlay = await page.locator(overlaySelector).first();
                    if (await overlay.isVisible()) {
                        log.info(`Found overlay with selector: ${overlaySelector}, attempting to close`);
                        const closeButton = overlay.locator('button, [role="button"]').first();
                        if (await closeButton.isVisible()) {
                            await closeButton.click();
                            await page.waitForTimeout(2000);
                        }
                    }
                } catch (error) {
                    // Ignore overlay handling errors
                }
            }
        }

        // Extract gig data from the current page with enhanced error handling
        const gigs = await page.evaluate((selector) => {
            console.log('Starting gig extraction with selector:', selector);
            
            const gigElements = document.querySelectorAll(selector || '[data-gig-id], .gig-card-layout, .gig-wrapper, .gig-card');
            console.log(`Found ${gigElements.length} gig elements`);
            
            if (gigElements.length === 0) {
                // Try alternative extraction methods
                const allLinks = document.querySelectorAll('a[href*="/gigs/"]');
                console.log(`Found ${allLinks.length} gig links as fallback`);
                
                if (allLinks.length === 0) {
                    return [];
                }
            }

            const extractedGigs: any[] = [];

            gigElements.forEach((gigElement, index) => {
                try {
                    console.log(`Processing gig element ${index + 1}/${gigElements.length}`);
                    
                    // Enhanced title extraction
                    const titleSelectors = [
                        'h3 a', 'h2 a', 'h4 a',
                        '.gig-title a',
                        '[data-gig-title] a',
                        'a[data-impression-collected]',
                        '.gig-link',
                        'a[href*="/gigs/"]'
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
                    
                    // Enhanced rating extraction
                    const ratingSelectors = [
                        '.rating-score', '.star-rating-score',
                        '[data-rating]', '.gig-rating',
                        '.rating-wrapper span',
                        '.rating span',
                        '[aria-label*="star"]'
                    ];
                    
                    let rating = 0;
                    for (const selector of ratingSelectors) {
                        const ratingElement = gigElement.querySelector(selector);
                        if (ratingElement) {
                            const ratingText = ratingElement.textContent?.trim() || 
                                             ratingElement.getAttribute('aria-label') || '0';
                            const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
                            if (ratingMatch) {
                                rating = parseFloat(ratingMatch[1]) || 0;
                                if (rating > 0) {
                                    console.log(`Found rating: ${rating}`);
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Enhanced review count extraction
                    const reviewSelectors = [
                        '.rating-count', '.reviews-count',
                        '[data-reviews-count]',
                        '.rating-wrapper .count',
                        '.review-count',
                        '[class*="review"]'
                    ];
                    
                    let reviewCount = 0;
                    for (const selector of reviewSelectors) {
                        const reviewElement = gigElement.querySelector(selector);
                        if (reviewElement) {
                            const reviewText = reviewElement.textContent?.trim() || '0';
                            const reviewMatch = reviewText.match(/(\d+)/);
                            if (reviewMatch) {
                                reviewCount = parseInt(reviewMatch[1]) || 0;
                                if (reviewCount > 0) {
                                    console.log(`Found review count: ${reviewCount}`);
                                    break;
                                }
                            }
                        }
                    }

                    // Enhanced price extraction
                    const priceSelectors = [
                        '.price', '.gig-price',
                        '[data-price]', '.price-wrapper',
                        '.starting-at', '.price-display',
                        '[class*="price"]'
                    ];
                    
                    let price = '';
                    for (const selector of priceSelectors) {
                        const priceElement = gigElement.querySelector(selector);
                        if (priceElement) {
                            price = priceElement.textContent?.trim() || '';
                            if (price && (price.includes('$') || price.includes('€') || price.includes('£'))) {
                                console.log(`Found price: ${price}`);
                                break;
                            }
                        }
                    }

                    // Enhanced seller extraction
                    const sellerSelectors = [
                        '.seller-name', '.username',
                        '[data-seller]', '.seller-info .name',
                        '.seller-link', '[class*="seller"]'
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
                    
                    const sellerLevelElement = gigElement.querySelector('.seller-level, [data-seller-level], [class*="level"]');
                    const sellerLevel = sellerLevelElement?.textContent?.trim() || '';

                    // Extract thumbnail
                    const thumbnailElement = gigElement.querySelector('img');
                    const thumbnail = thumbnailElement?.getAttribute('src') || 
                                    thumbnailElement?.getAttribute('data-src') || 
                                    thumbnailElement?.getAttribute('data-lazy-src') || '';

                    // Extract tags
                    const tagElements = gigElement.querySelectorAll('.tag, .gig-tag, [data-tag], [class*="tag"]');
                    const tags = Array.from(tagElements).map(tag => tag.textContent?.trim() || '').filter(Boolean);

                    // Generate ID
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
        }, workingSelector);

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
                    '.pagination-next:not([disabled]):not(.disabled)',
                    '[aria-label="Next"]:not([disabled]):not(.disabled)',
                    '.next-page:not([disabled]):not(.disabled)',
                    '.pagination .next:not([disabled]):not(.disabled)',
                    'a[aria-label="Go to next page"]:not([disabled]):not(.disabled)'
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
                await page.waitForTimeout(Math.random() * 5000 + 3000);
                
                log.info('Attempting to enqueue next page link');
                await enqueueLinks({
                    selector: '.pagination-next:not([disabled]):not(.disabled), [aria-label="Next"]:not([disabled]):not(.disabled), .next-page:not([disabled]):not(.disabled), .pagination .next:not([disabled]):not(.disabled), a[aria-label="Go to next page"]:not([disabled]):not(.disabled)',
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
        log.error('Error processing search results page:', { 
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
    }
});

// Default handler for any unmatched requests
router.addDefaultHandler(async ({ request, log }) => {
    log.info(`Processing default handler for: ${request.url}`);
    // This might catch any redirects or unexpected URLs
    // We'll treat them as search results pages
    const handler = router.getHandler('search_results');
    if (handler) {
        await handler({ request } as any);
    }
});