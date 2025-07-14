// server/services/scrapingService.js
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { getDb } = require('../config/firebase');
const admin = require('firebase-admin');

class ScrapingService {
  constructor() {
    // Remove in-memory storage - using Firestore instead
  }

  createFandomUrl(topic) {
    return `https://${topic}.fandom.com/api.php`;
  }

  async fetchRelevantPages(category, topic) {
    const url = this.createFandomUrl(topic);
    const params = {
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${category}`,
      cmlimit: '50',
      cmtype: 'page',
      format: 'json',
    };

    try {
      const response = await axios.get(url, { params });
      const data = response.data;

      if (!data.query || !data.query.categorymembers) {
        console.error(`No pages found for category: ${category}`);
        return [];
      }

      return data.query.categorymembers.map((page) => page.title);
    } catch (error) {
      console.error(`Error fetching pages for category '${category}':`, error.message);
      throw error;
    }
  }

  async fetchPageContent(title, topic) {
    const url = this.createFandomUrl(topic);
    const params = {
      action: 'parse',
      page: title,
      format: 'json',
      prop: 'text',
    };

    try {
      const response = await axios.get(url, { params });
      const data = response.data;

      if (data.error) {
        throw new Error(`Error fetching page '${title}': ${data.error.info}`);
      }

      const htmlContent = data.parse.text['*'];
      const $ = cheerio.load(htmlContent);

      // Check if it's a category page
      if ($('div.category-page__members').length > 0) {
        console.log(`Skipping category page: ${title}`);
        return null;
      }

      // Remove unwanted elements
      $('table, script, style, aside, img').remove();

      const unwantedSectionIds = [
        'References', 'Navigation', 'External_Links', 'See_also',
        'Site_Navigation', 'Gallery', 'Merchandise', 'Major_Battles',
        'Real-life_Counterpart', 'Credits'
      ];

      // Remove unwanted sections
      unwantedSectionIds.forEach((sectionId) => {
        $(`h2 span.mw-headline#${sectionId}`).each(function () {
          const header = $(this).closest('h2');
          header.nextUntil('h2').remove();
          header.remove();
        });
      });

      // Replace links with text
      $('a').each(function () {
        const linkText = $(this).text();
        $(this).replaceWith(linkText);
      });

      // Extract and clean text
      let textContent = $.root().text();
      textContent = textContent.replace(/<\/?[^>]+(>|$)/g, '');
      textContent = textContent.replace(/\s+/g, ' ').trim();
      textContent = textContent.replace(/\[.*?\]/g, '');

      return textContent;
    } catch (error) {
      console.error(`Error fetching page '${title}':`, error.message);
      throw error;
    }
  }

  splitContent(content, maxChunkSize = 500, minChunkSize = 200) {
    const words = content.split(/\s+/);
    const chunks = [];
    let currentChunk = [];

    for (const word of words) {
      currentChunk.push(word);

      if (currentChunk.length >= maxChunkSize) {
        const chunkText = currentChunk.join(' ');
        chunks.push(chunkText);
        currentChunk = [];
      }
    }

    // Handle the last chunk
    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join(' ');
      if (chunkText.split(' ').length >= minChunkSize) {
        chunks.push(chunkText);
      } else if (chunks.length > 0) {
        const previousChunk = chunks[chunks.length - 1];
        const combinedLength = previousChunk.split(' ').length + chunkText.split(' ').length;
        if (combinedLength <= maxChunkSize + 300) {
          chunks[chunks.length - 1] = `${previousChunk} ${chunkText}`;
        }
      }
    }

    return chunks;
  }

  // Generate a unique identifier for a chunk
  generateChunkId(category, pageTitle, chunkNumber, fandomName) {
    const data = `${fandomName}_${category}_${pageTitle}_${chunkNumber}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  // Check if chunk was already processed using Firestore
  async isChunkProcessed(chunkId, fandomName) {
    try {
      const db = getDb();
      const doc = await db.collection('processedChunks').doc(chunkId).get();
      return doc.exists;
    } catch (error) {
      console.error('Error checking if chunk is processed:', error.message);
      // If there's an error, assume not processed to be safe
      return false;
    }
  }

  // Mark chunk as processed in Firestore
  async markChunkAsProcessed(chunkId, fandomName, metadata = {}) {
    try {
      const db = getDb();
      await db.collection('processedChunks').doc(chunkId).set({
        chunkId,
        fandomName,
        category: metadata.category || '',
        pageTitle: metadata.pageTitle || '',
        chunkNumber: metadata.chunkNumber || 0,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        questionsGenerated: true
      });
      console.log(`Marked chunk ${chunkId} as processed`);
    } catch (error) {
      console.error('Error marking chunk as processed:', error.message);
      // Don't throw error here as it's not critical for the main flow
    }
  }

  async getAvailableCategories(fandomWikiName, searchTerm = '', limit = 1000, offset = 0) {
    const url = this.createFandomUrl(fandomWikiName);
    const params = {
      action: 'query',
      list: 'allcategories',
      aclimit: Math.min(limit, 500).toString(), // API limit is 500 per request
      format: 'json',
    };

    // Add search prefix if provided
    if (searchTerm) {
      params.acprefix = searchTerm;
    }

    // Add offset for pagination
    if (offset > 0) {
      params.acfrom = offset.toString();
    }

    try {
      const response = await axios.get(url, { params });
      const data = response.data;

      if (!data.query || !data.query.allcategories) {
        return { categories: [], hasMore: false };
      }

      // Filter out system categories and apply additional search if needed
      const categories = data.query.allcategories
        .map(cat => cat['*'])
        .filter(cat => {
          // Filter out system categories
          if (cat.includes('Hidden') || cat.includes('Maintenance') || cat.includes('Templates')) {
            return false;
          }
          // Additional search filter if searchTerm exists but no prefix was used
          if (searchTerm && !params.acprefix && !cat.toLowerCase().includes(searchTerm.toLowerCase())) {
            return false;
          }
          return true;
        });

      // Check if there are more categories to load
      const hasMore = data.continue && data.continue.accontinue;

      return { 
        categories, 
        hasMore: !!hasMore,
        nextOffset: hasMore ? data.continue.accontinue : null
      };
    } catch (error) {
      console.error('Error fetching categories:', error.message);
      return { categories: [], hasMore: false };
    }
  }

  // Search categories with better filtering
  async searchCategories(fandomWikiName, searchTerm, limit = 100) {
    if (!searchTerm || searchTerm.length < 2) {
      return { categories: [], hasMore: false };
    }

    try {
      // First try with prefix search (more efficient)
      let result = await this.getAvailableCategories(fandomWikiName, searchTerm, limit);
      
      // If we don't have enough results, do a broader search
      if (result.categories.length < 20 && searchTerm.length >= 3) {
        const broadResult = await this.getAvailableCategories(fandomWikiName, '', 500);
        const filteredCategories = broadResult.categories
          .filter(cat => cat.toLowerCase().includes(searchTerm.toLowerCase()))
          .slice(0, limit);
        
        result = {
          categories: filteredCategories,
          hasMore: false
        };
      }

      return result;
    } catch (error) {
      console.error('Error searching categories:', error.message);
      return { categories: [], hasMore: false };
    }
  }

  // NEW: Get popular pages from Special:MostRevisions
  async getPopularPages(fandomWikiName, limit = 100) {
    console.log(`[PopularPages] Fetching popular pages for ${fandomWikiName}...`);
    
    try {
      // Go directly to scraping the Special:MostRevisions page as it's more reliable
      return await this.getPopularPagesViaScraping(fandomWikiName, limit);
      
    } catch (error) {
      console.error('[PopularPages] Error fetching popular pages:', error.message);
      throw new Error(`Failed to fetch popular pages: ${error.message}`);
    }
  }

  // Scrape the Special:MostRevisions page directly
  async getPopularPagesViaScraping(fandomWikiName, limit = 100) {
    console.log(`[PopularPages] Scraping Special:MostRevisions page...`);
    
    const url = `https://${fandomWikiName}.fandom.com/wiki/Special:MostRevisions`;
    const params = {
      limit: Math.min(limit, 500),
      offset: 0
    };

    try {
      const response = await axios.get(url, { params });
      const $ = cheerio.load(response.data);
      
      const pages = [];
      
      console.log(`[PopularPages] Page loaded, looking for revision data...`);
      
      // Look for the ordered list that contains the most revisions
      // The structure is usually: <ol><li>1. <a href="/wiki/PageName">Page Name</a> ‎ (X revisions)</li></ol>
      const possibleSelectors = [
        'ol li',  // Most likely structure
        '.mw-content-text ol li',
        '.mw-parser-output ol li',
        'ul li',  // Fallback to unordered list
        '.mw-content-text ul li'
      ];

      let foundPages = false;
      
      for (const selector of possibleSelectors) {
        const items = $(selector);
        console.log(`[PopularPages] Trying selector "${selector}" - found ${items.length} items`);
        
        if (items.length > 0) {
          items.each((index, element) => {
            if (pages.length >= limit) return;
            
            const $item = $(element);
            const fullText = $item.text().trim();
            console.log(`[PopularPages] Processing item ${index + 1}: "${fullText}"`);
            
            // Look for the link within the item
            const link = $item.find('a').first();
            
            if (link.length > 0) {
              const title = link.text().trim();
              const href = link.attr('href');
              
              // Extract revision count from the full text
              // Look for patterns like "(12,338 revisions)" or "(12338 revisions)"
              const revisionPatterns = [
                /\(([0-9,]+)\s+revisions?\)/i,
                /\(([0-9,]+)\s+revision\)/i,
                /‎\s*\(([0-9,]+)\s+revisions?\)/i,
                /\s+\(([0-9,]+)\s+revisions?\)/i
              ];
              
              let revisions = 0;
              for (const pattern of revisionPatterns) {
                const match = fullText.match(pattern);
                if (match) {
                  // Remove commas and parse as integer
                  revisions = parseInt(match[1].replace(/,/g, ''));
                  console.log(`[PopularPages] Found revisions: ${revisions} for page: ${title}`);
                  break;
                }
              }
              
              // Filter out system pages and ensure it's a content page
              if (title && 
                  href && 
                  href.includes('/wiki/') &&
                  !title.includes(':') && 
                  !title.startsWith('Category:') &&
                  !title.startsWith('Template:') &&
                  !title.startsWith('File:') &&
                  !title.startsWith('User:') &&
                  !title.startsWith('Special:') &&
                  !title.startsWith('MediaWiki:') &&
                  title.length > 2 &&
                  revisions > 0) {  // Only include pages with actual revision counts
                
                pages.push({
                  title: title,
                  revisions: revisions,
                  url: href
                });
                foundPages = true;
                console.log(`[PopularPages] Added page: ${title} (${revisions} revisions)`);
              }
            }
          });
          
          if (foundPages && pages.length > 0) {
            console.log(`[PopularPages] Successfully found ${pages.length} pages with selector "${selector}"`);
            break;
          }
        }
      }

      // If we still haven't found pages, try a more direct approach
      if (!foundPages || pages.length === 0) {
        console.log(`[PopularPages] Standard selectors failed, trying direct text parsing...`);
        
        // Look for text patterns that match the revision format directly
        const bodyText = $('body').text();
        const lines = bodyText.split('\n');
        
        for (const line of lines) {
          if (pages.length >= limit) break;
          
          // Look for lines that contain revision information
          const revisionMatch = line.match(/(\d+)\.\s*(.+?)\s*\(([0-9,]+)\s+revisions?\)/i);
          if (revisionMatch) {
            const title = revisionMatch[2].trim();
            const revisions = parseInt(revisionMatch[3].replace(/,/g, ''));
            
            if (title && 
                !title.includes(':') && 
                !title.startsWith('Category:') &&
                !title.startsWith('Template:') &&
                !title.startsWith('File:') &&
                !title.startsWith('User:') &&
                title.length > 2 &&
                revisions > 0) {
              
              pages.push({
                title: title,
                revisions: revisions,
                url: `/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
              });
              foundPages = true;
              console.log(`[PopularPages] Direct parsing found: ${title} (${revisions} revisions)`);
            }
          }
        }
      }

      // Sort by revision count (highest first)
      pages.sort((a, b) => b.revisions - a.revisions);

      console.log(`[PopularPages] Final result: ${pages.length} pages`);
      if (pages.length > 0) {
        console.log(`[PopularPages] Top 5 pages:`, pages.slice(0, 5).map(p => `${p.title} (${p.revisions} revisions)`));
      } else {
        console.log(`[PopularPages] No pages found - this might indicate a parsing issue`);
        // Log some of the page structure for debugging
        console.log(`[PopularPages] Page title:`, $('title').text());
        console.log(`[PopularPages] First few ol li items:`, $('ol li').slice(0, 3).map((i, el) => $(el).text()).get());
      }

      return {
        pages: pages,
        hasMore: pages.length === limit
      };

    } catch (error) {
      console.error('[PopularPages] Scraping approach failed:', error.message);
      throw new Error(`Failed to scrape popular pages: ${error.message}`);
    }
  }

  // Get processing statistics for a fandom
  async getProcessingStats(fandomName) {
    try {
      const db = getDb();
      const snapshot = await db.collection('processedChunks')
        .where('fandomName', '==', fandomName)
        .get();

      const stats = {
        totalChunks: snapshot.size,
        byCategory: {},
        byPage: {},
        lastProcessed: null
      };

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        
        // Count by category
        if (data.category) {
          stats.byCategory[data.category] = (stats.byCategory[data.category] || 0) + 1;
        }
        
        // Count by page
        if (data.pageTitle) {
          stats.byPage[data.pageTitle] = (stats.byPage[data.pageTitle] || 0) + 1;
        }

        // Track last processed
        if (data.processedAt && (!stats.lastProcessed || data.processedAt.toDate() > stats.lastProcessed)) {
          stats.lastProcessed = data.processedAt.toDate();
        }
      });

      return stats;
    } catch (error) {
      console.error('Error fetching processing stats:', error.message);
      return { totalChunks: 0, byCategory: {}, byPage: {}, lastProcessed: null };
    }
  }

  // Clean up old processed chunks (optional maintenance function)
  async cleanupOldChunks(olderThanDays = 30) {
    try {
      const db = getDb();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const snapshot = await db.collection('processedChunks')
        .where('processedAt', '<', cutoffDate)
        .get();

      if (snapshot.empty) {
        console.log('No old chunks to clean up');
        return 0;
      }

      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      console.log(`Cleaned up ${snapshot.size} old processed chunks`);
      return snapshot.size;
    } catch (error) {
      console.error('Error cleaning up old chunks:', error.message);
      return 0;
    }
  }
}

module.exports = new ScrapingService();