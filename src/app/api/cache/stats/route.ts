import { NextRequest, NextResponse } from 'next/server';
import { getCacheStats, clearGeocodingCache } from '@/lib/geocoding-cache';

export async function GET(_request: NextRequest) {
  try {
    const stats = await getCacheStats();

    if (!stats) {
      return NextResponse.json(
        { success: false, error: 'Failed to get cache statistics' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get cache statistics' },
      { status: 500 }
    );
  }
}

// POST endpoint to clear cache (admin function)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'clear') {
      const clearedCount = await clearGeocodingCache();
      return NextResponse.json({
        success: true,
        message: `Cleared ${clearedCount} geocoding cache entries`
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action. Use action: "clear"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error clearing cache:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to clear cache' },
      { status: 500 }
    );
  }
}
