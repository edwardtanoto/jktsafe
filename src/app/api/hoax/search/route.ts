import { NextRequest, NextResponse } from 'next/server';
import { hoaxProcessor } from '@/lib/hoax-data-processor';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import OpenAI from 'openai';

// Rate limiting
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 requests per minute
});

// OpenAI for query embedding generation
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY
});

interface SearchRequest {
  query: string;
  category?: 'SALAH' | 'PENIPUAN';
  limit?: number;
  includeEmbeddings?: boolean;
}

interface HoaxSearchResult {
  id: string;
  title: string;
  originalClaim: string;
  hoaxCategory: string;
  verificationMethod: string;
  investigationResult: string;
  authorName: string;
  sourceUrl: string;
  publicationDate: Date;
  similarity?: number;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') || 'anonymous';
    const { success } = await ratelimit.limit(`${ip}:hoax_search`);

    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    const body: SearchRequest = await request.json();
    const { query, category, limit = 5 } = body;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'Query must be at least 2 characters long' },
        { status: 400 }
      );
    }

    if (limit > 20) {
      return NextResponse.json(
        { success: false, error: 'Limit cannot exceed 20' },
        { status: 400 }
      );
    }

    console.log(`Searching hoaxes for query: "${query}"${category ? ` (category: ${category})` : ''}`);

    // Generate embedding for the query
    const queryEmbedding = await generateQueryEmbedding(query);
    if (!queryEmbedding) {
      console.warn('Failed to generate embedding, falling back to keyword search');
      // Fallback to keyword search
      return await performKeywordSearch(query, category, limit);
    }

    // Perform vector similarity search
    const similarHoaxes = await hoaxProcessor.findSimilarHoaxes(queryEmbedding, limit);

    if (similarHoaxes.length === 0) {
      // Fallback to keyword search if vector search returns nothing
      console.log('Vector search returned no results, trying keyword search');
      return await performKeywordSearch(query, category, limit);
    }

    // Format results
    const results: HoaxSearchResult[] = similarHoaxes.map((hoax, index) => ({
      id: hoax.id,
      title: hoax.title,
      originalClaim: hoax.originalClaim || '',
      hoaxCategory: hoax.hoaxCategory,
      verificationMethod: hoax.verificationMethod || '',
      investigationResult: hoax.investigationResult || '',
      authorName: hoax.authorName || 'Unknown',
      sourceUrl: hoax.sourceUrl,
      publicationDate: hoax.publicationDate,
      similarity: calculateSimilarityScore(queryEmbedding, hoax.embedding as number[] | null, index)
    }));

    // Filter by category if specified
    const filteredResults = category
      ? results.filter(result => result.hoaxCategory === category)
      : results;

    // Cache the search results for 10 minutes
    const cacheKey = `hoax:search:${Buffer.from(query.toLowerCase()).toString('base64')}`;
    await redis.set(cacheKey, JSON.stringify(filteredResults), { ex: 600 });

    console.log(`Found ${filteredResults.length} hoax results for query: "${query}"`);

    return NextResponse.json({
      success: true,
      query,
      results: filteredResults,
      total: filteredResults.length,
      searchMethod: 'vector_similarity',
      cached: false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Hoax search API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

async function performKeywordSearch(query: string, category?: string, limit: number = 5) {
  try {
    // Extract keywords from query
    const keywords = extractKeywords(query);

    // Perform keyword-based search
    const keywordResults = await hoaxProcessor.searchByKeywords(keywords, category, limit);

    const results: HoaxSearchResult[] = keywordResults.map(hoax => ({
      id: hoax.id,
      title: hoax.title,
      originalClaim: hoax.originalClaim || '',
      hoaxCategory: hoax.hoaxCategory,
      verificationMethod: hoax.verificationMethod || '',
      investigationResult: hoax.investigationResult || '',
      authorName: hoax.authorName || 'Unknown',
      sourceUrl: hoax.sourceUrl,
      publicationDate: hoax.publicationDate
    }));

    return NextResponse.json({
      success: true,
      query,
      results,
      total: results.length,
      searchMethod: 'keyword_fallback',
      cached: false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Keyword search fallback failed:', error);
    return NextResponse.json({
      success: true,
      query,
      results: [],
      total: 0,
      searchMethod: 'failed',
      cached: false,
      message: 'No results found',
      timestamp: new Date().toISOString()
    });
  }
}

async function generateQueryEmbedding(query: string): Promise<number[] | null> {
  try {
    // Enhance query for better embedding results
    const enhancedQuery = enhanceQueryForEmbedding(query);

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: enhancedQuery,
      encoding_format: "float"
    });

    return response.data[0].embedding;

  } catch (error) {
    console.error('Error generating query embedding:', error);
    return null;
  }
}

function enhanceQueryForEmbedding(query: string): string {
  // Add context keywords to improve embedding matching
  const queryLower = query.toLowerCase();

  // Detect hoax-related keywords and enhance the query
  const hoaxKeywords = ['hoax', 'bohong', 'palsu', 'penipuan', 'scam', 'turnbackhoax', 'cek fakta'];
  const hasHoaxKeyword = hoaxKeywords.some(keyword => queryLower.includes(keyword));

  if (hasHoaxKeyword) {
    return query;
  }

  // Add hoax context for better matching
  return `${query} hoax fact check verification`;
}

function extractKeywords(query: string): string[] {
  // Remove common stop words and split into keywords
  const stopWords = ['yang', 'dan', 'atau', 'dengan', 'di', 'ke', 'dari', 'pada', 'untuk', 'adalah'];

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word))
    .slice(0, 10); // Limit to 10 keywords
}

