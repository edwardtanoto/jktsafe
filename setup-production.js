#!/usr/bin/env node

/**
 * Production Setup Script
 * Run this after deploying to Vercel to set up the database
 */

const { execSync } = require('child_process');

console.log('🚀 Setting up production database...\n');

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable not found!');
  console.log('Please set DATABASE_URL in your Vercel environment variables.');
  process.exit(1);
}

console.log('✅ Database URL found');
console.log('📦 Installing dependencies...');

try {
  // Install dependencies
  execSync('npm install', { stdio: 'inherit' });

  console.log('🔧 Generating Prisma client...');
  // Generate Prisma client
  execSync('npx prisma generate', { stdio: 'inherit' });

  console.log('🗄️ Pushing database schema...');
  // Push database schema
  execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });

  console.log('✅ Production setup complete!');
  console.log('\n🎉 Your app should now be working at your Vercel URL');
  console.log('🔗 Test the TikTok scraping and map features');

} catch (error) {
  console.error('❌ Setup failed:', error.message);
  console.log('\n🔧 Troubleshooting:');
  console.log('1. Check your DATABASE_URL is correct');
  console.log('2. Ensure your database allows connections from Vercel');
  console.log('3. Check Vercel deployment logs for more details');
  process.exit(1);
}
