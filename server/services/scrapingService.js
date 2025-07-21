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

      console.log(`[Content] Raw HTML length: ${htmlContent.length} characters`);
      console.log(`[Content] Found elements: h1=${$('h1').length}, h2=${$('h2').length}, h3=${$('h3').length}, p=${$('p').length}`);

      // Remove unwanted elements but keep structure for section parsing
      $('script, style, .navbox, .sidebar, .toc, .thumb, .gallery').remove();
      
      // Remove edit links but keep the content structure
      $('span.mw-editsection').remove();

      const unwantedSectionIds = [
        'References', 'Navigation', 'External_Links', 'See_also',
        'Site_Navigation', 'Gallery', 'Merchandise',
        'Real-life_Counterpart', 'Credits', 'Notes'
      ];

      // Remove unwanted sections more aggressively
      unwantedSectionIds.forEach((sectionId) => {
        // Try multiple selectors for section removal
        $(`#${sectionId}, #${sectionId.toLowerCase()}, [id*="${sectionId}"]`).each(function() {
          const $header = $(this).closest('h1, h2, h3, h4, h5, h6');
          if ($header.length > 0) {
            // Remove everything until the next header of same or higher level
            const headerLevel = parseInt($header[0].tagName.charAt(1));
            let $current = $header.next();
            
            while ($current.length > 0) {
              const $next = $current.next();
              const currentTag = $current[0].tagName?.toLowerCase();
              
              // Stop if we hit another header of same or higher level
              if (currentTag && currentTag.match(/^h[1-6]$/)) {
                const currentLevel = parseInt(currentTag.charAt(1));
                if (currentLevel <= headerLevel) {
                  break;
                }
              }
              
              $current.remove();
              $current = $next;
            }
            
            // Remove the header itself
            $header.remove();
          }
        });
        
        // Also try span-based selectors for Fandom wikis
        $(`span.mw-headline#${sectionId}, span.mw-headline#${sectionId.toLowerCase()}`).each(function () {
          const header = $(this).closest('h1, h2, h3, h4, h5, h6');
          if (header.length > 0) {
            const headerLevel = parseInt(header[0].tagName.charAt(1));
            let next = header.next();
            
            while (next.length > 0 && !next.is(`h1, h2, h3, h4, h5, h6`)) {
              const toRemove = next;
              next = next.next();
              toRemove.remove();
            }
            
            header.remove();
          }
        });
      });

      console.log(`[Content] After cleanup: h1=${$('h1').length}, h2=${$('h2').length}, h3=${$('h3').length}, p=${$('p').length}`);

      // Extract sections with their structure
      return this.extractSections($, title);

    } catch (error) {
      console.error(`Error fetching page '${title}':`, error.message);
      throw error;
    }
  }

  // NEW: Extract sections from parsed HTML
  extractSections($, pageTitle) {
    console.log(`[Sections] Extracting sections from: ${pageTitle}`);
    
    const sections = [];
    let currentSection = {
      title: 'Introduction',
      level: 1,
      content: '',
      wordCount: 0
    };

    // Fandom wikis use specific structure - let's target the main content area
    const contentArea = $('.mw-parser-output, .mw-content-text, .page-content').first();
    if (contentArea.length === 0) {
      console.log('[Sections] Could not find main content area, using body');
      contentArea = $('body');
    }

    // Process all direct children of the content area
    contentArea.children().each((index, element) => {
      const $el = $(element);
      const tagName = element.tagName?.toLowerCase();

      // Check if this is a section header (h1, h2, h3, h4, h5, h6)
      if (tagName && tagName.match(/^h[1-6]$/)) {
        // Save current section if it has content
        if (currentSection.content.trim().length > 0) {
          currentSection.wordCount = this.countWords(currentSection.content);
          sections.push({ ...currentSection });
          console.log(`[Sections] Saved section: "${currentSection.title}" (${currentSection.wordCount} words)`);
        }

        // Extract header text - try multiple selectors for Fandom wikis
        let headerText = '';
        
        // Try different ways to get the header text
        const headlineSpan = $el.find('.mw-headline').first();
        if (headlineSpan.length > 0) {
          headerText = headlineSpan.text().trim();
        } else {
          // Fallback to full header text
          headerText = $el.text().trim();
        }

        // Clean up header text
        headerText = headerText
          .replace(/\[edit\]/g, '') // Remove [edit] links
          .replace(/\[[^\]]*\]/g, '') // Remove other bracketed content
          .trim();
        
        if (headerText && headerText.length > 0) {
          console.log(`[Sections] Found header: "${headerText}" (${tagName})`);
          
          currentSection = {
            title: headerText,
            level: parseInt(tagName.charAt(1)), // h2 -> 2, h3 -> 3, etc.
            content: '',
            wordCount: 0
          };
        }
      } else {
        // Add content to current section
        let textContent = '';
        
        // Handle different content types
        if (tagName === 'p' || tagName === 'div' || tagName === 'ul' || tagName === 'ol' || tagName === 'dl') {
          // For paragraphs and lists, extract text
          const clonedEl = $el.clone();
          
          // Remove unwanted elements
          clonedEl.find('script, style, .navbox, .infobox, .toc, .references, .reflist').remove();
          
          // Replace links with their text content
          clonedEl.find('a').each(function() {
            $(this).replaceWith($(this).text());
          });
          
          textContent = clonedEl.text();
        } else if (tagName === 'table') {
          // Skip most tables unless they contain significant text content
          const tableText = $el.text();
          if (tableText.length > 100) {
            textContent = tableText;
          }
        }
        
        if (textContent && textContent.trim().length > 0) {
          const cleanText = textContent
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/\[.*?\]/g, '') // Remove reference brackets
            .replace(/\([^)]*edit[^)]*\)/g, '') // Remove (edit) links
            .trim();
          
          if (cleanText.length > 10) { // Only add substantial content
            currentSection.content += (currentSection.content ? ' ' : '') + cleanText;
          }
        }
      }
    });

    // Don't forget the last section
    if (currentSection.content.trim().length > 0) {
      currentSection.wordCount = this.countWords(currentSection.content);
      sections.push(currentSection);
      console.log(`[Sections] Saved final section: "${currentSection.title}" (${currentSection.wordCount} words)`);
    }

    console.log(`[Sections] Found ${sections.length} raw sections`);
    
    // Log section titles for debugging
    sections.forEach((section, index) => {
      console.log(`[Sections] Section ${index + 1}: "${section.title}" (${section.wordCount} words)`);
    });
    
    // Process sections according to word count rules
    return this.processSections(sections);
  }

  // NEW: Process sections according to word count rules
  processSections(rawSections) {
    console.log(`[Sections] Processing ${rawSections.length} raw sections...`);
    
    const processedSections = [];
    let currentSection = null;

    for (let i = 0; i < rawSections.length; i++) {
      const section = rawSections[i];
      
      console.log(`[Sections] Processing: "${section.title}" (${section.wordCount} words)`);

      if (!currentSection) {
        currentSection = { ...section };
      } else {
        // Merge sections if current is below minimum
        if (currentSection.wordCount < 200) {
          console.log(`[Sections] Merging "${currentSection.title}" with "${section.title}" (below 200 words)`);
          currentSection.title = `${currentSection.title} & ${section.title}`;
          currentSection.content += ' ' + section.content;
          currentSection.wordCount = this.countWords(currentSection.content);
        } else {
          // Current section is valid, save it and start new one
          processedSections.push(this.finalizeSection(currentSection));
          currentSection = { ...section };
        }
      }

      // Check if current section exceeds maximum
      if (currentSection.wordCount > 2000) {
        console.log(`[Sections] Truncating "${currentSection.title}" (exceeds 2000 words)`);
        const words = currentSection.content.split(/\s+/);
        currentSection.content = words.slice(0, 2000).join(' ');
        currentSection.wordCount = 2000;
      }
    }

    // Handle the last section
    if (currentSection) {
      if (currentSection.wordCount >= 200) {
        processedSections.push(this.finalizeSection(currentSection));
      } else if (processedSections.length > 0) {
        // Merge with previous section if below minimum
        console.log(`[Sections] Merging final section "${currentSection.title}" with previous section`);
        const lastSection = processedSections[processedSections.length - 1];
        lastSection.title = `${lastSection.title} & ${currentSection.title}`;
        lastSection.content += ' ' + currentSection.content;
        lastSection.wordCount = this.countWords(lastSection.content);
        lastSection.questionCount = Math.ceil(lastSection.wordCount / 100);
      }
    }

    console.log(`[Sections] Final result: ${processedSections.length} sections`);
    processedSections.forEach(section => {
      console.log(`[Sections] - "${section.title}": ${section.wordCount} words, ${section.questionCount} questions`);
    });

    return processedSections;
  }

  // NEW: Finalize section with question count calculation
  finalizeSection(section) {
    const questionCount = Math.ceil(section.wordCount / 100);
    return {
      ...section,
      questionCount: Math.max(1, questionCount) // Minimum 1 question per section
    };
  }

  // NEW: Count words in text
  countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  // Generate a unique identifier for a section
  generateSectionId(category, pageTitle, sectionTitle, fandomName) {
    const data = `${fandomName}_${category}_${pageTitle}_${sectionTitle}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  // Check if section was already processed using Firestore
  async isSectionProcessed(sectionId, fandomName) {
    try {
      const db = getDb();
      const doc = await db.collection('processedSections').doc(sectionId).get();
      return doc.exists;
    } catch (error) {
      console.error('Error checking if section is processed:', error.message);
      // If there's an error, assume not processed to be safe
      return false;
    }
  }

  // Mark section as processed in Firestore
  async markSectionAsProcessed(sectionId, fandomName, metadata = {}) {
    try {
      const db = getDb();
      await db.collection('processedSections').doc(sectionId).set({
        sectionId,
        fandomName,
        category: metadata.category || '',
        pageTitle: metadata.pageTitle || '',
        sectionTitle: metadata.sectionTitle || '',
        wordCount: metadata.wordCount || 0,
        questionsGenerated: metadata.questionsGenerated || 0,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`Marked section ${sectionId} as processed`);
    } catch (error) {
      console.error('Error marking section as processed:', error.message);
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
      
      // Check both old chunk-based and new section-based processing
      const chunksSnapshot = await db.collection('processedChunks')
        .where('fandomName', '==', fandomName)
        .get();
        
      const sectionsSnapshot = await db.collection('processedSections')
        .where('fandomName', '==', fandomName)
        .get();

      const stats = {
        totalChunks: chunksSnapshot.size, // Legacy chunk processing
        totalSections: sectionsSnapshot.size, // New section processing
        byCategory: {},
        byPage: {},
        lastProcessed: null
      };

      // Process legacy chunks
      chunksSnapshot.docs.forEach(doc => {
        const data = doc.data();
        
        if (data.category) {
          stats.byCategory[data.category] = (stats.byCategory[data.category] || 0) + 1;
        }
        
        if (data.pageTitle) {
          stats.byPage[data.pageTitle] = (stats.byPage[data.pageTitle] || 0) + 1;
        }

        if (data.processedAt && (!stats.lastProcessed || data.processedAt.toDate() > stats.lastProcessed)) {
          stats.lastProcessed = data.processedAt.toDate();
        }
      });

      // Process new sections
      sectionsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        
        if (data.category) {
          stats.byCategory[data.category] = (stats.byCategory[data.category] || 0) + 1;
        }
        
        if (data.pageTitle) {
          stats.byPage[data.pageTitle] = (stats.byPage[data.pageTitle] || 0) + 1;
        }

        if (data.processedAt && (!stats.lastProcessed || data.processedAt.toDate() > stats.lastProcessed)) {
          stats.lastProcessed = data.processedAt.toDate();
        }
      });

      return stats;
    } catch (error) {
      console.error('Error fetching processing stats:', error.message);
      return { totalChunks: 0, totalSections: 0, byCategory: {}, byPage: {}, lastProcessed: null };
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