function calculateSimilarityScore(queryEmbedding: number[], hoaxEmbedding: number[] | null, index: number): number {
  if (!hoaxEmbedding) return 0.5; // Default similarity for items without embeddings

  try {
    // Since we're using JSONB arrays, we need to access them as arrays
    if (Array.isArray(hoaxEmbedding)) {
      // Calculate cosine similarity
      let dotProduct = 0;
      let queryMagnitude = 0;
      let hoaxMagnitude = 0;

      for (let i = 0; i < Math.min(queryEmbedding.length, hoaxEmbedding.length); i++) {
        dotProduct += queryEmbedding[i] * hoaxEmbedding[i];
        queryMagnitude += queryEmbedding[i] * queryEmbedding[i];
        hoaxMagnitude += hoaxEmbedding[i] * hoaxEmbedding[i];
      }

      const similarity = dotProduct / (Math.sqrt(queryMagnitude) * Math.sqrt(hoaxMagnitude));

      // Adjust similarity based on position (earlier results are more similar)
      return Math.max(0.1, Math.min(0.95, similarity - (index * 0.05)));
    }

    return 0.5; // Default if embedding format is unexpected

  } catch (error) {
    console.warn('Error calculating similarity score:', error);
    return 0.5;
  }
}

// GET endpoint for statistics and health check
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'stats') {
      const stats = await hoaxProcessor.getStats();

      return NextResponse.json({
        success: true,
        stats,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'categories') {
      const categories = ['SALAH', 'PENIPUAN'];

      // Get count for each category
      const categoryCounts: Record<string, number> = {};
      for (const category of categories) {
        const cacheKey = `hoax:stats:category:${category}`;
        const count = await redis.get(cacheKey);
        categoryCounts[category] = parseInt(String(count || '0'));
      }

      return NextResponse.json({
        success: true,
        categories,
        counts: categoryCounts,
        timestamp: new Date().toISOString()
      });
    }

    // Default: Return API info
    return NextResponse.json({
      success: true,
      message: 'Hoax Search API',
      endpoints: {
        'POST /api/hoax/search': 'Search hoaxes using vector similarity or keywords',
        'GET /api/hoax/search?action=stats': 'Get hoax database statistics',
        'GET /api/hoax/search?action=categories': 'Get available hoax categories'
      },
      parameters: {
        query: 'Search query (required, min 2 characters)',
        category: 'Filter by category: SALAH or PENIPUAN (optional)',
        limit: 'Maximum results (optional, default 5, max 20)',
        includeEmbeddings: 'Include embedding data (optional, default false)'
      },
      rateLimit: '100 requests per minute'
    });

  } catch (error) {
    console.error('Hoax search GET error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
