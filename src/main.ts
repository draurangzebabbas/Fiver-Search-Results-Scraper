/**
 * Fiverr Scraper Actor
 * Scrapes Fiverr gigs based on search criteria and filters
 */

import { Actor } from 'apify';
import { launchOptions as camoufoxLaunchOptions } from 'camoufox-js';
import { PlaywrightCrawler, Dataset } from 'crawlee';
import { firefox } from 'playwright';

import { router } from './routes.js';

interface Input {
    keyword: string;
    minReviews?: number;
    maxReviews?: number;
    pages?: number;
    sortBy?: 'relevance' | 'rating' | 'reviews' | 'price_low' | 'price_high';
}

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

interface ScraperOutput {
    gigs: Gig[];
    totalResults: number;
    success: boolean;
    error?: string;
    message: string;
}

// Initialize the Apify SDK
await Actor.init();

try {
    // Structure of input is defined in input_schema.json
    const input = await Actor.getInput<Input>();
    
    if (!input || !input.keyword) {
        throw new Error('Keyword is required');
    }

    const {
        keyword,
        minReviews = 0,
        maxReviews,
        pages = 1,
        sortBy = 'relevance'
    } = input;

    console.log(`Starting Fiverr scraper with keyword: "${keyword}"`);
    console.log(`Pages to scrape: ${pages}, Sort by: ${sortBy}`);
    console.log(`Review filters - Min: ${minReviews}, Max: ${maxReviews || 'unlimited'}`);

    // Store input parameters in Actor's key-value store for access in routes
    await Actor.setValue('INPUT_PARAMS', {
        keyword,
        minReviews,
        maxReviews,
        pages,
        sortBy
    });

    const proxyConfiguration = await Actor.createProxyConfiguration();

    // Construct Fiverr search URL
    const sortMapping = {
        'relevance': '',
        'rating': '&rating=4',
        'reviews': '&sort=reviews',
        'price_low': '&sort=price',
        'price_high': '&sort=price_desc'
    };

    const searchUrl = `https://www.fiverr.com/search/gigs?query=${encodeURIComponent(keyword)}${sortMapping[sortBy]}`;
    console.log(`Search URL: ${searchUrl}`);
    
    const startUrls = [{ url: searchUrl, label: 'search_results' }];

    const crawler = new PlaywrightCrawler({
        proxyConfiguration,
        maxRequestsPerCrawl: pages * 10, // Allow for pagination and potential retries
        requestHandler: router,
        launchContext: {
            launcher: firefox,
            launchOptions: await camoufoxLaunchOptions({
                headless: true,
                proxy: await proxyConfiguration?.newUrl(),
                geoip: true,
                // Enhanced stealth options
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-features=TranslateUI',
                    '--disable-ipc-flooding-protection',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-images',
                    '--disable-javascript',
                    '--disable-default-apps',
                    '--disable-sync',
                    '--disable-translate',
                    '--hide-scrollbars',
                    '--mute-audio',
                    '--no-default-browser-check',
                    '--no-first-run',
                    '--disable-logging',
                    '--disable-permissions-api',
                    '--disable-presentation-api',
                    '--disable-print-preview',
                    '--disable-speech-api',
                    '--disable-file-system',
                    '--disable-sensors',
                    '--disable-geolocation',
                    '--disable-notifications'
                ],
            }),
        },
        // Enhanced settings for stealth - removed duplicate maxConcurrency
        maxConcurrency: 1,
        requestHandlerTimeoutSecs: 180, // Increased timeout
        navigationTimeoutSecs: 90,
        // Add session pool for better request management
        sessionPoolOptions: {
            maxPoolSize: 20,
            sessionOptions: {
                maxUsageCount: 30,
            },
        },
        // Add retry logic
        maxRequestRetries: 8,
        // Add delays between requests
        minConcurrency: 1,
    });

    await crawler.run(startUrls);

    // Retrieve scraped data from dataset
    const dataset = await Dataset.open();
    const { items } = await dataset.getData();
    
    // Cast the items to Gig[] type since we know the structure from our scraping
    const gigs = items as Gig[];

    console.log(`Total gigs retrieved from dataset: ${gigs.length}`);

    // Apply review count filters
    const filteredGigs = gigs.filter((gig: Gig) => {
        const reviewCount = gig.reviewCount || 0;
        if (reviewCount < minReviews) return false;
        if (maxReviews && reviewCount > maxReviews) return false;
        return true;
    });

    console.log(`Gigs after filtering: ${filteredGigs.length}`);

    // Debug: Log details of first few gigs
    if (filteredGigs.length > 0) {
        console.log('Sample gig data:');
        filteredGigs.slice(0, 3).forEach((gig: Gig, index: number) => {
            console.log(`Gig ${index + 1}:`, {
                title: gig.title?.substring(0, 50) + '...',
                rating: gig.rating,
                reviewCount: gig.reviewCount,
                price: gig.price,
                seller: gig.seller
            });
        });
    }

    const output: ScraperOutput = {
        gigs: filteredGigs,
        totalResults: filteredGigs.length,
        success: true,
        message: `Successfully scraped ${filteredGigs.length} gigs for keyword "${keyword}"`
    };

    console.log(`Scraping completed successfully. Found ${filteredGigs.length} gigs.`);
    
    // Save the final output
    await Actor.setValue('OUTPUT', output);

} catch (error) {
    console.error('Error during scraping:', error);
    
    const errorOutput: ScraperOutput = {
        gigs: [],
        totalResults: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        message: 'Scraping failed due to an error'
    };
    
    await Actor.setValue('OUTPUT', errorOutput);
}

// Exit successfully
await Actor.exit();