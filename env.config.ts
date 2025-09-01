// Environment configuration
export const env = {
  database: {
    url: getDatabaseUrl(),
    local: process.env.DATABASE_URL_LOCAL || "file:./dev.db",
    dev: process.env.NEON_DATABASE_URL_DEV,
    prod: process.env.NEON_DATABASE_URL_PROD
  },
  upstash: {
    apiKey: process.env.UPSTASH_API_KEY || "",
    redisRestUrl: process.env.UPSTASH_REDIS_REST_URL || "",
    redisRestToken: process.env.UPSTASH_REDIS_REST_TOKEN || ""
  },
  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY || ""
  },
  mapbox: {
    accessToken: process.env.MAPBOX_ACCESS_TOKEN || ""
  },
  rapidApi: {
    key: process.env.RAPIDAPI_KEY || ""
  },
  SERP_API: {
    key: process.env.SERP_API_KEY || ""
  },
  scrape: {
    secret: process.env.SCRAPE_SECRET || ""
  }
};

// Determine which database URL to use based on environment
function getDatabaseUrl(): string {
  // In production (Vercel prod deployment)
  if (process.env.VERCEL_ENV === 'production') {
    return process.env.NEON_DATABASE_URL_PROD || process.env.DATABASE_URL || "file:./dev.db";
  }

  // For all development environments (local dev, Vercel preview), use Neon dev branch
  if (process.env.NEON_DATABASE_URL_DEV) {
    console.log('🐘 Using Neon development database');
    return process.env.NEON_DATABASE_URL_DEV;
  }

  // Fallback to local SQLite only if Neon dev URL is not available
  console.log('💾 Falling back to local SQLite database');
  return process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL || "file:./dev.db";
}