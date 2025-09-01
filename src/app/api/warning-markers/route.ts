import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const hours = searchParams.get('hours');
    const limit = parseInt(searchParams.get('limit') || '100');
    const verified = searchParams.get('verified');
    const minConfidence = parseFloat(searchParams.get('minConfidence') || '0.3');

    console.log(`🔍 Fetching warning markers with filters: hours=${hours}, limit=${limit}, verified=${verified}, minConfidence=${minConfidence}`);

    // Build where clause
    const whereClause: Record<string, unknown> = {
      AND: [
        { extractedLocation: { not: null } },
        { lat: { not: null } },
        { lng: { not: null } },
        { confidenceScore: { gte: minConfidence } }
      ]
    };

    // Add time filter if specified
    if (hours && hours !== '0') {
      const hoursAgo = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);
      whereClause.AND.push({ createdAt: { gte: hoursAgo } });
    }

    // Add verified filter if specified
    if (verified === 'true') {
      whereClause.AND.push({ verified: true });
    } else if (verified === 'false') {
      whereClause.AND.push({ verified: false });
    }

    // Fetch warning markers from database
    const warningMarkers = await prisma.warningMarker.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        tweetId: true,
        text: true,
        createdAt: true,
        bookmarks: true,
        favorites: true,
        retweets: true,
        views: true,
        quotes: true,
        replies: true,
        userInfo: true,
        extractedLocation: true,
        lat: true,
        lng: true,
        confidenceScore: true,
        verified: true,
        processedAt: true,
        updatedAt: true
      }
    });

    console.log(`📊 Found ${warningMarkers.length} warning markers`);

    // Transform the data to match the expected format
    const transformedMarkers = warningMarkers.map(marker => ({
      id: marker.id,
      title: `Warning: ${marker.extractedLocation}`,
      description: marker.text.length > 200 ? 
        marker.text.substring(0, 200) + '...' : 
        marker.text,
      lat: marker.lat!,
      lng: marker.lng!,
      source: 'twitter',
      url: `https://twitter.com/${(marker.userInfo as Record<string, unknown>)?.screen_name}/status/${marker.tweetId}`,
      verified: marker.verified,
      type: 'warning',
      createdAt: marker.createdAt.toISOString(),
      // Additional warning-specific fields
      tweetId: marker.tweetId,
      extractedLocation: marker.extractedLocation,
      confidenceScore: marker.confidenceScore,
      socialMetrics: JSON.stringify({
        bookmarks: marker.bookmarks,
        favorites: marker.favorites,
        retweets: marker.retweets,
        views: marker.views,
        quotes: marker.quotes,
        replies: marker.replies
      }),
      userInfo: JSON.stringify(marker.userInfo)
    }));

    return NextResponse.json({
      success: true,
      warnings: transformedMarkers,
      count: transformedMarkers.length,
      filters: {
        hours: hours || 'all',
        limit,
        verified,
        minConfidence
      }
    });

  } catch (error) {
    console.error('❌ Warning markers API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}

// POST endpoint to manually create or update warning markers
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, markerId, verified } = body;

    if (action === 'verify') {
      if (!markerId) {
        return NextResponse.json(
          { success: false, error: 'Marker ID is required for verification' },
          { status: 400 }
        );
      }

      const updatedMarker = await prisma.warningMarker.update({
        where: { id: parseInt(markerId) },
        data: { 
          verified: verified === true,
          updatedAt: new Date()
        }
      });

      console.log(`✅ ${verified ? 'Verified' : 'Unverified'} warning marker ${markerId}`);

      return NextResponse.json({
        success: true,
        message: `Marker ${verified ? 'verified' : 'unverified'} successfully`,
        marker: updatedMarker
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('❌ Warning markers POST error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}
