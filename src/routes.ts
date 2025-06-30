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

// Extend Window interface to include chrome property
declare global {
    interface Window {
        chrome: any;
    }
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

            // Mock permissions - fix the type issue
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters: PermissionDescriptor): Promise<PermissionStatus> => {
                if (parameters.name === 'notifications') {
                    return Promise.resolve({
                        state: Notification.permission,
                        name: parameters.name,
                        onchange: null,
                        addEventListener: () => {},
                        removeEventListener: () => {},
                        dispatchEvent: () => false
                    } as PermissionStatus);
                }
                return originalQuery.call(window.navigator.permissions, parameters);
            };

            // Mock chrome object - fix the type issue
            (window as any).chrome = {
                runtime: {},
            };

            // Additional stealth measures
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => 4,
            });

            Object.defineProperty(navigator, 'deviceMemory', {
                get: () => 8,
            });

            // Mock screen properties
            Object.defineProperty(screen, 'availHeight', {
                get: () => 1040,
            });

            Object.defineProperty(screen, 'availWidth', {
                get: () => 1920,
            });

            // Remove automation indicators
            delete (navigator as any).webdriver;
            
            // Mock connection
            Object.defineProperty(navigator, 'connection', {
                get: () => ({
                    effectiveType: '4g',
                    rtt: 50,
                    downlink: 10,
                }),
            });
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        // Set viewport to common desktop size
        await page.setViewportSize({ width: 1366, height: 768 });

        // Navigate with realistic user behavior
        log.info(`Navigating to: ${request.url}`);
        
        // Add random delay before navigation
        await page.waitForTimeout(Math.random() * 5000 + 3000);
        
        try {
            // Wait for page to load with increased timeout
            await page.waitForLoadState('domcontentloaded', { timeout: 90000 });
            log.info('Page DOM content loaded');
            
            // Wait for network to be idle
            await page.waitForLoadState('networkidle', { timeout: 45000 });
            log.info('Page network idle');
            
        } catch (loadError) {
            log.warning(`Load state timeout, continuing anyway: ${loadError}`);
        }

        // Additional wait for dynamic content
        await page.waitForTimeout(8000);

        // Check if we're blocked or redirected
        const currentUrl = page.url();
        const pageTitle = await page.title();
        log.info(`Current URL: ${currentUrl}`);
        log.info(`Page title: ${pageTitle}`);

        // Check for common blocking indicators
        const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
        const blockingKeywords = ['blocked', 'access denied', 'forbidden', 'captcha', 'security check', 'bot detected'];
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
            await new Promise<void>((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if(totalHeight >= scrollHeight){
                        clearInterval(timer);
                        resolve();
                    }
                }, 150);
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
            '.gig-card-container',
            '.gig-card-item',
            '[data-cy="gig-card"]'
        ];

        let gigElementsFound = false;
        let workingSelector = '';
        
        for (const selector of possibleSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 15000 });
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
                '.popup-overlay',
                '[role="dialog"]',
                '.notice-banner'
            ];
            
            for (const overlaySelector of overlaySelectors) {
                try {
                    const overlay = await page.locator(overlaySelector).first();
                    if (await overlay.isVisible()) {
                        log.info(`Found overlay with selector: ${overlaySelector}, attempting to close`);
                        const closeButton = overlay.locator('button, [role="button"], .close, .dismiss').first();
                        if (await closeButton.isVisible()) {
                            await closeButton.click();
                            await page.waitForTimeout(3000);
                        }
                    }
                } catch (error) {
                    // Ignore overlay handling errors
                }
            }
        }

        // Extract gig data from the current page with enhanced error handling and validation
        const gigs = await page.evaluate((selector, keyword) => {
            console.log('=== STARTING GIG EXTRACTION DEBUG ===');
            console.log('Starting gig extraction with selector:', selector);
            console.log('Keyword:', keyword);
            
            // Helper function to clean text (from Supabase function)
            function cleanText(text: string): string {
                return text
                    .replace(/&/g, '&')
                    .replace(/</g, '<')
                    .replace(/>/g, '>')
                    .replace(/"/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            // Helper function to generate tags (from Supabase function)
            function generateTags(title: string, keyword: string): string[] {
                const commonTags = ['SEO', 'Marketing', 'Content', 'Writing', 'Digital', 'Professional', 'Quality'];
                const keywordTags = keyword.split(' ').map(word => 
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                );
                
                const titleWords = title.toLowerCase().split(' ');
                const relevantTags = commonTags.filter(tag => 
                    titleWords.some(word => word.includes(tag.toLowerCase()))
                );

                return [...new Set([...keywordTags, ...relevantTags])].slice(0, 4);
            }
            
            const gigElements = document.querySelectorAll(selector || '[data-gig-id], .gig-card-layout, .gig-wrapper, .gig-card');
            console.log(`Found ${gigElements.length} gig elements`);
            
            if (gigElements.length === 0) {
                console.log('No gig elements found, trying alternative extraction methods');
                // Try alternative extraction methods
                const allLinks = document.querySelectorAll('a[href*="/gigs/"]');
                console.log(`Found ${allLinks.length} gig links as fallback`);
                
                if (allLinks.length === 0) {
                    console.log('No gig links found either, returning empty array');
                    return [];
                }
            }

            const extractedGigs: any[] = [];

            gigElements.forEach((gigElement, index) => {
                try {
                    console.log(`\n=== PROCESSING GIG ELEMENT ${index + 1}/${gigElements.length} ===`);
                    
                    // Enhanced title extraction with multiple patterns (from Supabase function)
                    const titleSelectors = [
                        'h3 a', 'h2 a', 'h4 a',
                        '.gig-title a',
                        '[data-gig-title] a',
                        'a[data-impression-collected]',
                        '.gig-link',
                        'a[href*="/gigs/"]',
                        '[data-impression-gig-title]'
                    ];
                    
                    let titleElement: Element | null = null;
                    let title = '';
                    let link = '';
                    
                    // Try data attribute first
                    const dataTitle = gigElement.getAttribute('data-impression-gig-title');
                    console.log(`Data title attribute: "${dataTitle}"`);
                    if (dataTitle && dataTitle.trim().length > 5) {
                        title = cleanText(dataTitle);
                        console.log(`Found title from data attribute: "${title}"`);
                    }
                    
                    // If no data title, try selectors
                    if (!title) {
                        console.log('No data title found, trying selectors...');
                        for (const titleSelector of titleSelectors) {
                            titleElement = gigElement.querySelector(titleSelector);
                            if (titleElement) {
                                title = titleElement.textContent?.trim() || '';
                                link = titleElement.getAttribute('href') || '';
                                console.log(`Selector "${titleSelector}" found element with title: "${title}" and link: "${link}"`);
                                if (title && title.length > 5) {
                                    title = cleanText(title);
                                    console.log(`Cleaned title: "${title}"`);
                                    break;
                                }
                            } else {
                                console.log(`Selector "${titleSelector}" found no element`);
                            }
                        }
                    }
                    
                    // Extract link if not found yet
                    if (!link && titleElement) {
                        link = titleElement.getAttribute('href') || '';
                        console.log(`Extracted link from title element: "${link}"`);
                    }
                    
                    // Try to find link separately if still not found
                    if (!link) {
                        console.log('No link found yet, trying separate link extraction...');
                        const linkElement = gigElement.querySelector('a[href*="/gigs/"]');
                        if (linkElement) {
                            link = linkElement.getAttribute('href') || '';
                            console.log(`Found link from separate search: "${link}"`);
                        }
                    }
                    
                    console.log(`TITLE CHECK: title="${title}", length=${title.length}, valid=${title && title.length >= 5}`);
                    console.log(`LINK CHECK: link="${link}", valid=${!!link}`);
                    
                    // Strict validation: Skip if no title or link (from Supabase function logic)
                    if (!title || title.length < 5 || !link) {
                        console.log(`❌ SKIPPING ELEMENT ${index}: No valid title/link. Title: "${title}" (length: ${title.length}), Link: "${link}"`);
                        return;
                    }
                    
                    // Enhanced rating extraction with validation (from Supabase function)
                    const ratingSelectors = [
                        '.rating-score', '.star-rating-score',
                        '[data-rating]', '.gig-rating',
                        '.rating-wrapper span',
                        '.rating span',
                        '[aria-label*="star"]',
                        '.stars-rating',
                        '.rating-text'
                    ];
                    
                    let rating = 0;
                    console.log('Trying to extract rating...');
                    for (const ratingSelector of ratingSelectors) {
                        const ratingElement = gigElement.querySelector(ratingSelector);
                        if (ratingElement) {
                            const ratingText = ratingElement.textContent?.trim() || 
                                             ratingElement.getAttribute('aria-label') || 
                                             ratingElement.getAttribute('data-rating') || '0';
                            console.log(`Rating selector "${ratingSelector}" found text: "${ratingText}"`);
                            const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
                            if (ratingMatch) {
                                const parsedRating = parseFloat(ratingMatch[1]);
                                console.log(`Parsed rating: ${parsedRating}`);
                                if (parsedRating >= 1 && parsedRating <= 5) {
                                    rating = Math.round(parsedRating * 10) / 10;
                                    console.log(`Valid rating found: ${rating}`);
                                    break;
                                } else {
                                    console.log(`Rating ${parsedRating} is out of valid range (1-5)`);
                                }
                            } else {
                                console.log(`No rating number found in text: "${ratingText}"`);
                            }
                        } else {
                            console.log(`Rating selector "${ratingSelector}" found no element`);
                        }
                    }
                    
                    console.log(`RATING CHECK: rating=${rating}, valid=${rating > 0}`);
                    
                    // Strict validation: Skip if no valid rating (from Supabase function logic)
                    if (rating === 0) {
                        console.log(`❌ SKIPPING ELEMENT ${index}: No valid rating found. Rating: ${rating}`);
                        return;
                    }
                    
                    // Enhanced review count extraction with validation (from Supabase function)
                    const reviewSelectors = [
                        '.rating-count', '.reviews-count',
                        '[data-reviews-count]',
                        '.rating-wrapper .count',
                        '.review-count',
                        '[class*="review"]',
                        '.rating-text'
                    ];
                    
                    let reviewCount = 0;
                    console.log('Trying to extract review count...');
                    for (const reviewSelector of reviewSelectors) {
                        const reviewElement = gigElement.querySelector(reviewSelector);
                        if (reviewElement) {
                            const reviewText = reviewElement.textContent?.trim() || '0';
                            console.log(`Review selector "${reviewSelector}" found text: "${reviewText}"`);
                            // Look for patterns like "(123)" or "123 reviews"
                            const reviewMatch = reviewText.match(/\(?(\d+)\)?/);
                            if (reviewMatch) {
                                const parsedCount = parseInt(reviewMatch[1]);
                                console.log(`Parsed review count: ${parsedCount}`);
                                if (parsedCount > 0 && parsedCount < 50000) { // Reasonable upper limit
                                    reviewCount = parsedCount;
                                    console.log(`Valid review count found: ${reviewCount}`);
                                    break;
                                } else {
                                    console.log(`Review count ${parsedCount} is out of valid range (1-50000)`);
                                }
                            } else {
                                console.log(`No review number found in text: "${reviewText}"`);
                            }
                        } else {
                            console.log(`Review selector "${reviewSelector}" found no element`);
                        }
                    }

                    console.log(`REVIEW COUNT CHECK: reviewCount=${reviewCount}, valid=${reviewCount > 0}`);

                    // Strict validation: Skip if no valid review count (from Supabase function logic)
                    if (reviewCount === 0) {
                        console.log(`❌ SKIPPING ELEMENT ${index}: No valid review count found. Review count: ${reviewCount}`);
                        return;
                    }

                    // Enhanced price extraction with validation (from Supabase function)
                    const priceSelectors = [
                        '.price', '.gig-price',
                        '[data-price]', '.price-wrapper',
                        '.starting-at', '.price-display',
                        '[class*="price"]',
                        '.package-price'
                    ];
                    
                    let price = '';
                    console.log('Trying to extract price...');
                    for (const priceSelector of priceSelectors) {
                        const priceElement = gigElement.querySelector(priceSelector);
                        if (priceElement) {
                            const priceText = priceElement.textContent?.trim() || '';
                            console.log(`Price selector "${priceSelector}" found text: "${priceText}"`);
                            if (priceText && (priceText.includes('$') || priceText.includes('€') || priceText.includes('£'))) {
                                // Extract price number and validate
                                const priceMatch = priceText.match(/[\$€£](\d+)/);
                                if (priceMatch) {
                                    const priceNum = parseInt(priceMatch[1]);
                                    console.log(`Parsed price number: ${priceNum}`);
                                    if (priceNum > 0 && priceNum < 10000) { // Reasonable price range
                                        price = priceText.includes('From') ? priceText : `From ${priceText}`;
                                        console.log(`Valid price found: "${price}"`);
                                        break;
                                    } else {
                                        console.log(`Price ${priceNum} is out of valid range (1-10000)`);
                                    }
                                } else {
                                    console.log(`No price number found in text: "${priceText}"`);
                                }
                            } else {
                                console.log(`Price text doesn't contain currency symbols: "${priceText}"`);
                            }
                        } else {
                            console.log(`Price selector "${priceSelector}" found no element`);
                        }
                    }

                    console.log(`PRICE CHECK: price="${price}", valid=${!!price}`);

                    // Strict validation: Skip if no valid price (from Supabase function logic)
                    if (!price) {
                        console.log(`❌ SKIPPING ELEMENT ${index}: No valid price found. Price: "${price}"`);
                        return;
                    }

                    // Enhanced seller extraction with validation (from Supabase function)
                    const sellerSelectors = [
                        '.seller-name', '.username',
                        '[data-seller]', '.seller-info .name',
                        '.seller-link', '[class*="seller"]',
                        '.user-name', '.profile-name'
                    ];
                    
                    let seller = '';
                    console.log('Trying to extract seller...');
                    for (const sellerSelector of sellerSelectors) {
                        const sellerElement = gigElement.querySelector(sellerSelector);
                        if (sellerElement) {
                            const sellerText = sellerElement.textContent?.trim() || '';
                            console.log(`Seller selector "${sellerSelector}" found text: "${sellerText}"`);
                            if (sellerText && sellerText.length > 1 && sellerText.length < 50) {
                                seller = cleanText(sellerText);
                                console.log(`Valid seller found: "${seller}"`);
                                break;
                            } else {
                                console.log(`Seller text invalid length: "${sellerText}" (length: ${sellerText.length})`);
                            }
                        } else {
                            console.log(`Seller selector "${sellerSelector}" found no element`);
                        }
                    }
                    
                    console.log(`SELLER CHECK: seller="${seller}", valid=${!!seller}`);
                    
                    // Strict validation: Skip if no valid seller (from Supabase function logic)
                    if (!seller) {
                        console.log(`❌ SKIPPING ELEMENT ${index}: No valid seller found. Seller: "${seller}"`);
                        return;
                    }
                    
                    // Extract seller level with fallback
                    const levelSelectors = [
                        '.seller-level', '[data-seller-level]',
                        '[class*="level"]', '.badge',
                        '.seller-badge'
                    ];
                    
                    let sellerLevel = 'Level 1'; // Default fallback
                    console.log('Trying to extract seller level...');
                    for (const levelSelector of levelSelectors) {
                        const levelElement = gigElement.querySelector(levelSelector);
                        if (levelElement) {
                            const levelText = levelElement.textContent?.trim() || '';
                            console.log(`Level selector "${levelSelector}" found text: "${levelText}"`);
                            if (levelText && (levelText.includes('Level') || levelText.includes('Pro') || levelText.includes('Top'))) {
                                sellerLevel = cleanText(levelText);
                                console.log(`Valid seller level found: "${sellerLevel}"`);
                                break;
                            }
                        } else {
                            console.log(`Level selector "${levelSelector}" found no element`);
                        }
                    }
                    console.log(`Using seller level: "${sellerLevel}"`);

                    // Enhanced thumbnail extraction with validation (from Supabase function)
                    const imgSelectors = [
                        'img[src]',
                        'img[data-src]',
                        'img[data-lazy-src]',
                        '[style*="background-image"]'
                    ];
                    
                    let thumbnail = '';
                    console.log('Trying to extract thumbnail...');
                    for (const imgSelector of imgSelectors) {
                        const imgElement = gigElement.querySelector(imgSelector);
                        if (imgElement) {
                            let imgUrl = imgElement.getAttribute('src') || 
                                        imgElement.getAttribute('data-src') || 
                                        imgElement.getAttribute('data-lazy-src') || '';
                            
                            console.log(`Image selector "${imgSelector}" found URL: "${imgUrl}"`);
                            
                            // Try background image if no src found
                            if (!imgUrl && imgElement.getAttribute('style')) {
                                const styleMatch = imgElement.getAttribute('style')?.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/);
                                if (styleMatch) {
                                    imgUrl = styleMatch[1];
                                    console.log(`Found background image URL: "${imgUrl}"`);
                                }
                            }
                            
                            if (imgUrl && (imgUrl.startsWith('http') || imgUrl.startsWith('//'))) {
                                thumbnail = imgUrl.startsWith('http') ? imgUrl : `https:${imgUrl}`;
                                console.log(`Valid thumbnail found: "${thumbnail}"`);
                                break;
                            } else {
                                console.log(`Invalid image URL: "${imgUrl}"`);
                            }
                        } else {
                            console.log(`Image selector "${imgSelector}" found no element`);
                        }
                    }

                    console.log(`THUMBNAIL CHECK: thumbnail="${thumbnail}", valid=${!!thumbnail}`);

                    // Strict validation: Skip if no valid thumbnail (from Supabase function logic)
                    if (!thumbnail) {
                        console.log(`❌ SKIPPING ELEMENT ${index}: No valid thumbnail found. Thumbnail: "${thumbnail}"`);
                        return;
                    }

                    // Generate ID
                    const gigId = gigElement.getAttribute('data-gig-id') || 
                                 gigElement.getAttribute('data-gig') || 
                                 `gig-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;

                    // Generate tags using the helper function
                    const tags = generateTags(title, keyword);

                    console.log(`✅ SUCCESSFULLY EXTRACTED GIG ${index}:`);
                    console.log(`  - ID: ${gigId}`);
                    console.log(`  - Title: "${title}"`);
                    console.log(`  - Link: "${link}"`);
                    console.log(`  - Rating: ${rating}`);
                    console.log(`  - Review Count: ${reviewCount}`);
                    console.log(`  - Price: "${price}"`);
                    console.log(`  - Seller: "${seller}"`);
                    console.log(`  - Seller Level: "${sellerLevel}"`);
                    console.log(`  - Thumbnail: "${thumbnail}"`);
                    console.log(`  - Tags: [${tags.join(', ')}]`);

                    extractedGigs.push({
                        id: gigId,
                        title,
                        link: link.startsWith('http') ? link : `https://www.fiverr.com${link}`,
                        rating,
                        reviewCount,
                        price,
                        seller,
                        sellerLevel,
                        thumbnail,
                        tags
                    });
                    
                } catch (error) {
                    console.log(`❌ ERROR extracting gig data for element ${index}:`, error);
                }
            });

            console.log(`\n=== EXTRACTION COMPLETE ===`);
            console.log(`Total extracted gigs: ${extractedGigs.length}`);
            console.log('=== END GIG EXTRACTION DEBUG ===\n');
            return extractedGigs;
        }, workingSelector, inputParams.keyword);

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
                await page.waitForTimeout(Math.random() * 8000 + 5000);
                
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