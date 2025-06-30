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
        
        // Wait for the page to load completely
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); // Additional wait for dynamic content

        // Wait for gig listings to appear
        try {
            await page.waitForSelector('[data-gig-id], .gig-card-layout', { timeout: 10000 });
        } catch (error) {
            log.warning('Gig listings not found, page might have different structure');
        }

        // Extract gig data from the current page
        const gigs = await page.evaluate(() => {
            const gigElements = document.querySelectorAll('[data-gig-id], .gig-card-layout, .gig-wrapper');
            const extractedGigs: any[] = [];

            gigElements.forEach((gigElement, index) => {
                try {
                    // Extract basic information
                    const titleElement = gigElement.querySelector('h3 a, .gig-title a, [data-gig-title] a');
                    const title = titleElement?.textContent?.trim() || '';
                    const link = titleElement?.getAttribute('href') || '';
                    
                    // Extract rating and reviews
                    const ratingElement = gigElement.querySelector('.rating-score, [data-rating]');
                    const rating = parseFloat(ratingElement?.textContent?.trim() || '0');
                    
                    const reviewElement = gigElement.querySelector('.rating-count, [data-reviews-count]');
                    const reviewText = reviewElement?.textContent?.trim() || '0';
                    const reviewCount = parseInt(reviewText.replace(/[^\d]/g, '')) || 0;

                    // Extract price
                    const priceElement = gigElement.querySelector('.price, [data-price], .gig-price');
                    const price = priceElement?.textContent?.trim() || '';

                    // Extract seller information
                    const sellerElement = gigElement.querySelector('.seller-name, [data-seller], .username');
                    const seller = sellerElement?.textContent?.trim() || '';
                    
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

                    if (title && link) {
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
                    }
                } catch (error) {
                    console.log('Error extracting gig data:', error);
                }
            });

            return extractedGigs;
        });

        log.info(`Extracted ${gigs.length} gigs from page ${currentPage}`);

        // Save gigs to dataset
        for (const gig of gigs) {
            await Dataset.pushData(gig);
        }

        // Check if we should continue to next page
        if (currentPage < inputParams.pages) {
            // Look for next page link
            const nextPageExists = await page.evaluate(() => {
                const nextButton = document.querySelector('.pagination-next, [aria-label="Next"], .next-page');
                return nextButton && !nextButton.hasAttribute('disabled') && 
                       !nextButton.classList.contains('disabled');
            });

            if (nextPageExists) {
                currentPage++;
                log.info(`Navigating to page ${currentPage}`);
                
                // Add delay before navigating to next page
                await page.waitForTimeout(3000);
                
                await enqueueLinks({
                    selector: '.pagination-next, [aria-label="Next"], .next-page',
                    label: 'search_results',
                });
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