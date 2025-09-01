import { createHash } from 'crypto';

export interface HoaxFactCheck {
  guid: string;
  title: string;
  originalClaim: string;
  category: 'SALAH' | 'PENIPUAN';
  verificationMethod: string;
  investigationResult: string;
  author: string;
  sourceUrl: string;
  publicationDate: Date;
  content: string;
  contentHash: string;
}

export interface RSSItem {
  guid?: string | { '#text': string };
  title?: string | { '#text': string };
  description?: string | { '#text': string };
  link?: string | { '#text': string };
  pubDate?: string;
  'dc:creator'?: string;
}

export class HoaxContentParser {
  private readonly CATEGORY_PATTERNS = {
    SALAH: /\[SALAH\]/i,
    PENIPUAN: /\[PENIPUAN\]/i
  };

  private readonly VERIFICATION_KEYWORDS = [
    'Pemeriksaan Fakta',
    'Tim Pemeriksa Fakta',
    'Disadur dari',
    'Berdasarkan',
    'Diketahui bahwa',
    'Telah diperiksa',
    'Hasil verifikasi'
  ];

  private readonly CONCLUSION_KEYWORDS = [
    'Kesimpulan',
    'Kesimpulan:',
    'merupakan konten',
    'merupakan berita',
    'merupakan hoax',
    'merupakan palsu',
    'merupakan penipuan'
  ];

  parseItem(rssItem: RSSItem): HoaxFactCheck | null {
    try {
      const guid = this.extractGuid(rssItem);
      const title = this.extractText(rssItem.title);
      const description = this.extractText(rssItem.description);
      const link = this.extractText(rssItem.link);

      if (!guid || !title || !description || !link) {
        console.warn('Missing required fields in RSS item');
        return null;
      }

      const category = this.determineCategory(title);
      if (!category) {
        console.warn('Could not determine hoax category for:', title);
        return null;
      }

      const originalClaim = this.extractOriginalClaim(description);
      const verificationMethod = this.extractVerificationMethod(description);
      const investigationResult = this.extractInvestigationResult(description);
      const author = this.extractAuthor(rssItem['dc:creator'], description);
      const publicationDate = this.parsePublicationDate(rssItem.pubDate);
      const content = this.cleanContent(description);
      const contentHash = this.generateContentHash(title + description);

      return {
        guid,
        title,
        originalClaim,
        category,
        verificationMethod,
        investigationResult,
        author,
        sourceUrl: link,
        publicationDate,
        content,
        contentHash
      };

    } catch (error) {
      console.error('Error parsing RSS item:', error);
      return null;
    }
  }

  private extractGuid(item: RSSItem): string | null {
    if (!item.guid) return null;

    if (typeof item.guid === 'string') {
      return item.guid;
    }

    if (typeof item.guid === 'object' && item.guid['#text']) {
      return item.guid['#text'];
    }

    return null;
  }

  private extractText(field: string | { '#text': string } | undefined): string {
    if (!field) return '';
    if (typeof field === 'string') return field;
    if (typeof field === 'object' && field['#text']) return field['#text'];
    return '';
  }

  private determineCategory(title: string): 'SALAH' | 'PENIPUAN' | null {
    if (this.CATEGORY_PATTERNS.SALAH.test(title)) {
      return 'SALAH';
    }
    if (this.CATEGORY_PATTERNS.PENIPUAN.test(title)) {
      return 'PENIPUAN';
    }
    return null;
  }

  private extractOriginalClaim(description: string): string {
    // Look for common patterns in TurnBackHoax descriptions
    const patterns = [
      // Pattern: "Beredar [content] dengan klaim..."
      /(?:Beredar|B viral|Muncul)\s+([^.!?\n]+?)(?:\s+dengan\s+klaim|\s+yang\s+menyebutkan|\s+berisi)/i,
      // Pattern: "Akun [account] [posted] dengan narasi..."
      /(?:Akun|Pengguna)\s+[^"]+(?:membagikan|mengunggah|mengirim)\s+dengan\s+(?:narasi|klaim)/i,
      // Pattern: Direct quote after "klaim"
      /klaim\s*[""]([^""]+)[""]/i,
      // Pattern: "menyebutkan bahwa"
      /menyebutkan\s+(?:bahwa\s+)?([^.!?\n]+?)(?:\s+merupakan|\s+adalah|\.)/i
    ];

    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match && match[1] && match[1].length > 10) {
        return match[1].trim();
      }
    }

    // Fallback: Take first sentence if it looks like a claim
    const firstSentence = description.split(/[.!?\n]/)[0];
    if (firstSentence && firstSentence.length > 20) {
      return firstSentence.trim();
    }

