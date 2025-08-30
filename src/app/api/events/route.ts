import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'riot', 'protest', etc.
    const verified = searchParams.get('verified'); // 'true', 'false', or null for all
    const limit = parseInt(searchParams.get('limit') || '100');

    const where: any = {};

    if (type) {
      where.type = type;
    }

    if (verified !== null) {
      where.verified = verified === 'true';
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
        createdAt: true
      }
    });

    return NextResponse.json({
      success: true,
      events,
      count: events.length
    });

  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, lat, lng, source, url, verified, type } = body;

    if (!title || !lat || !lng || !source || !type) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
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
    });

  } catch (error) {
    console.error('Error creating event:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create event' },
      { status: 500 }
    );
  }
}