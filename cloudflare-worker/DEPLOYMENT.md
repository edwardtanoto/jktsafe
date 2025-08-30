# 🚀 Cloudflare Worker Deployment Guide

## Quick Start (5 minutes)

```bash
# 1. Navigate to worker directory
cd cloudflare-worker/riot-scraper-worker

# 2. Run setup script (provides interactive prompts)
../setup-worker.sh

# 3. Done! Worker runs automatically every 30 minutes
```

## Manual Deployment

```bash
# 1. Install dependencies
npm install

# 2. Login to Cloudflare
npx wrangler auth login

# 3. Set required secrets
npx wrangler secret put AZURE_OPENAI_API_KEY
npx wrangler secret put AZURE_OPENAI_ENDPOINT
npx wrangler secret put AZURE_OPENAI_DEPLOYMENT
npx wrangler secret put MAPBOX_ACCESS_TOKEN
npx wrangler secret put MAIN_APP_URL

# Optional: Google News API
npx wrangler secret put GOOGLE_NEWS_API_KEY

# 4. Deploy
npx wrangler deploy
```

## Verification

```bash
# Check if worker is running
curl https://your-worker.workers.dev/health

# Manually trigger scraping
curl https://your-worker.workers.dev/manual-trigger

# Monitor logs
npx wrangler tail
```

## What Happens Next

1. **Every 30 minutes**: Worker automatically scrapes news
2. **AI Processing**: Extracts locations from articles
3. **Geocoding**: Converts locations to coordinates
4. **Database Sync**: Saves events to your main app
5. **Real-time Updates**: Map updates automatically

## Cost Estimate: $15-65/month

- Cloudflare Workers: $5-15
- Azure OpenAI: $10-50
- Mapbox: $0 (free tier)
- Google News: $0 (free tier)

## Monitoring Dashboard

- **Cloudflare Dashboard**: Worker performance and errors
- **Azure Portal**: OpenAI usage and costs
- **Mapbox Dashboard**: Geocoding requests
- **Your App Logs**: New events being added

## Troubleshooting

**Worker not running?**
```bash
npx wrangler tail --format=pretty
```

**Secrets not working?**
```bash
npx wrangler secret list
```

**API errors?**
- Check Azure OpenAI dashboard
- Verify Mapbox token
- Confirm main app URL is accessible

## Performance Expectations

- **Articles processed**: 50-100 per run
- **Success rate**: 70-90% (depends on article quality)
- **Processing time**: 2-5 minutes per batch
- **New incidents**: 10-30 per day (varies by news volume)

## Next Steps

1. **Monitor for 24 hours** to ensure everything works
2. **Adjust batch sizes** if hitting rate limits
3. **Add error notifications** if needed
4. **Scale up** if processing more articles

## Emergency Stop

```bash
# Disable cron triggers
npx wrangler deploy  # Remove cron from wrangler.jsonc first

# Or delete the worker
npx wrangler delete
```

---

🎉 **Your automated news scraper is now live!** It will continuously monitor Indonesian news for incidents and update your map in real-time.
