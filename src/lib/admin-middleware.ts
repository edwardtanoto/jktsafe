import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from './auth-middleware';

// Admin authentication middleware
export function authenticateAdminRequest(request: NextRequest): { isValid: boolean; error?: string } {
  const adminSecret = process.env.ADMIN_SECRET || process.env.SCRAPE_SECRET;

  if (!adminSecret) {
    console.error('❌ ADMIN_SECRET or SCRAPE_SECRET environment variable is not set!');
    return {
      isValid: false,
      error: 'Server configuration error: Admin authentication not configured'
    };
  }

  const providedSecret = request.headers.get('x-admin-secret') ||
                        request.headers.get('x-scrape-secret');

  if (!providedSecret) {
    return {
      isValid: false,
      error: 'Missing admin secret. Include in x-admin-secret header'
    };
  }

  // Trim whitespace and compare
  const trimmedProvided = providedSecret.trim();
  const trimmedSecret = adminSecret.trim();

  if (trimmedProvided !== trimmedSecret) {
    return {
      isValid: false,
      error: 'Invalid admin secret'
    };
  }

  return { isValid: true };
}

// Middleware function for admin routes
export function withAdminAuth(handler: Function) {
  return async (request: NextRequest, ...args: any[]) => {
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

    return handler(request, ...args);
  };
}
