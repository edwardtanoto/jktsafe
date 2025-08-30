/**
 * Article Processor with Queue System
 * Handles AI location extraction, geocoding, and database storage
 */

import { Env } from '../index';
import { UnifiedArticle } from '../scrapers/newsScraper';
import { extractLocationFromArticle } from './azureOpenAIProcessor';
import { geocodeLocation } from './mapboxProcessor';
import { saveEventToDatabase } from './databaseProcessor';

export interface ProcessingResult {
	processed: number;
	errors: number;
	skipped: number;
}

class ArticleQueue {
	private queue: UnifiedArticle[] = [];
	private processing = false;
	private batchSize = 5; // Process 5 articles at a time to manage rate limits

	async addArticles(articles: UnifiedArticle[]): Promise<void> {
		this.queue.push(...articles);
		console.log(`📋 Added ${articles.length} articles to queue (total: ${this.queue.length})`);
	}

	async processQueue(env: Env): Promise<ProcessingResult> {
		if (this.processing) {
			console.log('⚠️ Queue already processing, skipping');
			return { processed: 0, errors: 0, skipped: this.queue.length };
		}

		this.processing = true;
		let processed = 0;
		let errors = 0;

		try {
			console.log(`🚀 Starting queue processing (${this.queue.length} articles)`);

			// Process articles in batches
			while (this.queue.length > 0) {
				const batch = this.queue.splice(0, this.batchSize);
				console.log(`📦 Processing batch of ${batch.length} articles`);

				// Process batch in parallel
				const batchPromises = batch.map(article => this.processArticle(article, env));
				const batchResults = await Promise.allSettled(batchPromises);

				// Count results
				for (const result of batchResults) {
					if (result.status === 'fulfilled') {
						if (result.value) {
							processed++;
						}
					} else {
						errors++;
						console.error('❌ Batch processing error:', result.reason);
					}
				}

				// Rate limiting delay between batches
				if (this.queue.length > 0) {
					console.log('⏳ Rate limiting: waiting 10 seconds before next batch');
					await new Promise(resolve => setTimeout(resolve, 10000));
				}
			}

			console.log(`✅ Queue processing completed: ${processed} processed, ${errors} errors`);

		} catch (error) {
			console.error('❌ Queue processing failed:', error);
			errors += this.queue.length;
		} finally {
			this.processing = false;
		}

		return { processed, errors, skipped: 0 };
	}

	private async processArticle(article: UnifiedArticle, env: Env): Promise<boolean> {
		try {
			console.log(`🔍 Processing: ${article.title.substring(0, 50)}...`);

			// Step 1: Extract location using Azure OpenAI
			const locationResult = await extractLocationFromArticle(
				article.title,
				article.description,
				env
			);

			if (!locationResult.success || !locationResult.location) {
				console.log(`⚠️ No location found for article: ${article.title}`);
				return false;
			}

			// Step 2: Geocode the location
			const geocodeResult = await geocodeLocation(locationResult.location, env);

			if (!geocodeResult.success) {
				console.log(`⚠️ Failed to geocode location ${locationResult.location}`);
				return false;
			}

			// Step 3: Save to database
			const saveResult = await saveEventToDatabase({
				title: article.title,
				description: article.description,
				lat: geocodeResult.lat,
				lng: geocodeResult.lng,
				source: article.source,
				url: article.url,
				verified: true,
				type: 'riot'
			}, env);

			if (saveResult) {
				console.log(`✅ Successfully processed: ${article.title} -> ${locationResult.location}`);
				return true;
			} else {
				console.log(`⚠️ Failed to save article: ${article.title}`);
				return false;
			}

		} catch (error) {
			console.error(`❌ Error processing article ${article.title}:`, error);
			return false;
		}
	}
}

// Global queue instance
const articleQueue = new ArticleQueue();

export async function processArticles(articles: UnifiedArticle[], env: Env): Promise<ProcessingResult> {
	console.log(`📋 Adding ${articles.length} articles to processing queue`);

	await articleQueue.addArticles(articles);
	return await articleQueue.processQueue(env);
}
