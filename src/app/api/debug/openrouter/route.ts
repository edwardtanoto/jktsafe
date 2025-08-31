import { testOpenRouterConnection } from '@/lib/openrouter';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, handleCors, getCorsHeaders } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  // Handle CORS preflight
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  // Authenticate request
  const auth = authenticateRequest(request);
  if (!auth.isValid) {
    return NextResponse.json(
      {
        success: false,
        error: auth.error,
        message: 'Authentication required for debug operations'
      },
      {
        status: 401,
        headers: getCorsHeaders()
      }
    );
  }

  try {
    console.log('🧪 Testing OpenRouter connection with gpt-oss-20b:free...');

    const result = await testOpenRouterConnection();

    if (result.success) {
      console.log('✅ OpenRouter connection successful');
      return NextResponse.json({
        success: true,
        message: 'OpenRouter connection is working'
      }, { headers: getCorsHeaders() });
    } else {
      console.error('❌ OpenRouter connection failed:', result.error);
      return NextResponse.json({
        success: false,
        error: result.error,
        message: 'OpenRouter connection failed'
      }, {
        status: 500,
        headers: getCorsHeaders()
      });
    }

  } catch (error) {
    console.error('Debug API error:', error);
    return NextResponse.json(
      { success: false, error: 'Debug API failed' },
      {
        status: 500,
        headers: getCorsHeaders()
      }
    );
  }
}
