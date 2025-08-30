# Riot Signal - Real-time Incident Monitoring

A comprehensive riot signal web application built with Next.js, Prisma, Mapbox, and Azure OpenAI for real-time monitoring and reporting of civil unrest incidents across Indonesia.

## Features

- 📰 **News Scraping**: Automatically scrapes articles from Kompas.com and Detik.com
- 🤖 **AI Location Extraction**: Uses Azure OpenAI to extract location information from news articles
- 🗺️ **Interactive Map**: Real-time Mapbox-powered map with incident markers
- 📍 **User Reports**: Crowdsourced incident reporting with location selection
- 📡 **Real-time Updates**: Server-Sent Events for live incident updates
- 📱 **Mobile-First**: Responsive design optimized for mobile devices
- ✅ **Verification System**: Distinguishes between verified news reports and user submissions

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, TailwindCSS
- **Backend**: Next.js API Routes
- **Database**: Prisma with SQLite
- **Maps**: Mapbox GL JS
- **AI**: Azure OpenAI (GPT-4o-mini)
- **Scraping**: Cheerio for HTML parsing
- **Real-time**: Server-Sent Events

## Prerequisites

Before running this application, you'll need:

1. **Azure OpenAI Account** with GPT-4o-mini deployment
2. **Mapbox Account** with access token
3. **Node.js 18+** and **npm**

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd riot-signal
npm install
```

### 2. Environment Configuration

Create environment configuration files:

```bash
# Create env.local.ts for local development
cp env.local.ts.example env.local.ts
```

Update the following values in `env.local.ts`:

```typescript
export const localEnv = {
  mapboxToken: 'your_mapbox_access_token_here'
};
```

You'll also need to set up these environment variables (create a `.env` file or set them in your deployment):

```env
# Azure OpenAI Configuration
AZURE_OPENAI_API_KEY=your_azure_openai_api_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=your-gpt-4o-mini-deployment-name

# Database
DATABASE_URL="file:./dev.db"

# Mapbox (if not using env.local.ts)
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_token
```

### 3. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init
```

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Usage

### For Users

1. **View Incidents**: Browse the interactive map to see reported incidents
2. **Report Incidents**: Click "Report Incident" to submit your own reports
3. **Real-time Updates**: New incidents appear automatically without page refresh

### For Administrators

1. **Scrape News**: Click "Scrape News" to fetch latest articles from news sources
2. **Monitor Feed**: Watch as AI processes articles and extracts location data
3. **Verify Reports**: Verified incidents (from news) show with green borders

## API Endpoints

- `GET /api/events` - Fetch all incidents
- `POST /api/events` - Create new incident report
- `GET /api/scrape` - Scrape news articles and process them
- `GET /api/events/stream` - Server-Sent Events stream for real-time updates

## Architecture

### Data Flow

1. **News Scraping**: Cron job or manual trigger scrapes Indonesian news sites
2. **AI Processing**: Azure OpenAI extracts location names from article content
3. **Geocoding**: Mapbox converts location names to coordinates
4. **Storage**: Processed incidents stored in SQLite database via Prisma
5. **Real-time**: Server-Sent Events push updates to connected clients

### Incident Types

- **Riot** (🔥): Verified incidents from news sources
- **Crowd** (⚠️): User-reported gatherings or protests
- **Other** (📍): Miscellaneous incidents

## Deployment

### Vercel Deployment

1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy with default Next.js settings

### Database Considerations

For production, consider using:
- PostgreSQL instead of SQLite
- Database connection pooling
- Regular backup strategies

### Performance Optimization

- Implement caching for geocoding results
- Use database indexes for location queries
- Consider implementing pagination for large datasets

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Security Considerations

- Rate limiting on API endpoints
- Input validation and sanitization
- Secure storage of API keys
- CORS configuration for production
- Data privacy compliance (GDPR considerations for location data)

## Future Enhancements

- [ ] Push notifications for nearby incidents
- [ ] Social media integration for additional data sources
- [ ] Advanced filtering and search capabilities
- [ ] Incident trend analysis and visualization
- [ ] Multi-language support
- [ ] Offline functionality with service workers
# jktsafe
