import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest, handleCors, getCorsHeaders } from '@/lib/auth-middleware';
import OpenAI from 'openai';

// Initialize OpenAI with OpenRouter
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY
});

// Simple hash-based embedding function (matches generate-embeddings.js)
function generateSimpleEmbedding(text: string): number[] {
  const hash = text.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);

  const vector = [];
  for (let i = 0; i < 1536; i++) {
    vector.push((Math.sin(hash + i) + 1) / 2);
  }
  return vector;
}

interface ChatRequest {
  message: string;
  context?: {
    currentView?: string;
    timeRange?: string;
  };
}

interface EventData {
  id: number;
  title: string;
  description: string | null;
  lat: number;
  lng: number;
  type: string;
  extractedLocation: string | null;
  createdAt: Date;
  verified: boolean;
  source: string;
}

export async function POST(request: NextRequest) {
  // Handle CORS preflight
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  try {
    const body: ChatRequest = await request.json();
    const { message, context = {} } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Message is required' },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    // Generate embedding for user query
    const queryEmbedding = generateSimpleEmbedding(message);

    // Fetch relevant events using vector search (RAG)
    const events = await getSimilarEvents(queryEmbedding);

    // Generate LLM response with retrieved context
    const response = await generateChatResponse(message, events, context);

    return NextResponse.json({
      success: true,
      response
    }, { headers: getCorsHeaders() });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process chat request' },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}

async function getSimilarEvents(queryEmbedding: number[]): Promise<EventData[]> {
  try {
    // Use vector similarity search to find relevant events
    const similarEvents = await prisma.$queryRaw`
      SELECT
        id,
        title,
        description,
        lat,
        lng,
        type,
        "extractedLocation",
        "createdAt",
        verified,
        source,
        url,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM events
      WHERE embedding IS NOT NULL
        AND (1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector)) > 0.1
        AND "createdAt" >= NOW() - INTERVAL '6 hours'
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT 15
    `;

    // Also get some recent events as fallback
    const recentEvents = await prisma.event.findMany({
      where: {
        type: {
          in: ['riot', 'protest', 'demonstration']
        },
        createdAt: {
          gte: new Date(Date.now() - 6 * 60 * 60 * 1000) // 6 hours ago
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5,
      select: {
        id: true,
        title: true,
        description: true,
        lat: true,
        lng: true,
        type: true,
        extractedLocation: true,
        createdAt: true,
        verified: true,
        source: true,
        url: true
      }
    });

    // Combine and deduplicate results
    const allEvents = [...similarEvents, ...recentEvents];
    const seenIds = new Set();
    const uniqueEvents = allEvents.filter(event => {
      if (seenIds.has(event.id)) return false;
      seenIds.add(event.id);
      return true;
    });

    return uniqueEvents.slice(0, 20);
  } catch (error) {
    console.error('Error fetching similar events:', error);
    // Fallback to recent events if vector search fails
    return await getRecentEventsFallback();
  }
}

async function getRecentEventsFallback(): Promise<EventData[]> {
  try {
    // Get events from last 6 hours as fallback
    const events = await prisma.event.findMany({
      where: {
        type: {
          in: ['riot', 'protest', 'demonstration']
        },
        createdAt: {
          gte: new Date(Date.now() - 6 * 60 * 60 * 1000) // 6 hours ago
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 20,
      select: {
        id: true,
        title: true,
        description: true,
        lat: true,
        lng: true,
        type: true,
        extractedLocation: true,
        createdAt: true,
        verified: true,
        source: true,
        url: true
      }
    });

    return events;
  } catch (error) {
    console.error('Error fetching recent events fallback:', error);
    return [];
  }
}

async function generateChatResponse(message: string, events: EventData[], context: any) {
  try {
    // Format events data for LLM context
    const eventsContext = events.map(event => ({
      location: event.extractedLocation || `${event.lat.toFixed(4)}, ${event.lng.toFixed(4)}`,
      type: event.type,
      title: event.title,
      description: event.description,
      time: formatTimeAgo(event.createdAt),
      verified: event.verified,
      source: event.source,
      tiktokUrl: event.url || 'Tidak tersedia',
      markdownLink: event.url ? `[TikTok](${event.url})` : 'Tidak ada link tersedia'
    }));

    const systemPrompt = `Kamu adalah asisten informasi keamanan untuk Safe Indonesia.
Bantu pengguna dengan pertanyaan tentang demonstrasi, kerusuhan, dan situasi keamanan di Indonesia.

INFORMASI TERBARU DARI DATABASE (${events.length} kejadian dalam 6 jam terakhir):
${JSON.stringify(eventsContext, null, 2)}

PETUNJUK:
- Jawab dalam bahasa Indonesia yang natural dan mudah dipahami
- Fokus pada informasi lokasi, waktu, dan jenis kejadian
- Sertakan status verifikasi jika relevan
- Berikan ringkasan yang berguna untuk keselamatan
- Jika tidak ada data terkini, katakan dengan jujur
- Jangan berikan informasi yang tidak akurat atau spekulatif
- Jika pertanyaan tidak terkait keamanan, arahkan kembali ke topik utama
- SELALU sertakan link TikTok jika tersedia untuk setiap kejadian

FORMAT JAWABAN:
- Gunakan emoji yang relevan (📍 untuk lokasi, ⏰ untuk waktu, ✅ untuk terverifikasi, 🔗 untuk link)
- Kelompokkan informasi berdasarkan lokasi jika memungkinkan
- Berikan konteks waktu yang jelas ("2 jam lalu", "kemarin", dll)
- FORMAT LINK TIKTOK: Gunakan field markdownLink yang sudah tersedia dalam data
- Contoh format yang benar: 🔗 [TikTok](https://www.tiktok.com/@user/video/123456789)
- Field markdownLink sudah berisi format yang tepat untuk hyperlink
- Jika tidak ada link, akan muncul "Tidak ada link tersedia"`;

    const response = await openai.chat.completions.create({
      model: "meta-llama/llama-3.1-8b-instruct",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: message
        }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    const llmResponse = response.choices[0]?.message?.content || "Maaf, saya tidak dapat memproses pertanyaan Anda saat ini.";

    return {
      text: llmResponse,
      eventsCount: events.length,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('LLM generation error:', error);
    return {
      text: "Maaf, terjadi kesalahan dalam memproses pertanyaan Anda. Silakan coba lagi.",
      eventsCount: events.length,
      timestamp: new Date().toISOString(),
      error: true
    };
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) {
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    return `${diffMinutes} menit lalu`;
  } else if (diffHours < 24) {
    return `${diffHours} jam lalu`;
  } else if (diffDays === 1) {
    return 'kemarin';
  } else {
    return `${diffDays} hari lalu`;
  }
}

export async function GET(request: NextRequest) {
  // Handle CORS preflight
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  return NextResponse.json({
    success: true,
    message: "Safe Indonesia Chat API - POST your questions here!",
    example: {
      message: "ada demo dimana?",
      context: {
        currentView: "jakarta",
        timeRange: "last_24h"
      }
    }
  }, { headers: getCorsHeaders() });
}
