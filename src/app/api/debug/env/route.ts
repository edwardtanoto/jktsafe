import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  try {
    console.log('🔍 Environment Debug:');
    console.log('- API_SECRET_KEY exists:', !!process.env.API_SECRET_KEY);
    console.log('- API_SECRET_KEY value:', process.env.API_SECRET_KEY);
    console.log('- API_SECRET_KEY length:', process.env.API_SECRET_KEY?.length);

    return NextResponse.json({
      success: true,
      env: {
        API_SECRET_KEY: {
          exists: !!process.env.API_SECRET_KEY,
          length: process.env.API_SECRET_KEY?.length,
          value: process.env.API_SECRET_KEY
        }
      }
    });
  } catch (error) {
    console.error('Debug API error:', error);
    return NextResponse.json(
      { success: false, error: 'Debug API failed' },
      { status: 500 }
    );
  }
}
