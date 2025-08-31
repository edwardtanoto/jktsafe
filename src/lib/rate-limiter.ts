// Simple rate limiter for API calls
class RateLimiter {
  private lastCallTime: number = 0;
  private callCount: number = 0;
  private windowStart: number = Date.now();
  private readonly windowSize: number = 60000; // 1 minute
  private readonly maxCallsPerWindow: number = 50; // Max 50 calls per minute
  private readonly minDelay: number = 1000; // Minimum 1 second between calls

  async waitForNextCall(): Promise<void> {
    const now = Date.now();

    // Reset window if needed
    if (now - this.windowStart >= this.windowSize) {
      this.callCount = 0;
      this.windowStart = now;
    }

    // Check if we've exceeded the rate limit
    if (this.callCount >= this.maxCallsPerWindow) {
      const waitTime = this.windowSize - (now - this.windowStart);
      console.log(`⏳ Rate limit exceeded, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitForNextCall(); // Recursively wait again
    }

    // Ensure minimum delay between calls
    const timeSinceLastCall = now - this.lastCallTime;
    if (timeSinceLastCall < this.minDelay) {
      const waitTime = this.minDelay - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastCallTime = Date.now();
    this.callCount++;
  }

  getRemainingCalls(): number {
    const now = Date.now();
    if (now - this.windowStart >= this.windowSize) {
      return this.maxCallsPerWindow;
    }
    return Math.max(0, this.maxCallsPerWindow - this.callCount);
  }

  getTimeUntilReset(): number {
    const now = Date.now();
    return Math.max(0, this.windowSize - (now - this.windowStart));
  }
}

// Separate rate limiter for public endpoints (more restrictive)
class PublicRateLimiter {
  private lastCallTime: number = 0;
  private callCount: number = 0;
  private windowStart: number = Date.now();
  private readonly windowSize: number = 60000; // 1 minute
  private readonly maxCallsPerWindow: number = 10; // Only 10 calls per minute for public endpoints
  private readonly minDelay: number = 2000; // Minimum 2 seconds between calls

  async waitForNextCall(): Promise<void> {
    const now = Date.now();

    // Reset window if needed
    if (now - this.windowStart >= this.windowSize) {
      this.callCount = 0;
      this.windowStart = now;
    }

    // Check if we've exceeded the rate limit
    if (this.callCount >= this.maxCallsPerWindow) {
      const waitTime = this.windowSize - (now - this.windowStart);
      console.log(`⏳ Public endpoint rate limit exceeded, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitForNextCall(); // Recursively wait again
    }

    // Ensure minimum delay between calls
    const timeSinceLastCall = now - this.lastCallTime;
    if (timeSinceLastCall < this.minDelay) {
      const waitTime = this.minDelay - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastCallTime = Date.now();
    this.callCount++;
  }

  getRemainingCalls(): number {
    const now = Date.now();
    if (now - this.windowStart >= this.windowSize) {
      return this.maxCallsPerWindow;
    }
    return Math.max(0, this.maxCallsPerWindow - this.callCount);
  }

  getTimeUntilReset(): number {
    const now = Date.now();
    return Math.max(0, this.windowSize - (now - this.windowStart));
  }
}

// Export both rate limiters
export const globalRateLimiter = new RateLimiter();
export const publicRateLimiter = new PublicRateLimiter();
