import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

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
        // Filter for potentially relevant articles (containing keywords related to protests/unrest)
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
