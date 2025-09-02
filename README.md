# Safe - OSINT Monitoring for Safety during Civil Unrests

A comprehensive safety monitoring platform for Indonesia that tracks protests, hoaxes, road closures, and safety incidents in real-time.

## 🎯 What It Does

- **🗺️ Interactive Map**: Real-time map showing civil unrests across Indonesia
- **🤖 AI Chat Assistant**: Ask questions about current safety situations
- **📰 News Monitoring**: Automatically processes news articles and social media
- **🚧 Road Closures**: Track and report road closure incidents
- **🔍 Hoax Detection**: Monitor and search fact-checked hoax information
- **📱 Mobile-First**: Optimized for mobile devices

## 🏗️ Architecture

<div align="center">
  <img src="https://safe.100ai.id/system.png" alt="Safe Indonesia System Architecture" width="800" />
  <p><em>System Architecture Overview</em></p>
</div>


## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, TailwindCSS
- **Backend**: Next.js API Routes
- **Database**: Neon PostgreSQL with Prisma ORM
- **Cache**: Upstash Redis
- **AI**: OpenRouter (GPT models)
- **Maps**: Mapbox GL JS
- **Real-time**: Server-Sent Events

## 🚀 Quick Start

### 1. Clone and Install
```bash
git clone <repository-url>
cd jktsafe
npm install
```

### 2. Environment Setup
Check `env-template.txt`



### 3. Database Setup
```bash
npx prisma generate
npx prisma migrate dev
```

### 4. Run Development Server
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## 📊 Key Features

### Real-time Monitoring
- **Events**: Protest incidents, demonstrations, civil unrest
- **Hoaxes**: Fact-checked misinformation tracking
- **Road Closures**: Traffic and infrastructure incidents
- **Warning Markers**: Social media-based safety alerts

### AI-Powered Processing
- **Location Extraction**: AI identifies locations from text and images
- **Content Analysis**: Processes Indonesian news and social media
- **Smart Geocoding**: Converts location names to coordinates with caching
- **Duplicate Prevention**: Geocoding cache prevents same location processing twice
- **Vector Search**: Semantic search for hoax content


### User Interface
- **Interactive Map**: Real-time incident visualization
- **Chat Assistant**: Natural language queries about safety
- **Mobile Responsive**: Optimized for mobile devices
- **Admin Tools**: Content management

## 🔧 API Endpoints

- `GET /api/events` - Fetch safety incidents
- `POST /api/events` - Report new incident
- `GET /api/chat` - AI chat interface
- `GET /api/hoax/search` - Search hoax database
- `GET /api/road-closures` - Road closure data
- `GET /api/events/stream` - Real-time updates

## 🚀 Deployment

### Vercel (Recommended)
1. Connect repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy with default Next.js settings

## 📱 Mobile Optimization

- **iOS Safari Fix**: Input fields use 16px font to prevent zoom
- **Touch-Friendly**: Large tap targets and gestures
- **Responsive Design**: Adapts to all screen sizes
- **Offline Support**: Cached data for basic functionality

## 🔒 Security & Privacy

- **Rate Limiting**: API endpoints protected
- **Input Validation**: All user inputs sanitized
- **Secure Storage**: API keys in environment variables
- **CORS Configuration**: Proper cross-origin setup

## 📈 Performance

- **Smart Caching**: 
  - Redis for frequently accessed data
  - Geocoding cache prevents duplicate API calls
  - 30-day cache validity with usage tracking
- **Database Indexing**: Optimized queries with proper indexes
- **Image Optimization**: Next.js automatic optimization
- **CDN**: Vercel Edge Network
- **Rate Limiting**: API call throttling to prevent overuse

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

---

**Safe Indonesia** - Keeping communities informed and safe through real-time monitoring and AI-powered insights.

