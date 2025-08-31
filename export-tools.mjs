// Comprehensive CSV export tools for Safe Indonesia events
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Helper function to escape CSV fields
const escapeCSVField = (field) => {
  if (field === null || field === undefined) return '';
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

// Helper function to ensure exports directory exists
const ensureExportsDir = () => {
  const exportsDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir);
  }
  return exportsDir;
};

// Export all events
async function exportAllEvents() {
  try {
    console.log('📊 Exporting ALL events...');
    
    const events = await prisma.event.findMany({
      orderBy: { createdAt: 'desc' }
    });

    return await createCSVFile(events, 'all-events');
  } catch (error) {
    console.error('❌ Error exporting all events:', error);
  }
}

// Export events by type
async function exportByType(eventType) {
  try {
    console.log(`📊 Exporting events of type: ${eventType}...`);
    
    const events = await prisma.event.findMany({
      where: { type: eventType },
      orderBy: { createdAt: 'desc' }
    });

    return await createCSVFile(events, `type-${eventType}`);
  } catch (error) {
    console.error(`❌ Error exporting events of type ${eventType}:`, error);
  }
}

// Export events by time range
async function exportByTimeRange(hours) {
  try {
    console.log(`📊 Exporting events from last ${hours} hours...`);
    
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const events = await prisma.event.findMany({
      where: {
        createdAt: { gte: since }
      },
      orderBy: { createdAt: 'desc' }
    });

    return await createCSVFile(events, `last-${hours}h`);
  } catch (error) {
    console.error(`❌ Error exporting events from last ${hours} hours:`, error);
  }
}

// Export verified events only
async function exportVerifiedEvents() {
  try {
    console.log('📊 Exporting verified events only...');
    
    const events = await prisma.event.findMany({
      where: { verified: true },
      orderBy: { createdAt: 'desc' }
    });

    return await createCSVFile(events, 'verified-events');
  } catch (error) {
    console.error('❌ Error exporting verified events:', error);
  }
}

// Export events by source
async function exportBySource(source) {
  try {
    console.log(`📊 Exporting events from source: ${source}...`);
    
    const events = await prisma.event.findMany({
      where: { source: { contains: source, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' }
    });

    return await createCSVFile(events, `source-${source.toLowerCase()}`);
  } catch (error) {
    console.error(`❌ Error exporting events from source ${source}:`, error);
  }
}

// Export summary statistics
async function exportSummaryStats() {
  try {
    console.log('📊 Exporting summary statistics...');
    
    // Get aggregated data
    const [
      totalEvents,
      eventsByType,
      eventsBySource,
      verifiedCount,
      eventsLast24h,
      eventsLast7d
    ] = await Promise.all([
      prisma.event.count(),
      prisma.event.groupBy({
        by: ['type'],
        _count: { type: true }
      }),
      prisma.event.groupBy({
        by: ['source'],
        _count: { source: true }
      }),
      prisma.event.count({ where: { verified: true } }),
      prisma.event.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
      }),
      prisma.event.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
      })
    ]);

    // Create summary data
    const summaryData = [
      ['Metric', 'Value'],
      ['Total Events', totalEvents],
      ['Verified Events', verifiedCount],
      ['Events Last 24h', eventsLast24h],
      ['Events Last 7 days', eventsLast7d],
      ['Verification Rate', `${((verifiedCount / totalEvents) * 100).toFixed(1)}%`],
      ['', ''], // Empty row
      ['Events by Type', ''],
      ...eventsByType.map(item => [item.type, item._count.type]),
      ['', ''], // Empty row
      ['Events by Source', ''],
      ...eventsBySource.map(item => [item.source, item._count.source])
    ];

    const csvContent = summaryData.map(row => 
      row.map(field => escapeCSVField(field)).join(',')
    ).join('\n');

    const exportsDir = ensureExportsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `summary-stats-${timestamp}.csv`;
    const filepath = path.join(exportsDir, filename);

    fs.writeFileSync(filepath, csvContent, 'utf8');
    
    console.log(`✅ Summary statistics exported to: ${filepath}`);
    return filepath;

  } catch (error) {
    console.error('❌ Error exporting summary statistics:', error);
  }
}

// Core function to create CSV file
async function createCSVFile(events, suffix) {
  if (events.length === 0) {
    console.log('❌ No events found for the specified criteria');
    return null;
  }

  // Create CSV header
  const csvHeader = [
    'ID', 'Title', 'Description', 'Latitude', 'Longitude', 
    'Source', 'URL', 'Verified', 'Type', 'Extracted Location', 
    'Google Maps URL', 'Created At', 'Updated At'
  ].join(',');

  // Convert events to CSV rows
  const csvRows = events.map(event => {
    return [
      event.id,
      escapeCSVField(event.title),
      escapeCSVField(event.description),
      event.lat,
      event.lng,
      escapeCSVField(event.source),
      escapeCSVField(event.url),
      event.verified,
      escapeCSVField(event.type),
      escapeCSVField(event.extractedLocation),
      escapeCSVField(event.googleMapsUrl),
      event.createdAt.toISOString(),
      event.updatedAt.toISOString()
    ].join(',');
  });

  // Combine header and rows
  const csvContent = [csvHeader, ...csvRows].join('\n');

  // Create file
  const exportsDir = ensureExportsDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `events-${suffix}-${timestamp}.csv`;
  const filepath = path.join(exportsDir, filename);

  fs.writeFileSync(filepath, csvContent, 'utf8');

  console.log(`✅ Exported ${events.length} events to: ${filepath}`);
  console.log(`📁 File size: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB`);

  return filepath;
}

// Main function with command line interface
async function main() {
  try {
    const args = process.argv.slice(2);
    const command = args[0];

    console.log('🇮🇩 Safe Indonesia - CSV Export Tools\n');

    switch (command) {
      case 'all':
        await exportAllEvents();
        break;
      
      case 'type':
        const type = args[1];
        if (!type) {
          console.log('❌ Please specify event type: node export-tools.mjs type riot');
          break;
        }
        await exportByType(type);
        break;
      
      case 'hours':
        const hours = parseInt(args[1]);
        if (!hours || hours <= 0) {
          console.log('❌ Please specify valid hours: node export-tools.mjs hours 24');
          break;
        }
        await exportByTimeRange(hours);
        break;
      
      case 'verified':
        await exportVerifiedEvents();
        break;
      
      case 'source':
        const source = args[1];
        if (!source) {
          console.log('❌ Please specify source: node export-tools.mjs source TikTok');
          break;
        }
        await exportBySource(source);
        break;
      
      case 'stats':
        await exportSummaryStats();
        break;
      
      default:
        console.log('📋 Available commands:');
        console.log('  all                    - Export all events');
        console.log('  type <type>           - Export events by type (e.g., riot)');
        console.log('  hours <hours>         - Export events from last N hours');
        console.log('  verified              - Export only verified events');
        console.log('  source <source>       - Export events by source (e.g., TikTok)');
        console.log('  stats                 - Export summary statistics');
        console.log('\nExamples:');
        console.log('  node export-tools.mjs all');
        console.log('  node export-tools.mjs type riot');
        console.log('  node export-tools.mjs hours 24');
        console.log('  node export-tools.mjs verified');
        console.log('  node export-tools.mjs source TikTok');
        console.log('  node export-tools.mjs stats');
        break;
    }

  } catch (error) {
    console.error('❌ Export failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
