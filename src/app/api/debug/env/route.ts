import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  try {
    // Require authentication for debug endpoints
    const auth = authenticateRequest(request);
    if (!auth.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: auth.error,
          message: 'Authentication required for debug operations'
        },
        { status: 401 }
      );
    }

    // Only show existence, not actual values
    return NextResponse.json({
      success: true,
      env: {
        SCRAPE_SECRET: {
          exists: !!process.env.SCRAPE_SECRET,
          length: process.env.SCRAPE_SECRET?.length
        },
        DATABASE_URL: {
          exists: !!process.env.DATABASE_URL,
          type: process.env.DATABASE_URL?.startsWith('postgresql') ? 'postgresql' : 'other'
        },
        UPSTASH_REDIS_REST_URL: {
          exists: !!process.env.UPSTASH_REDIS_REST_URL
        }
      },
      message: 'Debug endpoint - remove in production'
    });
  } catch (error) {
    console.error('Debug API error:', error);
    return NextResponse.json(
      { success: false, error: 'Debug API failed' },
      { status: 500 }
    );
  }
}
