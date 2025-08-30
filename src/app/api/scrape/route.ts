import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractLocationFromArticle } from '../../../lib/azure-openai';
import { geocodeLocation } from '../../../lib/mapbox-geocoding';
import { prisma } from '../../../lib/prisma';

interface Article {
  title: string;
  description: string;
  url: string;
}

async function scrapeKompas(): Promise<Article[]> {
  try {
    const response = await axios.get('https://www.kompas.com/', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const articles: Article[] = [];

    // Scrape latest news articles
    $('.article__list, .article__item').each((index, element) => {
      if (articles.length >= 10) return false; // Limit to 10 articles

      const $element = $(element);
      const title = $element.find('h2, .article__title').text().trim();
      const description = $element.find('p, .article__summary').text().trim();
      const url = $element.find('a').attr('href');

      if (title && description && url && url.includes('kompas.com')) {
        // Filter for potentially relevant articles (containing keywords related to riots/unrest)
        const content = (title + description).toLowerCase();
        if (content.includes('kerusuhan') || content.includes('demo') || content.includes('unjuk rasa') ||
            content.includes('bentrok') || content.includes('rusak') || content.includes('api')) {
          articles.push({
            title,
            description,
            url
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

async function scrapeDetik(): Promise<Article[]> {
  try {
    const response = await axios.get('https://www.detik.com/', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const articles: Article[] = [];

    // Scrape latest news articles
    $('.article, .list-content__item').each((index, element) => {
      if (articles.length >= 10) return false; // Limit to 10 articles

      const $element = $(element);
      const title = $element.find('h3, .title, .article__title').text().trim();
      const description = $element.find('p, .desc, .article__summary').text().trim();
      const url = $element.find('a').attr('href');

      if (title && description && url && url.includes('detik.com')) {
        // Filter for potentially relevant articles
        const content = (title + description).toLowerCase();
        if (content.includes('kerusuhan') || content.includes('demo') || content.includes('unjuk rasa') ||
            content.includes('bentrok') || content.includes('rusak') || content.includes('api')) {
          articles.push({
            title,
            description,
            url
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

async function processArticle(article: Article, source: string): Promise<boolean> {
  try {
    // Extract location using Azure OpenAI
    const locationResult = await extractLocationFromArticle(article.title, article.description);

    if (!locationResult.success || !locationResult.location) {
      console.log(`No location found for article: ${article.title}`);
      return false;
    }

    // Geocode the location
    const geocodeResult = await geocodeLocation(locationResult.location);

    if (!geocodeResult.success) {
      console.log(`Failed to geocode location ${locationResult.location} for article: ${article.title}`);
      return false;
    }

    // Check if event already exists (avoid duplicates)
    const existingEvent = await prisma.event.findFirst({
      where: {
        title: article.title,
        url: article.url
      }
    });

    if (existingEvent) {
      console.log(`Event already exists: ${article.title}`);
      return false;
    }

    // Save to database
    await prisma.event.create({
      data: {
        title: article.title,
        description: article.description,
        lat: geocodeResult.lat,
        lng: geocodeResult.lng,
        source,
        url: article.url,
        verified: true,
        type: 'riot'
      }
    });

    console.log(`Successfully processed article: ${article.title} -> ${locationResult.location} (${geocodeResult.lat}, ${geocodeResult.lng})`);
    return true;

  } catch (error) {
    console.error(`Error processing article ${article.title}:`, error);
    return false;
  }
}

// DISABLED: News scraping is now handled by TikTok scraping only
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  return NextResponse.json({
    success: false,
    message: 'News scraping is disabled. Using TikTok scraping instead.',
    redirect: '/api/scrape/tiktok'
  });
}

// Original news scraping function (disabled)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function DISABLED_getNewsScraping(_request: NextRequest) {
  try {
    // Scrape from both sources concurrently
    const [kompasArticles, detikArticles] = await Promise.all([
      scrapeKompas(),
      scrapeDetik()
    ]);

    const allArticles = [...kompasArticles, ...detikArticles];
    let processedCount = 0;
    let errorCount = 0;

    // Process each article sequentially to avoid rate limits
    for (const article of allArticles) {
      const source = article.url.includes('kompas.com') ? 'Kompas' : 'Detik';

      try {
        const success = await processArticle(article, source);
        if (success) {
          processedCount++;
        }
      } catch (error) {
        console.error(`Failed to process article: ${article.title}`, error);
        errorCount++;
      }

      // Small delay between API calls to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return NextResponse.json({
      success: true,
      articles: allArticles.length,
      processed: processedCount,
      errors: errorCount,
      sources: {
        kompas: kompasArticles.length,
        detik: detikArticles.length
      }
    });
  } catch (error) {
    console.error('Error in scrape API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to scrape and process articles' },
      { status: 500 }
    );
  }
}
