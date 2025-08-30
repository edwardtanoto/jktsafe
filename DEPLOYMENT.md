# 🚀 Deployment Guide for Safe Indonesia

## Prerequisites

1. **Vercel Account**: [Sign up at vercel.com](https://vercel.com)
2. **GitHub Repository**: Your code should be in a Git repository

## Step 1: Set up Vercel Postgres Database

### Option A: Vercel Postgres (Recommended)
1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Storage" → "Create Database" → "Postgres"
3. Choose your project or create a new one
4. Copy the `DATABASE_URL` from the connection details

### Option B: Alternative Hosted Databases
- **PlanetScale**: [planetscale.com](https://planetscale.com)
- **Neon**: [neon.tech](https://neon.tech)
- **Supabase**: [supabase.com](https://supabase.com)

## Step 2: Configure Environment Variables

In your Vercel project settings, add these environment variables:

### Required Variables:
```
DATABASE_URL=postgresql://username:password@host:port/database
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1... (from Mapbox)
OPENROUTER_API_KEY=sk-or-v1... (from OpenRouter)
APP_URL=https://your-app.vercel.app
```

### Optional Variables:
```
RAPIDAPI_KEY=your-rapidapi-key
SERP_API_KEY=your-serp-api-key
```

## Step 3: Deploy to Vercel

### Method 1: Vercel CLI (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

### Method 2: GitHub Integration
1. Push your code to GitHub
2. Connect your GitHub repo to Vercel
3. Vercel will auto-deploy on pushes to main branch

## Step 4: Database Setup

After deployment, run the database migration:

```bash
# If using Vercel CLI
vercel env pull .env.local
prisma db push

# Or run directly on production
npx prisma db push
```

## Step 5: Test Your Deployment

1. **Check the app loads**: Visit your Vercel URL
2. **Test database connection**: Events should load from database
3. **Test scraping**: Try the TikTok scraping feature
4. **Test maps**: Verify Mapbox markers appear

## Troubleshooting

### Database Connection Issues
```bash
# Test database connection
npx prisma db push --preview-feature
```

### Build Errors
```bash
# Clear cache and rebuild
rm -rf .next node_modules
npm install
npm run build
```

### Environment Variables
- Make sure all required env vars are set in Vercel dashboard
- Don't commit `.env.local` to git
- Use `vercel env pull` to sync local env vars

## Production Optimizations

1. **Database**: Use connection pooling for better performance
2. **API Routes**: Add rate limiting for scraping endpoints
3. **Caching**: Implement Redis for frequently accessed data
4. **Monitoring**: Set up Vercel Analytics and error tracking

## Security Notes

- ✅ Database credentials are encrypted in Vercel
- ✅ Environment variables are not exposed in client-side code
- ✅ API routes are protected by Vercel's security measures

## Cost Considerations

- **Vercel Hobby**: Free for personal projects
- **Database**: ~$0-20/month depending on usage
- **API Calls**: Monitor OpenRouter and RapidAPI usage

## Need Help?

If you encounter issues:
1. Check Vercel deployment logs
2. Verify all environment variables are set
3. Test database connection locally first
4. Check Prisma migration status
