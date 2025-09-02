import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 RSS Test endpoint called');
    
    // Simple JSON response to test if the issue is in JSON serialization
    const response = {
      success: true,
      message: 'Test RSS endpoint working',
      data: {
        test: 'value',
        number: 123,
        array: [1, 2, 3]
      },
      timestamp: new Date().toISOString()
    };
    
    console.log('🧪 Returning test response');
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('❌ RSS Test error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown test error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: false,
    error: 'Use POST method for RSS test'
  }, { status: 405 });
}
