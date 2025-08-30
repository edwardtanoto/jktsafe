#!/bin/bash

# Cloudflare Worker Setup Script for Riot Signal News Scraper
# This script helps set up the Cloudflare Worker with all required secrets

echo "🚀 Setting up Riot Signal Cloudflare Worker"
echo "=========================================="

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    npm install -g wrangler
fi

# Navigate to worker directory
cd riot-scraper-worker

echo ""
echo "📝 Step 1: Login to Cloudflare (if not already logged in)"
wrangler auth login

echo ""
echo "🔐 Step 2: Set up required secrets"
echo "Please provide your API keys:"
echo ""

# Azure OpenAI Setup
echo "Azure OpenAI Configuration:"
read -p "Enter your Azure OpenAI API Key: " azure_key
read -p "Enter your Azure OpenAI Endpoint (e.g., https://your-resource.openai.azure.com/): " azure_endpoint
read -p "Enter your Azure OpenAI Deployment Name (e.g., gpt-4o-mini): " azure_deployment

echo ""
echo "Mapbox Configuration:"
read -p "Enter your Mapbox Access Token: " mapbox_token

echo ""
echo "Google News API (Optional):"
read -p "Enter your Google News API Key (press Enter to skip): " google_news_key

echo ""
echo "Main App URL:"
read -p "Enter your main app URL (e.g., https://riot-signal.vercel.app): " main_app_url

# Set secrets
echo ""
echo "🔒 Setting up secrets..."

wrangler secret put AZURE_OPENAI_API_KEY <<EOF
$azure_key
EOF

wrangler secret put AZURE_OPENAI_ENDPOINT <<EOF
$azure_endpoint
EOF

wrangler secret put AZURE_OPENAI_DEPLOYMENT <<EOF
$azure_deployment
EOF

wrangler secret put MAPBOX_ACCESS_TOKEN <<EOF
$mapbox_token
EOF

if [ ! -z "$google_news_key" ]; then
    wrangler secret put GOOGLE_NEWS_API_KEY <<EOF
    $google_news_key
    EOF
fi

# Set environment variables
echo ""
echo "⚙️ Setting up environment variables..."
wrangler secret put MAIN_APP_URL <<EOF
$main_app_url
EOF

echo ""
echo "🚀 Step 3: Deploy the worker"
wrangler deploy

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎯 Your worker will run automatically every 30 minutes"
echo "🔗 Worker URL: $(wrangler deploy | grep -o 'https://.*\.workers\.dev')"
echo ""
echo "🧪 Test the worker:"
echo "curl $(wrangler deploy | grep -o 'https://.*\.workers\.dev')/manual-trigger"
echo ""
echo "📊 Monitor your worker:"
echo "wrangler tail"
