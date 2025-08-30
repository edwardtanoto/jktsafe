/**
 * Riot Signal News Scraper - Cloudflare Worker
 *
 * Runs every 30 minutes to scrape news articles, extract locations using AI,
 * geocode them, and save to the main application database.
 */

import { scrapeNews } from './scrapers/newsScraper';
import { processArticles } from './processors/articleProcessor';

export interface Env {
	MAIN_APP_URL: string;
	AZURE_OPENAI_API_KEY: string;
	AZURE_OPENAI_ENDPOINT: string;
	AZURE_OPENAI_DEPLOYMENT: string;
	MAPBOX_ACCESS_TOKEN: string;
	GOOGLE_NEWS_API_KEY?: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		switch (url.pathname) {
			case '/health':
				return new Response(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }), {
					headers: { 'Content-Type': 'application/json' }
				});

			case '/manual-trigger':
				// Allow manual triggering for testing
				ctx.waitUntil(runScrapingProcess(env));
				return new Response(JSON.stringify({ status: 'scraping_started' }), {
					headers: { 'Content-Type': 'application/json' }
				});

			default:
				return new Response('Not Found', { status: 404 });
		}
	},

	// Cron trigger - runs every 30 minutes
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		console.log(`Cron triggered at: ${new Date().toISOString()}`);
		ctx.waitUntil(runScrapingProcess(env));
	},
} satisfies ExportedHandler<Env>;

async function runScrapingProcess(env: Env): Promise<void> {
	try {
		console.log('🚀 Starting news scraping process...');

		// Step 1: Scrape articles from multiple sources
		const articles = await scrapeNews(env);
		console.log(`📄 Scraped ${articles.length} articles`);

		if (articles.length === 0) {
			console.log('❌ No articles found');
			return;
		}

		// Step 2: Process articles (AI location extraction, geocoding, save to DB)
		const results = await processArticles(articles, env);
		console.log(`✅ Processed ${results.processed} articles, ${results.errors} errors`);

		console.log('🎉 Scraping process completed successfully');

	} catch (error) {
		console.error('❌ Error in scraping process:', error);
		// Could add error reporting/notification here
	}
}
