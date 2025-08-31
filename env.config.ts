// Environment configuration
export const env = {
  database: {
    url: process.env.DATABASE_URL || "file:./dev.db"
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
  }
};