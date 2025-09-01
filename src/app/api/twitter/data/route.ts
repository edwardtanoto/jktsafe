import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateAdminRequest } from '@/lib/admin-middleware';

export async function GET(request: NextRequest) {
  try {
    // Require admin authentication for Twitter data access
    const auth = authenticateAdminRequest(request);
    if (!auth.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: auth.error,
          message: 'Admin authentication required'
        },
        { status: 401 }
      );
    }
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const processed = searchParams.get('processed'); // 'true', 'false', or null for all

    console.log(`🔍 Fetching Twitter data with limit=${limit}, processed=${processed}`);

    // Build where clause
    let whereClause: any = {};
    
    if (processed === 'true') {
      whereClause.extractedLocation = { not: null };
    } else if (processed === 'false') {
      whereClause.extractedLocation = null;
    }

    // Fetch Twitter data from warning_markers table
    const twitterData = await prisma.warningMarker.findMany({
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

    console.log(`📊 Found ${twitterData.length} Twitter records`);

    // Format the data for better readability
    const formattedData = twitterData.map(tweet => {
      const userInfo = tweet.userInfo as any;
      return {
        id: tweet.id,
        tweetId: tweet.tweetId,
        text: tweet.text,
        createdAt: tweet.createdAt,
        socialMetrics: {
          bookmarks: tweet.bookmarks,
          favorites: tweet.favorites,
          retweets: tweet.retweets,
          views: tweet.views,
          quotes: tweet.quotes,
          replies: tweet.replies
        },
        userInfo: {
          created_at: userInfo?.created_at,
          followers_count: userInfo?.followers_count,
          friends_count: userInfo?.friends_count,
          favourites_count: userInfo?.favourites_count,
          verified: userInfo?.verified
        },
        location: {
          extractedLocation: tweet.extractedLocation,
          lat: tweet.lat,
          lng: tweet.lng,
          confidenceScore: tweet.confidenceScore
        },
        status: {
          verified: tweet.verified,
          processedAt: tweet.processedAt,
          updatedAt: tweet.updatedAt
        }
      };
    });

    return NextResponse.json({
      success: true,
      count: formattedData.length,
      filters: {
        limit,
        processed
      },
      data: formattedData
    });

  } catch (error) {
    console.error('❌ Twitter data API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}
