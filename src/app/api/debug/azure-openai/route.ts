import { testOpenRouterConnection } from '@/lib/openrouter';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  try {
    console.log('🧪 Testing OpenRouter connection...');

    const result = await testOpenRouterConnection();

    if (result.success) {
      console.log('✅ OpenRouter connection successful');
      return NextResponse.json({
        success: true,
        message: 'OpenRouter connection is working'
      });
    } else {
      console.error('❌ OpenRouter connection failed:', result.error);
      return NextResponse.json({
        success: false,
        error: result.error,
        message: 'OpenRouter connection failed'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Debug API error:', error);
    return NextResponse.json(
      { success: false, error: 'Debug API failed' },
      { status: 500 }
    );
  }
}
