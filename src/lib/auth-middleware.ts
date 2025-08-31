import { NextRequest, NextResponse } from 'next/server';

// Get API secret key with fallback
function getApiSecretKey(): string | null {
  // Try multiple ways to get the API key
  const fromEnv = process.env.API_SECRET_KEY;
  const fromLocalEnv = process.env.API_SECRET_KEY;
  const fromNextConfig = process.env.NEXT_PUBLIC_API_SECRET_KEY;

  // Also try reading from .env.local file directly as fallback
  let fromFile: string | null = null;
  try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/API_SECRET_KEY\s*=\s*["']?([^"'\s]+)["']?/);
      if (match) {
        fromFile = match[1];
        console.log('📄 Found API key in .env.local file');
      }
    }
  } catch (error) {
    console.log('⚠️ Could not read .env.local file:', error.message);
  }

  const apiKey = fromEnv || fromLocalEnv || fromNextConfig || fromFile;

  console.log('🔑 API Key Debug:');
  console.log('- From process.env.API_SECRET_KEY:', !!fromEnv);
  console.log('- From NEXT_PUBLIC_API_SECRET_KEY:', !!fromNextConfig);
  console.log('- From .env.local file:', !!fromFile);
  console.log('- Final API key found:', !!apiKey);
  console.log('- API key length:', apiKey?.length);

  return apiKey || null;
}

// Temporary hardcoded key for testing - REMOVE THIS AFTER DEBUGGING
const HARDCODED_TEST_KEY = "INDO2045nesia!";

const API_SECRET_KEY = getApiSecretKey() || HARDCODED_TEST_KEY;

if (!API_SECRET_KEY) {
  console.error('⚠️ API_SECRET_KEY environment variable is not set!');
  console.error('Please add API_SECRET_KEY to your .env.local file for API security');
  console.error('Expected format: API_SECRET_KEY="your_secret_key_here"');
} else if (API_SECRET_KEY === HARDCODED_TEST_KEY) {
  console.log('🔧 Using hardcoded test key for debugging');
}

// API Key authentication middleware
export function authenticateRequest(request: NextRequest): { isValid: boolean; error?: string } {
  const authHeader = request.headers.get('authorization');
  const apiKey = request.headers.get('x-api-key');

  // Check for API key in header or Authorization header
  const providedKey = apiKey || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

  // Debug logging
  console.log('🔐 Auth Debug:');
  console.log('- API_SECRET_KEY from env:', API_SECRET_KEY ? 'Set' : 'NOT SET');
  console.log('- Provided API key:', providedKey ? 'Present' : 'Missing');
  console.log('- API key header:', apiKey);
  console.log('- Auth header:', authHeader);

  if (!providedKey) {
    return {
      isValid: false,
      error: 'Missing API key. Include in x-api-key header or Authorization: Bearer <key>'
    };
  }

  if (!API_SECRET_KEY) {
    console.error('❌ API_SECRET_KEY environment variable is not loaded!');
    return {
      isValid: false,
      error: 'Server configuration error: API_SECRET_KEY not set'
    };
  }

  // Trim whitespace and compare
  const trimmedProvided = providedKey.trim();
  const trimmedSecret = API_SECRET_KEY.trim();

  console.log('- Key comparison:', trimmedProvided === trimmedSecret ? 'MATCH' : 'NO MATCH');
  console.log('- Provided key:', `"${trimmedProvided}"`);
  console.log('- Secret key:', `"${trimmedSecret}"`);
  console.log('- Provided key length:', trimmedProvided.length);
  console.log('- Secret key length:', trimmedSecret.length);

  // Special test case: Check if provided key matches hardcoded test key
  if (trimmedProvided === HARDCODED_TEST_KEY) {
    console.log('🎯 Provided key matches hardcoded test key - allowing request');
    return { isValid: true };
  }

  // Case-insensitive comparison as fallback
  const caseInsensitiveMatch = trimmedProvided.toLowerCase() === trimmedSecret.toLowerCase();

  if (trimmedProvided !== trimmedSecret && !caseInsensitiveMatch) {
    console.log('❌ API key mismatch - rejecting request');
    return {
      isValid: false,
      error: `Invalid API key. Expected length: ${trimmedSecret.length}, got: ${trimmedProvided.length}`
    };
  }

  if (caseInsensitiveMatch && trimmedProvided !== trimmedSecret) {
    console.log('⚠️ API key matched with case-insensitive comparison - allowing request');
  } else {
    console.log('✅ API key matched exactly');
  }

  // Temporary debug: Log successful authentication
  console.log('🎉 Authentication successful!');

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
  return {
    'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production'
      ? 'https://yourdomain.com' // Replace with your actual domain
      : 'http://localhost:3000',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Access-Control-Max-Age': '86400', // 24 hours
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
