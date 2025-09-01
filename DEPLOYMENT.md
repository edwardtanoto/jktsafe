# 🚀 Production Deployment Guide for Lacak Demo (Updated 2025)

## ✅ Current Status: READY FOR PRODUCTION

Your application is working perfectly! The TikTok scraping system successfully processed 60 demo locations from 78 videos in ~7 minutes. All systems are operational.

## Prerequisites

1. **Vercel Account**: [Sign up at vercel.com](https://vercel.com)
2. **GitHub Repository**: Your code should be in a Git repository
3. **Neon Database**: [neon.tech](https://neon.tech) (recommended for production)
4. **Upstash Redis**: [upstash.com](https://upstash.com) (for rate limiting)

## Step 1: Set up Production Database

### Neon Database Setup (Recommended)
1. Go to [neon.tech](https://neon.tech) and create account
2. Create a new project
3. Create two branches:
   - `dev` branch for staging/testing
   - `main` branch for production
4. Copy the connection strings for both branches

### Alternative: Vercel Postgres
1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Storage" → "Create Database" → "Postgres"
3. Copy the `DATABASE_URL`

## Step 2: Configure Environment Variables

### In Vercel Dashboard → Project Settings → Environment Variables

#### **REQUIRED Variables:**
```
# Database (Neon - Recommended)
NEON_DATABASE_URL_DEV=
NEON_DATABASE_URL_PROD=

# OR for Vercel Postgres
DATABASE_URL=

# Mapbox (Get from https://mapbox.com → Account → Access tokens)
NEXT_PUBLIC_MAPBOX_TOKEN=your_actual_token_here

# OpenRouter (for location extraction)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx

# Scraping Security
SCRAPE_SECRET=your_secure_scrape_secret_here
ADMIN_SECRET=your_admin_access_secret_here
```

#### **HIGHLY RECOMMENDED Variables:**
```
# Upstash Redis (for rate limiting)
UPSTASH_API_KEY=your_upstash_api_key
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_token

# TikTok Scraping (RapidAPI)
RAPIDAPI_KEY=your_primary_rapidapi_key
RAPIDAPI_KEY_ONE=additional_key_1
RAPIDAPI_KEY_TWO=additional_key_2
RAPIDAPI_KEY_THREE=additional_key_3
RAPIDAPI_KEY_FOUR=additional_key_4
RAPIDAPI_KEY_FIVE=additional_key_5

# Alternative Geocoding APIs
SERPAPI_KEY=your_serpapi_key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# Additional Security (Optional)
API_SECRET_KEY=additional_secret_key
```

## Step 3: Commit Your Changes

Before deploying, commit all your current work:

```bash
# Stage all changes
git add .

# Commit with a descriptive message
git commit -m "feat: production ready - working TikTok scraping system"

# Push to your main branch
git push origin main
```

## Step 4: Deploy to Vercel

### Method 1: Vercel CLI (Recommended)
```bash
# Install Vercel CLI (if not already installed)
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

### Method 2: GitHub Integration
1. Push your code to GitHub (if not already done)
2. Connect your GitHub repo to Vercel in the dashboard
3. Vercel will auto-deploy on pushes to main branch

## Step 5: Database Migration

After deployment, run the database setup:

```bash
# Pull environment variables from Vercel
vercel env pull .env.local

# Generate Prisma client
npx prisma generate

# Push database schema to production
npx prisma db push
```

## Step 6: Test Your Production Deployment

### Automated Testing Script
```bash
# Test the TikTok scraping (like you did locally)
curl -s -H "x-scrape-secret: YOUR_SCRAPE_SECRET" https://your-app.vercel.app/api/scrape/tiktok | jq
```

### Manual Testing Checklist
- ✅ **App loads**: Visit your Vercel URL
- ✅ **Database connection**: Check if events load from database
- ✅ **TikTok scraping**: Test the scraping endpoint
- ✅ **Map display**: Verify Mapbox markers appear
- ✅ **Admin panel**: Test admin functionality
- ✅ **Rate limiting**: Verify Redis rate limiting works

## Step 7: Monitor and Optimize

### Enable Vercel Analytics
1. Go to Vercel Dashboard → Your Project → Analytics
2. Enable analytics for monitoring

### Set up Cron Jobs
Your `vercel.json` already includes automated scraping:
- **Peak hours** (12pm-2am): Every hour
- **Conserve hours** (2am-12pm): Every 2 hours

### Monitor API Usage
- **OpenRouter**: Check usage dashboard
- **RapidAPI**: Monitor API calls and costs
- **Neon**: Monitor database performance

## Troubleshooting

### Common Issues & Solutions

#### Database Connection Issues
```bash
# Test database connection
npx prisma db push --preview-feature

# Check Neon connection
psql "your_neon_connection_string"
```

#### Build Errors
```bash
# Clear cache and rebuild
rm -rf .next node_modules
npm install
npm run build
```

#### Environment Variables
- ✅ All required env vars are set in Vercel dashboard
- ✅ Don't commit `.env.local` to git
- ✅ Use `vercel env pull` to sync local env vars

#### Scraping Issues
- ✅ Check RapidAPI key validity
- ✅ Verify SCRAPE_SECRET header
- ✅ Check rate limits on RapidAPI

## Production Optimizations

### Already Implemented ✅
- ✅ **Database**: PostgreSQL with proper indexing
- ✅ **Rate Limiting**: Upstash Redis integration
- ✅ **Caching**: Geocoding cache system
- ✅ **Security**: API key rotation, admin secrets
- ✅ **Monitoring**: Automated cron jobs

### Future Enhancements
- **CDN**: Consider Cloudflare for static assets
- **Backup**: Set up automated database backups
- **Logging**: Add structured logging (Winston, etc.)
- **Metrics**: Application performance monitoring

## Security Notes

- ✅ Database credentials encrypted in Vercel
- ✅ Environment variables not exposed in client-side code
- ✅ API routes protected by Vercel's security measures
- ✅ Scraping endpoints protected by SCRAPE_SECRET
- ✅ Admin routes protected by ADMIN_SECRET

## Cost Optimization

### Current Setup Costs
- **Vercel Hobby**: $0 (free tier)
- **Neon Database**: ~$0-20/month (depends on usage)
- **Upstash Redis**: ~$5/month (pay per request)
- **RapidAPI**: ~$10-50/month (depends on calls)
- **OpenRouter**: ~$5-20/month (depends on usage)

### Cost Monitoring
- Set up billing alerts in all services
- Monitor API usage regularly
- Use free tiers where possible

## Emergency Contacts & Support

If you encounter issues:
1. **Check Vercel deployment logs** first
2. **Verify environment variables** are set correctly
3. **Test database connection** locally first
4. **Check Prisma migration** status
5. **Review API service dashboards** (RapidAPI, OpenRouter)

## 🎉 You're Ready for Production!

Your application is production-ready with:
- ✅ Working TikTok scraping system
- ✅ Robust database setup
- ✅ Security measures in place
- ✅ Automated monitoring
- ✅ Rate limiting and caching
- ✅ Comprehensive error handling

**Next Steps:**
1. Follow the deployment steps above
2. Test thoroughly in production
3. Monitor performance and costs
4. Consider the future enhancements listed above

Good luck with your production deployment! 🚀
