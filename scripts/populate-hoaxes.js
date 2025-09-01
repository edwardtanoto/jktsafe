#!/usr/bin/env node

/**
 * One-time script to populate the hoax database with initial TurnBackHoax data
 * Run this once to seed your database with existing fact-checks
 */

const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const crypto = require('crypto');

const prisma = new PrismaClient();

// RSS Feed Configuration
const RSS_CONFIG = {
  feedUrl: 'https://turnbackhoax.id/feed/',
  userAgent: 'SafeJakarta-Bot/1.0 (+https://safe-jakarta.vercel.app)',
  maxRetries: 3,
  retryDelay: 5000
};

// XML Parser
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text'
});

// RSS Feed Fetching Function
async function fetchRSSFeed() {
  let lastError = null;

  for (let attempt = 1; attempt <= RSS_CONFIG.maxRetries; attempt++) {
    try {
      console.log(`📡 Fetching RSS feed (attempt ${attempt}/${RSS_CONFIG.maxRetries})`);

      const response = await axios.get(RSS_CONFIG.feedUrl, {
        headers: {
          'User-Agent': RSS_CONFIG.userAgent,
          'Accept': 'application/rss+xml, application/xml, text/xml'
        },
        timeout: 30000
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const parsedData = parser.parse(response.data);

      if (!parsedData.rss?.channel?.item) {
        throw new Error('Invalid RSS structure');
      }

      const items = parsedData.rss.channel.item;
      const itemArray = Array.isArray(items) ? items : [items];

      return itemArray;

    } catch (error) {
      lastError = error;
      console.error(`❌ Attempt ${attempt} failed:`, error.message);

      if (attempt < RSS_CONFIG.maxRetries) {
        console.log(`⏳ Waiting ${RSS_CONFIG.retryDelay}ms before retry...`);
        await delay(RSS_CONFIG.retryDelay);
      }
    }
  }

  throw lastError || new Error('Failed to fetch RSS feed after all retries');
}

// Helper function to extract text from RSS fields
function extractText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'object' && field['#text']) return field['#text'];
  return '';
}

// Hoax parsing function (simplified version)
function parseHoaxItem(rssItem) {
  try {
    const guid = extractText(rssItem.guid) || extractText(rssItem.link);
    const title = extractText(rssItem.title);
    const description = extractText(rssItem.description);
    const link = extractText(rssItem.link);

    if (!guid || !title || !description || !link) {
      return null;
    }

    const category = title.includes('[SALAH]') ? 'SALAH' :
                    title.includes('[PENIPUAN]') ? 'PENIPUAN' : 'SALAH';

    const originalClaim = extractOriginalClaim(description);
    const investigationResult = extractInvestigationResult(description);
    const author = extractAuthor(rssItem['dc:creator'], description);
    const publicationDate = parsePublicationDate(rssItem.pubDate);
    const content = cleanContent(description);
    const contentHash = generateContentHash(title + description);

    return {
      guid,
      title,
      originalClaim,
      category,
      verificationMethod: 'Pemeriksaan Fakta Tim TurnBackHoax',
      investigationResult,
      author,
      sourceUrl: link,
      publicationDate,
      content,
      contentHash
    };

  } catch (error) {
    console.error('Error parsing hoax item:', error);
    return null;
  }
}

// Extract original claim from description
function extractOriginalClaim(description) {
  const patterns = [
    /(?:Beredar|B viral|Muncul)\s+([^.!?\n]+?)(?:\s+dengan\s+klaim|\s+yang\s+menyebutkan|\s+berisi)/i,
    /(?:Akun|Pengguna)\s+[^"]+(?:membagikan|mengunggah|mengirim)\s+dengan\s+(?:narasi|klaim)/i,
    /klaim\s*[""]([^""]+)[""]/i
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1] && match[1].length > 10) {
      return match[1].trim();
    }
  }

  const firstSentence = description.split(/[.!?\n]/)[0];
  return firstSentence && firstSentence.length > 20 ? firstSentence.trim() :
         description.substring(0, 200) + '...';
}

// Extract investigation result
function extractInvestigationResult(description) {
  const conclusionPatterns = [
    /Kesimpulan\s*[:]*\s*([^]*?)$/i,
    /merupakan\s+(?:konten|berita|informasi)\s+([^.!?\n]*)/i
  ];

  for (const pattern of conclusionPatterns) {
    const match = description.match(pattern);
    if (match && match[1] && match[1].length > 10) {
      return match[1].trim();
    }
  }

  const paragraphs = description.split('\n\n');
  if (paragraphs.length > 1) {
    const lastParagraph = paragraphs[paragraphs.length - 1];
    if (lastParagraph.length > 30) {
      return lastParagraph.trim();
    }
  }

  return description.substring(Math.max(0, description.length - 200));
}

// Extract author
function extractAuthor(creator, description) {
  if (creator && creator.trim()) {
    return creator.trim();
  }

  const authorPattern = /(?:Ditulis\s+oleh|Penulis)\s*[:]*\s*([^.!?\n]+)/i;
  const match = description.match(authorPattern);
  if (match && match[1]) {
    return match[1].trim();
  }

  return 'Tim TurnBackHoax';
}

