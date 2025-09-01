import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest, handleCors, getCorsHeaders } from '@/lib/auth-middleware';
import OpenAI from 'openai';
import { hoaxProcessor } from '@/lib/hoax-data-processor';

// Initialize OpenAI with OpenRouter
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY
});

// Hoax-related keywords for detection
const HOAX_KEYWORDS = [
  'hoax', 'bohong', 'palsu', 'penipuan', 'scam', 'tipu', 'manipulasi',
  'turnbackhoax', 'cek fakta', 'verifikasi', 'bantah', 'klarifikasi',
  'disinformasi', 'misinformasi', 'propaganda', 'fitnah', 'hasut'
];

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
    includeHoaxes?: boolean;
  };
}

interface ChatContext {
  currentView?: string;
  timeRange?: string;
  includeHoaxes?: boolean;
}

interface HoaxResult {
  id: string;
  title: string;
  originalClaim?: string | null;
  hoaxCategory: string;
  verificationMethod?: string | null;
  investigationResult?: string | null;
  authorName?: string | null;
  sourceUrl: string;
  publicationDate: Date;
  similarity?: number;
}

interface WarningMarker {
  id: number;
  text: string;
  extractedLocation: string | null;
  lat: number | null;
  lng: number | null;
  confidenceScore: number | null;
  verified: boolean;
  createdAt: Date;
  tweetId: string;
  userInfo: Record<string, unknown>;
  views: string | number | null;
  retweets: number | null;
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
  url?: string | null;
  confidenceScore?: number | null;
  views?: string | number | null;
  retweets?: number | null;
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

    // Check if this is a hoax-related query
    const isHoaxQuery = detectHoaxQuery(message);
    let hoaxResults = null;

    if (isHoaxQuery || context?.includeHoaxes) {
      hoaxResults = await searchRelevantHoaxes(message);
    }

    // Generate LLM response with retrieved context
    const response = await generateChatResponse(message, events, hoaxResults, context);

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
    // For now, skip vector similarity search and use basic filtering
    // TODO: Re-enable when embedding column is added to events table
    const similarEvents: EventData[] = [];