    return description.substring(0, 200) + '...';
  }

  private extractVerificationMethod(description: string): string {
    // Look for verification sections
    const verificationPatterns = [
      // "Pemeriksaan Fakta" section
      /Pemeriksaan\s+Fakta\s*[:]*\s*([^]*?)(?=Kesimpulan|$)/i,
      // "Tim Pemeriksa Fakta" mentions
      /Tim\s+Pemeriksa\s+Fakta[^.!?\n]*/i,
      // Verification methods
      /(?:menelusuri|memeriksa|menggunakan|melalui)[^.!?\n]*/i,
      // Source checking
      /(?:mencari|mengecek|memverifikasi)[^.!?\n]*(?:di|ke|menggunakan)[^.!?\n]*/i
    ];

    for (const pattern of verificationPatterns) {
      const match = description.match(pattern);
      if (match && match[1] && match[1].length > 20) {
        return match[1].trim();
      }
      if (match && !match[1] && match[0].length > 20) {
        return match[0].trim();
      }
    }

    // Look for any mention of verification methods
    for (const keyword of this.VERIFICATION_KEYWORDS) {
      const index = description.indexOf(keyword);
      if (index !== -1) {
        const start = Math.max(0, index - 50);
        const end = Math.min(description.length, index + 200);
        const context = description.substring(start, end);
        return context.trim();
      }
    }

    return 'Metode verifikasi tidak teridentifikasi secara spesifik';
  }

  private extractInvestigationResult(description: string): string {
    // Look for conclusion sections
    const conclusionPatterns = [
      // "Kesimpulan" section
      /Kesimpulan\s*[:]*\s*([^]*?)$/i,
      // Content classification
      /merupakan\s+(?:konten|berita|informasi)\s+([^.!?\n]*)/i,
      // Final verdict
      /(?:diketahui|terbukti|teridentifikasi)\s+(?:sebagai|bahwa)[^.!?\n]*/i
    ];

    for (const pattern of conclusionPatterns) {
      const match = description.match(pattern);
      if (match && match[1] && match[1].length > 10) {
        return match[1].trim();
      }
      if (match && !match[1] && match[0].length > 20) {
        return match[0].trim();
      }
    }

    // Look for conclusion keywords
    for (const keyword of this.CONCLUSION_KEYWORDS) {
      const index = description.indexOf(keyword);
      if (index !== -1) {
        const start = index;
        const end = Math.min(description.length, index + 300);
        const context = description.substring(start, end);
        return context.trim();
      }
    }

    // Fallback: Take last paragraph or significant portion
    const paragraphs = description.split('\n\n');
    if (paragraphs.length > 1) {
      const lastParagraph = paragraphs[paragraphs.length - 1];
      if (lastParagraph.length > 30) {
        return lastParagraph.trim();
      }
    }

    return description.substring(Math.max(0, description.length - 200));
  }

  private extractAuthor(creator?: string, description?: string): string {
    // Try to extract from dc:creator first
    if (creator && creator.trim()) {
      return creator.trim();
    }

    // Look for author patterns in description
    const authorPatterns = [
      /\*\*\*\s*\((?:Ditulis\s+oleh|Penulis|Author)\s+([^)]+)\)/i,
      /(?:Ditulis\s+oleh|Penulis|Author)\s*:\s*([^.!?\n]+)/i,
      /(?:oleh|dari)\s+([^.!?\n]+?)(?:\s+menjelaskan|\s+mengatakan|$)/i
    ];

    if (description) {
      for (const pattern of authorPatterns) {
        const match = description.match(pattern);
        if (match && match[1] && match[1].length > 2) {
          return match[1].trim();
        }
      }
    }

    return 'Tim TurnBackHoax';
  }

  private parsePublicationDate(pubDate?: string): Date {
    if (!pubDate) {
      return new Date();
    }

    try {
      // Try parsing various date formats
      const parsed = new Date(pubDate);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }

      // Handle specific formats if needed
      // Add custom parsing logic here if TurnBackHoax uses non-standard formats

      return new Date();
    } catch (error) {
      console.warn('Failed to parse publication date:', pubDate);
      return new Date();
    }
  }

  private cleanContent(description: string): string {
    // Remove HTML tags
    let clean = description.replace(/<[^>]*>/g, '');

    // Remove excessive whitespace
    clean = clean.replace(/\s+/g, ' ').trim();

    // Remove common artifacts
    clean = clean.replace(/\*\*\*.*?\*\*\*/g, ''); // Remove bold markers
    clean = clean.replace(/\[arsip\]/gi, ''); // Remove archive markers

    return clean;
  }

  private generateContentHash(content: string): string {
    return createHash('sha256')
      .update(content)
      .digest('hex')
      .substring(0, 16); // Short hash for uniqueness
  }

  // Batch processing method
  parseItems(items: RSSItem[]): HoaxFactCheck[] {
    const results: HoaxFactCheck[] = [];

    for (const item of items) {
      const parsed = this.parseItem(item);
      if (parsed) {
        results.push(parsed);
      }
    }

    console.log(`Parsed ${results.length} out of ${items.length} RSS items`);
    return results;
  }
}

// Export singleton instance
export const hoaxParser = new HoaxContentParser();
