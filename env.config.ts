// Environment configuration
export const env = {
  database: {
    url: process.env.DATABASE_URL || "file:./dev.db"
  },
  azureOpenAI: {
    apiKey: process.env.AZURE_OPENAI_API_KEY || "",
    endpoint: process.env.AZURE_OPENAI_ENDPOINT || "",
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT || ""
  },
  mapbox: {
    accessToken: process.env.MAPBOX_ACCESS_TOKEN || ""
  },
  rapidApi: {
    key: process.env.RAPIDAPI_KEY || "5925a974a7msh8391ebb41b83c39p168aa2jsn2acfd9cb904f"
  }
};