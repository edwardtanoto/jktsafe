import { PrismaClient, HoaxFactCheck as PrismaHoaxFactCheck } from '@prisma/client';
import { Redis } from '@upstash/redis';
import OpenAI from 'openai';
import { createHash } from 'crypto';
import type { HoaxFactCheck } from './hoax-content-parser';

interface ProcessingResult {
  success: boolean;
  hoaxId?: string;
  error?: string;
  embeddingGenerated: boolean;
}

export class HoaxDataProcessor {
  private prisma: PrismaClient;
  private redis: Redis;
  private openai: OpenAI;

  constructor() {
    this.prisma = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL,
    });

    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!
    });

    this.openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY
    });
  }

  async processAndStore(hoaxData: HoaxFactCheck): Promise<ProcessingResult> {
    try {
      // Check if hoax already exists using Upstash cache
      const cacheKey = `hoax:${hoaxData.guid}`;
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        console.log(`Hoax ${hoaxData.guid} already processed`);
        return {
          success: true,
          hoaxId: (cached as Record<string, unknown>).id as number,
          embeddingGenerated: true
        };
      }

      // Check embedding budget before generating
      const canGenerateEmbedding = await this.checkEmbeddingBudget();
      const embedding = canGenerateEmbedding ? await this.generateEmbedding(hoaxData) : null;

      if (!canGenerateEmbedding) {
        console.log(`💰 Embedding budget exceeded for hoax: ${hoaxData.title}`);
      }

      // Store in Neon DB using transaction
      const result = await this.prisma.$transaction(async (tx) => {
        const stored = await tx.hoaxFactCheck.upsert({
          where: { rssGuid: hoaxData.guid },
          update: {
            title: hoaxData.title,
            originalClaim: hoaxData.originalClaim,
            hoaxCategory: hoaxData.category,
            verificationMethod: hoaxData.verificationMethod,
            investigationResult: hoaxData.investigationResult,
            authorName: hoaxData.author,
            sourceUrl: hoaxData.sourceUrl,
            publicationDate: hoaxData.publicationDate,
            contentHash: hoaxData.contentHash,
            embedding: embedding,
            updatedAt: new Date()
          },
          create: {
            rssGuid: hoaxData.guid,
            title: hoaxData.title,
            originalClaim: hoaxData.originalClaim,
            hoaxCategory: hoaxData.category,
            verificationMethod: hoaxData.verificationMethod,
            investigationResult: hoaxData.investigationResult,
            authorName: hoaxData.author,
            sourceUrl: hoaxData.sourceUrl,
            publicationDate: hoaxData.publicationDate,
            contentHash: hoaxData.contentHash,
            embedding: embedding
          }
        });

        return stored;
      });

      // Cache the result in Upstash
      await this.redis.set(cacheKey, JSON.stringify({
        id: result.id,
        processed: true,
        category: result.hoaxCategory
      }), { ex: 86400 }); // 24 hours

      // Update category statistics
      await this.updateCategoryStats(result.hoaxCategory);

      console.log(`Successfully processed hoax: ${result.title} (${result.hoaxCategory})`);

      return {
        success: true,
        hoaxId: result.id,
        embeddingGenerated: !!embedding
      };

    } catch (error) {
      console.error('Error processing hoax data:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown processing error',
        embeddingGenerated: false
      };
    }
  }

  private async generateEmbedding(hoaxData: HoaxFactCheck): Promise<number[] | null> {
    try {
      // Create searchable text from hoax data
      const searchableText = this.createSearchableText(hoaxData);

      // Generate embedding using OpenRouter
      const response = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: searchableText,
        encoding_format: "float"
      });

      const embedding = response.data[0].embedding;

      // Validate embedding dimensions (text-embedding-3-small = 1536 dimensions)
      if (!embedding || embedding.length !== 1536) {
        console.warn('Invalid embedding dimensions:', embedding?.length);
        return null;
      }

      // Track embedding usage
      await this.trackEmbeddingUsage();

      return embedding;

    } catch (error) {
      console.error('Error generating embedding:', error);

      // Track failed embedding attempt
      await this.redis.incr('embeddings:failed');

      // Return null on error - we'll still store the hoax without embedding
      // This allows the system to continue working even if embeddings fail
      return null;
    }
  }

  private async checkEmbeddingBudget(): Promise<boolean> {
    try {
      // Check daily embedding limit (adjust based on your OpenRouter plan)
      const today = new Date().toISOString().split('T')[0];
      const dailyKey = `embeddings:daily:${today}`;

      const dailyCount = await this.redis.get(dailyKey);
      const count = parseInt(dailyCount || '0');

      // Limit to 100 embeddings per day (adjust based on your needs/costs)
      const DAILY_LIMIT = parseInt(process.env.EMBEDDING_DAILY_LIMIT || '100');

      if (count >= DAILY_LIMIT) {
        console.log(`⚠️  Daily embedding limit reached (${count}/${DAILY_LIMIT})`);
        return false;
      }

      return true;

    } catch (error) {
      console.error('Error checking embedding budget:', error);
      // On error, allow embedding generation to avoid blocking functionality
      return true;
    }
  }

  private async trackEmbeddingUsage(): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dailyKey = `embeddings:daily:${today}`;

      await this.redis.incr(dailyKey);
      await this.redis.expire(dailyKey, 86400); // Expire in 24 hours

      // Track total embeddings generated
      await this.redis.incr('embeddings:total');

    } catch (error) {
      console.error('Error tracking embedding usage:', error);
    }
  }

  private createSearchableText(hoaxData: HoaxFactCheck): string {
    // Create comprehensive searchable text for vector similarity
    const parts = [
      hoaxData.title,
      hoaxData.originalClaim,
      hoaxData.verificationMethod,
      hoaxData.investigationResult,
      `Category: ${hoaxData.category}`,
      `Author: ${hoaxData.author}`
    ];

    // Clean and join
    return parts
      .filter(part => part && part.trim().length > 0)
      .map(part => part.trim())
      .join(' ')
      .substring(0, 8000); // Limit to avoid token limits
  }

  private async updateCategoryStats(category: string): Promise<void> {
    const statsKey = `hoax:stats:category:${category}`;
    await this.redis.incr(statsKey);

    // Also update global stats
    await this.redis.incr('hoax:stats:total');
  }

  // Vector similarity search using JSONB array similarity
  async findSimilarHoaxes(queryEmbedding: number[], limit: number = 5): Promise<PrismaHoaxFactCheck[]> {
    if (!queryEmbedding || queryEmbedding.length !== 1536) {
      console.warn('Invalid query embedding for search');
      return [];
    }

    try {
      // Get all hoax records with embeddings
      const allHoaxes = await this.prisma.hoaxFactCheck.findMany({
        where: {
          isActive: true,
          publicationDate: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        },
        select: {
          id: true,
          rssGuid: true,
          title: true,
          originalClaim: true,
          hoaxCategory: true,
          verificationMethod: true,
          investigationResult: true,
          authorName: true,
          sourceUrl: true,
          publicationDate: true,
          contentHash: true,
          processedAt: true,
          isActive: true,
          embedding: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // Filter hoaxes with embeddings
      const hoaxesWithEmbeddings = allHoaxes.filter(hoax => hoax.embedding);

      if (hoaxesWithEmbeddings.length === 0) {
        console.log('⚠️ No hoaxes with embeddings found');
        return [];
      }

      // Calculate similarity scores using dot product
      const results = hoaxesWithEmbeddings.map(hoax => {
        try {
          const hoaxEmbedding = JSON.parse(hoax.embedding!);
          if (!Array.isArray(hoaxEmbedding) || hoaxEmbedding.length !== queryEmbedding.length) {
            return null;
          }

          // Calculate dot product similarity
          let similarity = 0;
          for (let i = 0; i < queryEmbedding.length; i++) {
            similarity += queryEmbedding[i] * hoaxEmbedding[i];
          }

          return {
            ...hoax,
            similarity: similarity
          };
        } catch (error) {
          return null;
        }
      }).filter(result => result !== null) as (PrismaHoaxFactCheck & { similarity: number })[];

      // Sort by similarity and return top results
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

    } catch (error) {
      console.error('Error in vector similarity search:', error);
      // Fallback to basic search
      return this.fallbackSearch(limit);
    }
  }

  private async fallbackSearch(limit: number): Promise<PrismaHoaxFactCheck[]> {
    try {
      // Basic fallback search by recent hoaxes
      return await this.prisma.hoaxFactCheck.findMany({
        where: {
          isActive: true,
          publicationDate: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          }
        },
        orderBy: {
          publicationDate: 'desc'
        },
        take: limit
      });
    } catch (error) {
      console.error('Fallback search also failed:', error);
      return [];
    }
  }

  // Keyword-based search (complements vector search)
  async searchByKeywords(keywords: string[], category?: string, limit: number = 10): Promise<PrismaHoaxFactCheck[]> {
    try {
      const searchConditions = {
        AND: [
          { isActive: true },
          {
            OR: keywords.map(keyword => ({
              OR: [
                { title: { contains: keyword, mode: 'insensitive' } },
                { originalClaim: { contains: keyword, mode: 'insensitive' } },
                { investigationResult: { contains: keyword, mode: 'insensitive' } }
              ]
            }))
          }
        ]
      } as Record<string, unknown>;

      if (category) {
        searchConditions.AND.push({ hoaxCategory: category });
      }

      return await this.prisma.hoaxFactCheck.findMany({
        where: searchConditions,
        orderBy: {
          publicationDate: 'desc'
        },
        take: limit
      });

    } catch (error) {
      console.error('Keyword search error:', error);
      return [];
    }
  }

  // Batch processing for multiple hoaxes
  async processBatch(hoaxData: HoaxFactCheck[]): Promise<{
    successful: number;
    failed: number;
    results: ProcessingResult[];
  }> {
    const results: ProcessingResult[] = [];
    let successful = 0;
    let failed = 0;

    console.log(`Processing batch of ${hoaxData.length} hoaxes`);

    for (const hoax of hoaxData) {
      try {
        const result = await this.processAndStore(hoax);
        results.push(result);

        if (result.success) {
          successful++;
        } else {
          failed++;
        }

        // Small delay to prevent overwhelming the database
        await this.delay(100);

      } catch (error) {
        console.error(`Failed to process hoax ${hoax.guid}:`, error);
        failed++;
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Batch processing error',
          embeddingGenerated: false
        });
      }
    }

    console.log(`Batch processing complete: ${successful} successful, ${failed} failed`);
    return { successful, failed, results };
  }

  // Get hoax statistics
  async getStats(): Promise<{
    total: number;
    byCategory: Record<string, number>;
    recent: number; // Last 7 days
    withEmbeddings: number;
  }> {
    try {
      const [total, salahCount, penipuanCount, recent, withEmbeddings] = await Promise.all([
        this.prisma.hoaxFactCheck.count({ where: { isActive: true } }),
        this.prisma.hoaxFactCheck.count({ where: { hoaxCategory: 'SALAH', isActive: true } }),
        this.prisma.hoaxFactCheck.count({ where: { hoaxCategory: 'PENIPUAN', isActive: true } }),
        this.prisma.hoaxFactCheck.count({
          where: {
            isActive: true,
            publicationDate: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          }
        }),
        this.prisma.hoaxFactCheck.count({
          where: {
            isActive: true,
            embedding: { not: null }
          }
        })
      ]);

      return {
        total,
        byCategory: {
          SALAH: salahCount,
          PENIPUAN: penipuanCount
        },
        recent,
        withEmbeddings
      };

    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        total: 0,
        byCategory: { SALAH: 0, PENIPUAN: 0 },
        recent: 0,
        withEmbeddings: 0
      };
    }
  }

  // Cleanup old/inactive hoaxes
  async cleanupOldHoaxes(daysOld: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

      const result = await this.prisma.hoaxFactCheck.updateMany({
        where: {
          isActive: true,
          publicationDate: {
            lt: cutoffDate
          }
        },
        data: {
          isActive: false
        }
      });

      console.log(`Marked ${result.count} old hoaxes as inactive`);
      return result.count;

    } catch (error) {
      console.error('Error during cleanup:', error);
      return 0;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Health check for the processor
  async healthCheck(): Promise<{
    database: boolean;
    redis: boolean;
    openai: boolean;
  }> {
    try {
      const [dbHealth, redisHealth, openaiHealth] = await Promise.allSettled([
        this.prisma.hoaxFactCheck.count({ take: 1 }),
        this.redis.ping(),
        this.openai.models.list().catch(() => ({ data: [] }))
      ]);

      return {
        database: dbHealth.status === 'fulfilled',
        redis: redisHealth.status === 'fulfilled' && redisHealth.value === 'PONG',
        openai: openaiHealth.status === 'fulfilled'
      };

    } catch (error) {
      console.error('Health check error:', error);
      return {
        database: false,
        redis: false,
        openai: false
      };
    }
  }
}

// Export singleton instance
export const hoaxProcessor = new HoaxDataProcessor();
