/**
 * Traditional Web Scraping for Indonesian News Sites
 * Adapted for Cloudflare Workers environment
 */

import * as cheerio from 'cheerio';

export interface ScrapedArticle {
	title: string;
	description: string;
	url: string;
	source: string;
}

export async function scrapeKompas(): Promise<ScrapedArticle[]> {
	try {
		const response = await fetch('https://www.kompas.com/', {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
			}
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const html = await response.text();
		const $ = cheerio.load(html);
		const articles: ScrapedArticle[] = [];

		// Scrape latest news articles
		$('.article__list, .article__item, .most__list').each((index, element) => {
			if (articles.length >= 15) return false; // Limit to avoid rate limits

			const $element = $(element);
			const title = $element.find('h2, .article__title, .most__title').text().trim();
			const description = $element.find('p, .article__summary, .most__desc').text().trim();
			const url = $element.find('a').attr('href');

			if (title && url && url.includes('kompas.com')) {
				// Filter for potentially relevant articles
				const content = (title + ' ' + description).toLowerCase();
				if (content.includes('kerusuhan') || content.includes('demo') ||
					content.includes('unjuk rasa') || content.includes('bentrok') ||
					content.includes('protes') || content.includes('rusak')) {

					articles.push({
						title,
						description: description || title.substring(0, 150) + '...',
						url: url.startsWith('http') ? url : 'https://www.kompas.com' + url,
						source: 'Kompas'
					});
				}
			}
		});

		return articles;
	} catch (error) {
		console.error('Error scraping Kompas:', error);
		return [];
	}
}

export async function scrapeDetik(): Promise<ScrapedArticle[]> {
	try {
		const response = await fetch('https://www.detik.com/', {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
			}
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const html = await response.text();
		const $ = cheerio.load(html);
		const articles: ScrapedArticle[] = [];

		// Scrape latest news articles
		$('.article, .list-content__item, .media__link').each((index, element) => {
			if (articles.length >= 15) return false; // Limit to avoid rate limits

			const $element = $(element);
			const title = $element.find('h3, .title, .article__title, .media__title').text().trim();
			const description = $element.find('p, .desc, .article__summary').text().trim();
			const url = $element.find('a').attr('href');

			if (title && url && url.includes('detik.com')) {
				// Filter for potentially relevant articles
				const content = (title + ' ' + description).toLowerCase();
				if (content.includes('kerusuhan') || content.includes('demo') ||
					content.includes('unjuk rasa') || content.includes('bentrok') ||
					content.includes('protes') || content.includes('rusak')) {

					articles.push({
						title,
						description: description || title.substring(0, 150) + '...',
						url: url.startsWith('http') ? url : 'https://www.detik.com' + url,
						source: 'Detik'
					});
				}
			}
		});

		return articles;
	} catch (error) {
		console.error('Error scraping Detik:', error);
		return [];
	}
}

export async function scrapeAllTraditional(): Promise<ScrapedArticle[]> {
	console.log('🔍 Starting traditional web scraping...');

	const [kompasArticles, detikArticles] = await Promise.all([
		scrapeKompas(),
		scrapeDetik()
	]);

	const allArticles = [...kompasArticles, ...detikArticles];

	// Remove duplicates based on URL
	const uniqueArticles = allArticles.filter((article, index, self) =>
		index === self.findIndex(a => a.url === article.url)
	);

	console.log(`📄 Scraped ${uniqueArticles.length} articles from traditional sources (${kompasArticles.length} Kompas, ${detikArticles.length} Detik)`);

	return uniqueArticles;
}
