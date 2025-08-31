import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, handleCors, getCorsHeaders } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  // Handle CORS preflight
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  try {
    console.log('🧪 Auth Test - Request Headers:');
    console.log('- x-api-key:', request.headers.get('x-api-key'));
    console.log('- authorization:', request.headers.get('authorization'));
    console.log('- user-agent:', request.headers.get('user-agent'));

    const auth = authenticateRequest(request);

    console.log('🧪 Auth Test - Result:');
    console.log('- isValid:', auth.isValid);
    console.log('- error:', auth.error);

    return NextResponse.json({
      success: auth.isValid,
      auth: {
        isValid: auth.isValid,
        error: auth.error
      },
      headers: {
        'x-api-key': !!request.headers.get('x-api-key'),
        'authorization': !!request.headers.get('authorization')
      }
    }, { headers: getCorsHeaders() });

  } catch (error) {
    console.error('Auth test error:', error);
    return NextResponse.json(
      { success: false, error: 'Auth test failed' },
      {
        status: 500,
        headers: getCorsHeaders()
      }
    );
  }
}
