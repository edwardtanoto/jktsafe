import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Initialize Upstash Redis client (direct env vars for now)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Global rate limiter - 50 requests per minute per IP
export const globalRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(50, '1 m'),
  analytics: true,
  prefix: 'ratelimit:global',
});

// Public endpoint rate limiter - 10 requests per minute per IP (more restrictive)
export const publicRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  analytics: true,
  prefix: 'ratelimit:public',
});

// TikTok scraping rate limiter - 5 requests per minute (very restrictive for scraping)
export const scrapeRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  analytics: true,
  prefix: 'ratelimit:scrape',
});

// Rate limiting helper function for API routes
export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string,
  options?: { onRateLimit?: () => Response }
): Promise<{ success: boolean; reset?: number; remaining?: number; response?: Response }> {
  try {
    const result = await limiter.limit(identifier);

    if (result.success) {
      return {
        success: true,
        reset: result.reset,
        remaining: result.remaining
      };
    } else {
      // Rate limit exceeded
      if (options?.onRateLimit) {
        return {
          success: false,
          response: options.onRateLimit()
        };
      }

      return {
        success: false,
        reset: result.reset,
        remaining: result.remaining
      };
    }
  } catch (error) {
    console.error('Rate limit check failed:', error);
    // Allow the request if rate limiting fails (fail open)
    return { success: true };
  }
}

// Legacy interface for backward compatibility
export class LegacyRateLimiter {
  async waitForNextCall(): Promise<void> {
    // This is now a no-op since Upstash handles rate limiting
    // The actual rate limiting is done via checkRateLimit()
    return Promise.resolve();
  }

  getRemainingCalls(): number {
    // This is now handled by Upstash - return a default value
    return 50;
  }

  getTimeUntilReset(): number {
    // This is now handled by Upstash - return a default value
    return 60000;
  }
}

// Export legacy instances for backward compatibility
export const legacyGlobalRateLimiter = new LegacyRateLimiter();
export const legacyPublicRateLimiter = new LegacyRateLimiter();
