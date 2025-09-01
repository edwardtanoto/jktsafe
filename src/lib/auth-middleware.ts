import { NextRequest, NextResponse } from 'next/server';

// Scrape secret authentication middleware
export function authenticateScrapeRequest(request: NextRequest): { isValid: boolean; error?: string } {
  const scrapeSecret = process.env.SCRAPE_SECRET;

  if (!scrapeSecret) {
    console.error('❌ SCRAPE_SECRET environment variable is not set!');
    return {
      isValid: false,
      error: 'Server configuration error: SCRAPE_SECRET not set'
    };
  }

  const providedSecret = request.headers.get('x-scrape-secret');

  if (!providedSecret) {
    return {
      isValid: false,
      error: 'Missing scrape secret. Include in x-scrape-secret header'
    };
  }

  // Trim whitespace and compare
  const trimmedProvided = providedSecret.trim();
  const trimmedSecret = scrapeSecret.trim();

  if (trimmedProvided !== trimmedSecret) {
    return {
      isValid: false,
      error: 'Invalid scrape secret'
    };
  }

  return { isValid: true };
}

// Legacy API Key authentication middleware (for backward compatibility)
export function authenticateRequest(request: NextRequest): { isValid: boolean; error?: string } {
  const authHeader = request.headers.get('authorization');
  const apiKey = request.headers.get('x-api-key');

  // Check for API key in header or Authorization header
  const providedKey = apiKey || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

  if (!providedKey) {
    return {
      isValid: false,
      error: 'Missing API key. Include in x-api-key header or Authorization: Bearer <key>'
    };
  }

  // For legacy compatibility, also check SCRAPE_SECRET
  const secretKey = process.env.SCRAPE_SECRET || process.env.API_SECRET_KEY;
  if (!secretKey) {
    return {
      isValid: false,
      error: 'Server configuration error: No authentication key set'
    };
  }

  // Trim whitespace and compare
  const trimmedProvided = providedKey.trim();
  const trimmedSecret = secretKey.trim();

  if (trimmedProvided !== trimmedSecret) {
    return {
      isValid: false,
      error: 'Invalid API key'
    };
  }

  return { isValid: true };
}

// Middleware function for API routes
export function withAuth(handler: Function) {
  return async (request: NextRequest, ...args: any[]) => {
    const auth = authenticateRequest(request);

    if (!auth.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: auth.error,
          message: 'Authentication required'
        },
        { status: 401 }
      );
    }

    return handler(request, ...args);
  };
}

// CORS headers for security
export function getCorsHeaders() {
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://lacakdemo.vercel.app', 'https://lacakdemo.com'] // Add your production domains
    : ['http://localhost:3000', 'http://localhost:3001'];

  const origin = process.env.NODE_ENV === 'production'
    ? 'https://lacakdemo.vercel.app' // Default production domain
    : 'http://localhost:3000';

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-scrape-secret',
    'Access-Control-Max-Age': '86400', // 24 hours
    'Access-Control-Allow-Credentials': 'true',
  };
}

// Handle CORS preflight requests
export function handleCors(request: NextRequest) {
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: getCorsHeaders()
    });
  }
}