    // Also get some recent events as fallback
    const recentEvents = await prisma.event.findMany({
      where: {
        type: {
          in: ['protest', 'demonstration']
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

    // Get warning markers (demonstration alerts from Twitter)
    const warningMarkers = await prisma.warningMarker.findMany({
      where: {
        AND: [
          { extractedLocation: { not: null } },
          { lat: { not: null } },
          { lng: { not: null } },
          { confidenceScore: { gte: 0.3 } },
          { createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } } // 6 hours ago
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        text: true,
        extractedLocation: true,
        lat: true,
        lng: true,
        confidenceScore: true,
        verified: true,
        createdAt: true,
        tweetId: true,
        userInfo: true,
        views: true,
        retweets: true
      }
    });

    // Transform warning markers to match EventData format
    const transformedWarnings = warningMarkers.map((marker) => ({
      id: marker.id,
      title: `⚠️ Demo Alert: ${marker.extractedLocation}`,
      description: marker.text.length > 200 ? marker.text.substring(0, 200) + '...' : marker.text,
      lat: marker.lat!,
      lng: marker.lng!,
      type: 'warning',
      extractedLocation: marker.extractedLocation,
      createdAt: marker.createdAt,
      verified: marker.verified,
      source: 'twitter',
      url: `https://twitter.com/i/status/${marker.tweetId}`,
      confidenceScore: marker.confidenceScore,
      views: marker.views,
      retweets: marker.retweets
    }));

    // Combine all results
    const allEvents = [...similarEvents, ...recentEvents, ...transformedWarnings];
    const seenIds = new Set();
    const uniqueEvents = allEvents.filter(event => {
      const uniqueKey = `${event.type}-${event.id}`;
      if (seenIds.has(uniqueKey)) return false;
      seenIds.add(uniqueKey);
      return true;
    });

    return uniqueEvents.slice(0, 25);
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
          in: ['protest', 'demonstration']
        },
        createdAt: {
          gte: new Date(Date.now() - 6 * 60 * 60 * 1000) // 6 hours ago
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 15,
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

    // Also get warning markers as fallback
    const warningMarkers = await prisma.warningMarker.findMany({
      where: {
        AND: [
          { extractedLocation: { not: null } },
          { lat: { not: null } },
          { lng: { not: null } },
          { confidenceScore: { gte: 0.3 } },
          { createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } } // 6 hours ago
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        text: true,
        extractedLocation: true,
        lat: true,
        lng: true,
        confidenceScore: true,
        verified: true,
        createdAt: true,
        tweetId: true,
        userInfo: true,
        views: true,
        retweets: true
      }
    });

    // Transform warning markers to match EventData format
    const transformedWarnings = warningMarkers.map((marker) => ({
      id: marker.id,
      title: `⚠️ Demo Alert: ${marker.extractedLocation}`,
      description: marker.text.length > 200 ? marker.text.substring(0, 200) + '...' : marker.text,
      lat: marker.lat!,
      lng: marker.lng!,
      type: 'warning',
      extractedLocation: marker.extractedLocation,
      createdAt: marker.createdAt,
      verified: marker.verified,
      source: 'twitter',
      url: `https://twitter.com/i/status/${marker.tweetId}`,
      confidenceScore: marker.confidenceScore,
      views: marker.views,
      retweets: marker.retweets
    }));

    // Fix type compatibility
    const compatibleEvents = events.map(event => ({
      ...event,
      url: event.url || undefined
    }));
    return [...compatibleEvents, ...transformedWarnings];
  } catch (error) {
    console.error('Error fetching recent events fallback:', error);
    return [];
  }
}

async function generateChatResponse(message: string, events: EventData[], hoaxResults: HoaxResult[] | null, context: ChatContext) {
  try {
    // Format events data for LLM context
    const eventsContext = events.map(event => {
      const baseInfo = {
        location: event.extractedLocation || `${event.lat.toFixed(4)}, ${event.lng.toFixed(4)}`,
        type: event.type,
        title: event.title,
        description: event.description,
        time: formatTimeAgo(event.createdAt),
        verified: event.verified,
        source: event.source,
        url: event.url || 'Tidak tersedia'
      };

      // Add specific information for warning markers
      if (event.type === 'warning') {
        return {
          ...baseInfo,
          confidenceScore: `${Math.round((event.confidenceScore || 0) * 100)}%`,
          views: event.views || 0,
          retweets: event.retweets || 0,
          markdownLink: event.url ? `[Twitter](${event.url})` : 'Tidak ada link tersedia',
          alertType: 'Peringatan Demonstrasi'
        };
      } else {
        return {
          ...baseInfo,
          markdownLink: event.url ? `[TikTok](${event.url})` : 'Tidak ada link tersedia'
        };
      }
    });

    // Format hoax data for LLM context
    const hoaxContext = hoaxResults && hoaxResults.length > 0 ? hoaxResults.map((hoax, index) => ({
      id: hoax.id,
      title: hoax.title,
      originalClaim: hoax.originalClaim || 'N/A',
      category: hoax.hoaxCategory,
      verificationMethod: hoax.verificationMethod || 'N/A',
      investigationResult: hoax.investigationResult || 'N/A',
      author: hoax.authorName || 'TurnBackHoax',
      sourceUrl: hoax.sourceUrl,
      publicationDate: formatTimeAgo(hoax.publicationDate),
      similarity: hoax.similarity || 0.5
    })) : [];

    const systemPrompt = `Kamu adalah asisten informasi keamanan untuk Safe Indonesia.
Bantu pengguna dengan pertanyaan tentang demonstrasi, kerusuhan, dan situasi keamanan di Indonesia.

INFORMASI TERBARU DARI DATABASE (${events.length} kejadian dalam 6 jam terakhir):
${JSON.stringify(eventsContext, null, 2)}

${hoaxResults && hoaxResults.length > 0 ? `
INFORMASI HOAX DARI TURNBACKHOAX.ID (${hoaxResults.length} hasil pencarian):
${JSON.stringify(hoaxContext, null, 2)}

KATEGORI HOAX:
- SALAH: Konten yang salah/palsu/fabricated/misleading
- PENIPUAN: Konten penipuan/scam/impostor
` : ''}

JENIS DATA YANG TERSEDIA:
1. WARNING MARKERS (type: "warning"): Peringatan demonstrasi dari Twitter dengan confidence score
2. EVENTS (type: "protest", "demonstration"): Kejadian dari TikTok dan sumber lain
${hoaxResults && hoaxResults.length > 0 ? '3. HOAX FACT-CHECKS: Verifikasi hoaks dari TurnBackHoax.ID' : ''}

PETUNJUK KHUSUS UNTUK PERTANYAAN DEMONSTRASI:
- Ketika ditanya "ada rencana demo dimana" atau pertanyaan serupa, prioritaskan WARNING MARKERS
- Warning markers memberikan informasi paling akurat tentang rencana demonstrasi
- Sertakan confidence score untuk warning markers
- Sebutkan jumlah views dan retweets untuk menunjukkan tingkat perhatian publik
- Berikan informasi lokasi yang spesifik

PETUNJUK KHUSUS UNTUK PERTANYAAN HOAX:
- Ketika ditanya tentang hoax atau informasi yang perlu diverifikasi, gunakan data TurnBackHoax.ID
- Sertakan kategori hoax (SALAH/PENIPUAN) dan metode verifikasi
- Jelaskan hasil investigasi dengan bahasa yang mudah dipahami
- SELALU sertakan link ke sumber asli TurnBackHoax.ID
- Jika tidak menemukan hoax yang relevan, katakan dengan jujur
- Tekankan bahwa informasi berasal dari sumber terpercaya (TurnBackHoax.ID)
- Untuk hoax, sertakan informasi tentang kapan hoax tersebut dipublikasikan

PETUNJUK UMUM:
- Jawab dalam bahasa Indonesia yang natural dan mudah dipahami
- Fokus pada informasi lokasi, waktu, dan jenis kejadian
- Sertakan status verifikasi jika relevan
- Berikan ringkasan yang berguna untuk keselamatan
- Jika tidak ada data terkini, katakan dengan jujur
- Jangan berikan informasi yang tidak akurat atau spekulatif
- Jika pertanyaan tidak terkait keamanan, arahkan kembali ke topik utama
- SELALU sertakan link (Twitter/TikTok/TurnBackHoax) jika tersedia untuk setiap kejadian

FORMAT JAWABAN:
- Gunakan emoji yang relevan (📍 untuk lokasi, ⏰ untuk waktu, ✅ untuk terverifikasi, ⚠️ untuk warning, 🔗 untuk link)
- Kelompokkan informasi berdasarkan lokasi jika memungkinkan
- Berikan konteks waktu yang jelas ("2 jam lalu", "kemarin", dll)
- Untuk warning markers: sertakan confidence score dan engagement metrics
- FORMAT LINK: Gunakan field markdownLink yang sudah tersedia dalam data
- Contoh format yang benar: 🔗 [Twitter](https://twitter.com/i/status/123) atau [TikTok](https://tiktok.com/@user/video/123) atau [TurnBackHoax.ID](https://turnbackhoax.id/...)
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

// Hoax detection functions
function detectHoaxQuery(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  // Check for explicit hoax keywords
  const hasHoaxKeyword = HOAX_KEYWORDS.some(keyword =>
    lowerMessage.includes(keyword)
  );

  if (hasHoaxKeyword) {
    return true;
  }

  // Check for question patterns that might be about hoaxes
  const hoaxQuestionPatterns = [
    /apakah.*hoax/i,
    /benarkah/i,
    /klarifikasi/i,
    /bantah/i,
    /cek.*fakta/i,
    /verifikasi/i,
    /benar.*tidak/i,
    /palsu.*tidak/i
  ];

  return hoaxQuestionPatterns.some(pattern => pattern.test(lowerMessage));
}

async function searchRelevantHoaxes(message: string): Promise<HoaxResult[]> {
  try {
    // Generate embedding for the message
    const queryEmbedding = generateSimpleEmbedding(message);

    // Search for relevant hoaxes
    const hoaxResults = await hoaxProcessor.findSimilarHoaxes(queryEmbedding, 3);

    if (hoaxResults.length === 0) {
      // Fallback to keyword search
      const keywords = extractHoaxKeywords(message);
      if (keywords.length > 0) {
        return await hoaxProcessor.searchByKeywords(keywords, undefined, 3);
      }
    }

    return hoaxResults;

  } catch (error) {
    console.error('Error searching hoaxes:', error);
    return [];
  }
}

function extractHoaxKeywords(message: string): string[] {
  const lowerMessage = message.toLowerCase();

  // Extract potential keywords for hoax search
  const words = lowerMessage.split(/\s+/).filter(word =>
    word.length > 2 &&
    !['yang', 'dan', 'atau', 'dengan', 'di', 'ke', 'dari', 'pada', 'untuk', 'adalah'].includes(word)
  );

  // Prioritize hoax-related words and return top 5
  const prioritizedWords = words.filter(word =>
    HOAX_KEYWORDS.some(keyword => word.includes(keyword)) ||
    word.length > 4 // Longer words are more specific
  );

  return [...prioritizedWords, ...words.filter(word => !prioritizedWords.includes(word))].slice(0, 5);
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
