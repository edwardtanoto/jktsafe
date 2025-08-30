# Riot Signal Cloudflare Worker

Automated news scraping and incident processing using Cloudflare Workers. Runs every 30 minutes to scrape Indonesian news sites, extract locations using AI, and save incidents to your main application.

## Features

- 📰 **Multi-source scraping**: Kompas.com, Detik.com, Google News API
- 🤖 **AI-powered location extraction**: Azure OpenAI GPT-4o-mini
- 🗺️ **Automatic geocoding**: Mapbox Geocoding API
- ⏰ **Scheduled execution**: Every 30 minutes via cron triggers
- 📋 **Queue processing**: Handles 100+ articles with batch processing
- 🔄 **Real-time sync**: Automatically updates your main app database

## Architecture

```
News Sources → Worker → AI Processing → Geocoding → Main App Database
     ↓            ↓           ↓           ↓            ↓
 Kompas.com    Queue    Azure OpenAI  Mapbox     SQLite/Prisma
 Detik.com     Batch     Location      Lat/Lng    Real-time
 Google News   Rate      Extraction    →          Updates
```

## Prerequisites

1. **Cloudflare Account** with Workers enabled
2. **Azure OpenAI Account** with GPT-4o-mini deployment
3. **Mapbox Account** with access token
4. **Google News API Key** (optional, but recommended)
5. **Main Application** deployed and accessible

## Quick Setup

### Option 1: Automated Setup (Recommended)

```bash
chmod +x setup-worker.sh
./setup-worker.sh
```

This interactive script will:
- Install Wrangler CLI
- Authenticate with Cloudflare
- Set up all required secrets
- Deploy the worker

### Option 2: Manual Setup

```bash
# Install Wrangler
npm install -g wrangler

# Authenticate
wrangler auth login

# Set secrets
wrangler secret put AZURE_OPENAI_API_KEY
wrangler secret put AZURE_OPENAI_ENDPOINT
wrangler secret put AZURE_OPENAI_DEPLOYMENT
wrangler secret put MAPBOX_ACCESS_TOKEN
wrangler secret put GOOGLE_NEWS_API_KEY  # Optional
wrangler secret put MAIN_APP_URL

# Deploy
wrangler deploy
```

## Configuration

### Required Secrets

| Secret | Description | Example |
|--------|-------------|---------|
| `AZURE_OPENAI_API_KEY` | Your Azure OpenAI API key | `sk-...` |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL | `https://your-resource.openai.azure.com/` |
| `AZURE_OPENAI_DEPLOYMENT` | GPT-4o-mini deployment name | `gpt-4o-mini` |
| `MAPBOX_ACCESS_TOKEN` | Mapbox access token | `pk.eyJ...` |
| `MAIN_APP_URL` | Your main app URL | `https://riot-signal.vercel.app` |

### Optional Secrets

| Secret | Description | Example |
|--------|-------------|---------|
| `GOOGLE_NEWS_API_KEY` | Google News API key for broader coverage | `AIza...` |

## API Endpoints

### Worker Endpoints

- `GET /health` - Health check
- `GET /manual-trigger` - Manually trigger scraping (for testing)

### Main App Endpoints (used by worker)

- `GET /api/events/exists?title=X&url=Y` - Check for duplicate events
- `POST /api/events` - Save new events

## How It Works

### 1. Cron Trigger (Every 30 minutes)
- Cloudflare automatically triggers the worker
- Worker starts the scraping process

### 2. Multi-Source Scraping
- Scrapes Kompas.com and Detik.com for Indonesian news
- Fetches from Google News API (if configured)
- Filters articles containing riot/unrest keywords

### 3. Queue Processing
- Articles are added to a processing queue
- Batches of 5 articles processed simultaneously
- Rate limiting between batches (10-second delays)

### 4. AI Location Extraction
- Azure OpenAI analyzes article title + description
- Extracts Indonesian place names where incidents occurred
- Handles edge cases and missing location data

### 5. Geocoding
- Mapbox converts location names to coordinates
- Focuses on Indonesian locations
- Handles geocoding failures gracefully

### 6. Database Sync
- Worker sends processed events to main app via HTTP
- Checks for duplicates before saving
- Real-time updates appear in your map

## Monitoring & Debugging

### View Logs
```bash
# Real-time logs
wrangler tail

# Specific time range
wrangler tail --format=pretty --since=1h
```

### Manual Testing
```bash
# Trigger scraping manually
curl https://your-worker.workers.dev/manual-trigger

# Check worker health
curl https://your-worker.workers.dev/health
```

### Monitor Performance
- Cloudflare Dashboard → Workers → Your Worker
- View execution time, error rates, and resource usage
- Set up alerts for failures

## Rate Limits & Optimization

### Current Rate Limits
- **Azure OpenAI**: 200 requests/hour (GPT-4o-mini)
- **Mapbox**: 100k requests/month (free tier)
- **Google News**: 100 requests/day (free tier)
- **Worker execution**: 30 minutes interval

### Optimization Features
- **Batch processing**: 5 articles simultaneously
- **Duplicate detection**: Prevents reprocessing
- **Rate limiting**: 10-second delays between batches
- **Error handling**: Continues processing on failures

## Scaling Considerations

### Handling More Articles
- Reduce cron interval (requires paid Cloudflare plan)
- Increase batch size (monitor API limits)
- Add more worker instances
- Implement priority queuing

### High-Traffic Events
- Worker automatically handles bursts via queue
- Rate limiting prevents API quota exhaustion
- Parallel processing maximizes throughput

## Troubleshooting

### Common Issues

**Worker deployment fails:**
```bash
wrangler deploy --dry-run  # Test deployment
```

**Secrets not working:**
```bash
wrangler secret list  # Check configured secrets
wrangler secret put SECRET_NAME  # Reconfigure if needed
```

**API rate limits exceeded:**
- Check Cloudflare dashboard for error logs
- Reduce batch size or increase delays
- Monitor API usage in respective dashboards

**Database connection issues:**
- Ensure main app URL is correct
- Check main app `/api/events` endpoint is accessible
- Verify CORS settings allow worker requests

### Debug Mode
```bash
# Enable debug logging
wrangler dev --log-level=debug

# Test with local main app
wrangler dev --local
```

## Cost Estimation

### Monthly Costs (Estimated)
- **Cloudflare Workers**: $5-15 (100k-500k requests)
- **Azure OpenAI**: $10-50 (100k-500k tokens)
- **Mapbox**: $0 (free tier covers usage)
- **Google News API**: $0 (free tier)
- **Total**: ~$15-65/month

### Cost Optimization
- Monitor usage in Cloudflare dashboard
- Adjust cron frequency based on needs
- Use batch processing to reduce API calls
- Implement caching for duplicate articles

## Security Best Practices

- ✅ All API keys stored as Cloudflare secrets
- ✅ No sensitive data in worker code
- ✅ HTTPS-only communication
- ✅ Rate limiting prevents abuse
- ✅ Input validation on all API calls

## Future Enhancements

- [ ] **Push notifications** for breaking news
- [ ] **Social media monitoring** integration
- [ ] **Advanced filtering** based on incident severity
- [ ] **Multi-region deployment** for faster scraping
- [ ] **Analytics dashboard** for incident trends