// Parse publication date
function parsePublicationDate(pubDate) {
  if (!pubDate) return new Date();

  try {
    const parsed = new Date(pubDate);
    return !isNaN(parsed.getTime()) ? parsed : new Date();
  } catch {
    return new Date();
  }
}

// Clean content
function cleanContent(description) {
  return description
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Generate content hash
function generateContentHash(content) {
  return crypto.createHash('sha256')
    .update(content)
    .digest('hex')
    .substring(0, 16);
}

// Delay helper
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function populateHoaxes() {
  console.log('🚀 Starting hoax database population...');

  try {
    // Check current hoax count
    const existingCount = await prisma.hoaxFactCheck.count();
    console.log(`📊 Currently have ${existingCount} hoaxes in database`);

    if (existingCount > 0) {
      console.log('⚠️  Database already has hoaxes. Skipping population to avoid duplicates.');
      console.log('💡 If you want to refresh data, clear the hoax_fact_checks table first.');
      return;
    }

    console.log('📡 Fetching RSS feed from TurnBackHoax.ID...');

    // Fetch RSS feed directly
    const rssItems = await fetchRSSFeed();

    if (!rssItems || rssItems.length === 0) {
      console.error('❌ Failed to fetch RSS feed or no items found');
      process.exit(1);
    }

    console.log(`✅ Successfully fetched ${rssItems.length} items from RSS feed`);

    const newItems = rssItems;
    console.log(`📦 Processing ${newItems.length} cached items...`);

    // Parse and process items in batches
    const batchSize = 10;
    let processed = 0;
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < newItems.length; i += batchSize) {
      const batch = newItems.slice(i, i + batchSize);
      console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(newItems.length/batchSize)}`);

      const batchResults = await processBatch(batch);
      processed += batch.length;
      successful += batchResults.successful;
      failed += batchResults.failed;

      // Progress update
      console.log(`📈 Progress: ${processed}/${newItems.length} (${successful} successful, ${failed} failed)`);

      // Small delay between batches to avoid overwhelming APIs
      if (i + batchSize < newItems.length) {
        await delay(1000);
      }
    }

    // Final statistics
    console.log('\n🎉 Population complete!');
    console.log(`📊 Final Statistics:`);
    console.log(`   • Total processed: ${processed}`);
    console.log(`   • Successful: ${successful}`);
    console.log(`   • Failed: ${failed}`);
    console.log(`   • Success rate: ${((successful/processed)*100).toFixed(1)}%`);

    // Get final hoax count
    const finalCount = await prisma.hoaxFactCheck.count();
    console.log(`📊 Database now contains ${finalCount} hoaxes`);

    // No cache cleanup needed in simplified version
    console.log('✅ Database population completed successfully!');

  } catch (error) {
    console.error('❌ Population failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function processBatch(items) {
  const results = [];
  let successful = 0;
  let failed = 0;

  for (const item of items) {
    try {
      // Convert RSS item format
      const rssItem = {
        guid: item.guid,
        title: item.title,
        description: item.description,
        link: item.link,
        pubDate: item.pubDate,
        'dc:creator': item.creator
      };

      // Parse the item using inline function
      const parsedHoax = parseHoaxItem(rssItem);

      if (!parsedHoax) {
        console.warn(`⚠️  Failed to parse item: ${item.title}`);
        failed++;
        continue;
      }

      // Store directly in database
      try {
        await prisma.hoaxFactCheck.upsert({
          where: { rssGuid: parsedHoax.guid },
          update: {
            title: parsedHoax.title,
            originalClaim: parsedHoax.originalClaim,
            hoaxCategory: parsedHoax.category,
            verificationMethod: parsedHoax.verificationMethod,
            investigationResult: parsedHoax.investigationResult,
            authorName: parsedHoax.author,
            sourceUrl: parsedHoax.sourceUrl,
            publicationDate: parsedHoax.publicationDate,
            contentHash: parsedHoax.contentHash,
            updatedAt: new Date()
          },
          create: {
            rssGuid: parsedHoax.guid,
            title: parsedHoax.title,
            originalClaim: parsedHoax.originalClaim,
            hoaxCategory: parsedHoax.category,
            verificationMethod: parsedHoax.verificationMethod,
            investigationResult: parsedHoax.investigationResult,
            authorName: parsedHoax.author,
            sourceUrl: parsedHoax.sourceUrl,
            publicationDate: parsedHoax.publicationDate,
            contentHash: parsedHoax.contentHash
          }
        });

        successful++;
        results.push({ success: true, hoaxId: parsedHoax.guid });

      } catch (error) {
        console.warn(`⚠️  Failed to store hoax: ${error.message}`);
        failed++;
      }

    } catch (error) {
      console.error(`❌ Error processing item ${item.guid}:`, error);
      failed++;
    }
  }

  return { successful, failed, results };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the population if this script is executed directly
if (require.main === module) {
  populateHoaxes()
    .then(() => {
      console.log('✅ Population script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Population script failed:', error);
      process.exit(1);
    });
}

module.exports = { populateHoaxes };
