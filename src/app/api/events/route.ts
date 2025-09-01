import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest, handleCors, getCorsHeaders } from '@/lib/auth-middleware';
import { publicRateLimiter } from '@/lib/rate-limiter';

export async function GET(request: NextRequest) {
  // Handle CORS preflight
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  // For GET requests, we'll allow public access but with rate limiting
  console.log(`📊 Events API accessed from: ${request.headers.get('user-agent')?.substring(0, 50)}...`);

  // Apply rate limiting to public access
  const remainingCalls = publicRateLimiter.getRemainingCalls();
  if (remainingCalls === 0) {
    return NextResponse.json({
      success: false,
      error: 'Rate limit exceeded. Too many requests.',
      message: 'Please wait before making another request.'
    }, {
      status: 429,
      headers: getCorsHeaders()
    });
  }

  await publicRateLimiter.waitForNextCall();

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'riot', 'protest', etc.
    const verified = searchParams.get('verified'); // 'true', 'false', or null for all
    const limit = parseInt(searchParams.get('limit') || '100');
    const hours = parseInt(searchParams.get('hours') || '0'); // 0 means no time filter

    const where: Record<string, unknown> = {};

    if (type) {
      where.type = type;
    }

    if (verified !== null) {
      where.verified = verified === 'true';
    }

    // Add time filtering if hours parameter is provided and > 0
    if (hours > 0) {
      where.createdAt = {
        gte: new Date(Date.now() - hours * 60 * 60 * 1000)
      };
    }

    const events = await prisma.event.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        lat: true,
        lng: true,
        source: true,
        url: true,
        verified: true,
        type: true,
        originalCreatedAt: true,
        createdAt: true
      }
    });

    return NextResponse.json({
      success: true,
      events,
      count: events.length
    }, { headers: getCorsHeaders() });

  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch events' },
      {
        status: 500,
        headers: getCorsHeaders()
      }
    );
  }
}

export async function POST(request: NextRequest) {
  // Handle CORS preflight
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  // Authenticate request for POST operations
  const auth = authenticateRequest(request);
  if (!auth.isValid) {
    return NextResponse.json(
      {
        success: false,
        error: auth.error,
        message: 'Authentication required for creating events'
      },
      {
        status: 401,
        headers: getCorsHeaders()
      }
    );
  }

  try {
    const body = await request.json();
    const { title, description, lat, lng, source, url, verified, type } = body;

    if (!title || !lat || !lng || !source || !type) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        {
          status: 400,
          headers: getCorsHeaders()
        }
      );
    }

    const event = await prisma.event.create({
      data: {
        title,
        description,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        source,
        url,
        verified: verified || false,
        type
      }
    });

    return NextResponse.json({
      success: true,
      event
    }, { headers: getCorsHeaders() });

  } catch (error) {
    console.error('Error creating event:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create event' },
      {
        status: 500,
        headers: getCorsHeaders()
      }
    );
  }
}