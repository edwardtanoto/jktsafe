import { PrismaClient } from '@prisma/client';
import { OpenAI } from 'openai';

const prisma = new PrismaClient();
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY
});

export interface SearchResult {
  id: number;
  title: string;
  description: string | null;
  extractedLocation: string | null;
  similarity: number;
  lat: number;
  lng: number;
  type: string;
  createdAt: Date;
}

export async function searchSimilarEvents(query: string, limit: number = 10): Promise<SearchResult[]> {
  try {
    // TEMPORARILY DISABLED: Embedding search not available without embedding field
    console.log('⚠️ Vector search temporarily disabled - embedding field not available');

    // Return empty results for now
    return [];

    /*
    // Generate embedding for the query
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    });

    const queryEmbedding = response.data[0].embedding;

    // Get all events with embeddings
    const events = await prisma.event.findMany({
      where: {
        embedding: {
          not: null
        }
      }
    });

    // Calculate cosine similarity for each event
    const results = events
      .map(event => {
        if (!event.embedding) return null;

        const eventEmbedding = JSON.parse(event.embedding);
        const similarity = cosineSimilarity(queryEmbedding, eventEmbedding);
    */

  } catch (error) {
    console.error('Vector search failed:', error);
    return [];
  }
}

export async function generateEventEmbedding(eventId: number): Promise<boolean> {
  try {
    // TEMPORARILY DISABLED: Embedding generation not available without embedding field
    console.log(`⚠️ Embedding generation temporarily disabled for event ${eventId}`);
    return false;

    /*
    const event = await prisma.event.findUnique({
      where: { id: eventId }
    });

    if (!event) return false;

    const text = `${event.title} ${event.description || ''} ${event.extractedLocation || ''}`.trim();

    if (text.length < 10) return false;

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    });

    await prisma.event.update({
      where: { id: eventId },
      data: { embedding: JSON.stringify(response.data[0].embedding) }
    });

    return true;
    */
  } catch (error) {
    console.error(`Failed to generate embedding for event ${eventId}:`, error);
    return false;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function searchEventsByLocation(query: string, lat?: number, lng?: number, radiusKm: number = 10): Promise<SearchResult[]> {
  try {
    // First get semantically similar events
    const semanticResults = await searchSimilarEvents(query, 20);

    // Then filter by location if coordinates provided
    if (lat !== undefined && lng !== undefined) {
      return semanticResults.filter(result => {
        const distance = calculateDistance(lat, lng, result.lat, result.lng);
        return distance <= radiusKm;
      });
    }

    return semanticResults;
  } catch (error) {
    console.error('Location-based search failed:', error);
    return [];
  }
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng/2) * Math.sin(dLng/2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
