// server/services/scrapingService.js
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { supabase } = require('../config/supabase');

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

class ScrapingService {
  constructor() {}

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
      const response = await axios.get(url, { params, headers: BROWSER_HEADERS });
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

  // ENHANCED: Now accepts options including skipSections
  async fetchPageContent(title, topic, options = {}) {
    const url = this.createFandomUrl(topic);
    const params = {
      action: 'parse',
      page: title,
      format: 'json',
      prop: 'text',
    };

    try {
      const response = await axios.get(url, { params, headers: BROWSER_HEADERS });
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

      // ENHANCED: Use configurable skip sections instead of hardcoded list
      const skipSections = options.skipSections || [];
      
      if (skipSections.length > 0) {
        console.log(`[Content] Applying section filtering: ${skipSections.length} section types to skip`);
        console.log(`[Content] Skip list: ${skipSections.slice(0, 10).join(', ')}${skipSections.length > 10 ? '...' : ''}`);
        
        this.removeUnwantedSections($, skipSections);
      } else {
        console.log(`[Content] No section filtering applied - processing all sections`);
      }

      console.log(`[Content] After cleanup: h1=${$('h1').length}, h2=${$('h2').length}, h3=${$('h3').length}, p=${$('p').length}`);

      // Extract sections with their structure
      return this.extractSections($, title, skipSections);

    } catch (error) {
      console.error(`Error fetching page '${title}':`, error.message);
      throw error;
    }
  }

  // NEW: Enhanced method to remove unwanted sections with better pattern matching
// server/services/scrapingService.js - FIXED removeUnwantedSections method
// This is just the fixed method - add this to your existing scrapingService.js

  // NEW: Enhanced method to remove unwanted sections with better pattern matching
  removeUnwantedSections($, skipSections) {
    let removedSections = 0;
    const normalizedSkipSections = skipSections.map(s => s.toLowerCase().trim());
    
    // CRITICAL FIX: Store reference to 'this' for use inside callbacks
    const self = this;
    
    console.log(`[SectionFilter] Starting section removal with ${skipSections.length} patterns...`);

    // Multiple approaches to find and remove sections
    
    // 1. Direct ID matching (most common in Fandom wikis)
    normalizedSkipSections.forEach((sectionPattern) => {
      const variations = [
        sectionPattern,
        sectionPattern.replace(/\s+/g, '_'),
        sectionPattern.replace(/\s+/g, '-'),
        sectionPattern.replace(/\s+/g, '')
      ];

      variations.forEach((variation) => {
        // Try multiple selectors for each variation
        const selectors = [
          `#${variation}`,
          `#${variation.toLowerCase()}`,
          `[id*="${variation}"]`,
          `[id*="${variation.toLowerCase()}"]`
        ];

        selectors.forEach(selector => {
          $(selector).each(function() {
            const $element = $(this);
            const $header = $element.closest('h1, h2, h3, h4, h5, h6');
            
            if ($header.length > 0) {
              const headerText = $header.text().toLowerCase().trim();
              console.log(`[SectionFilter] Found section header via ID: "${headerText}"`);
              
              // FIX: Use 'self' instead of 'this'
              if (self.shouldSkipSection(headerText, normalizedSkipSections)) {
                self.removeSectionContent($, $header);
                removedSections++;
              }
            }
          });
        });
      });
    });

    // 2. Span-based headline matching (common in MediaWiki/Fandom)
    $('span.mw-headline').each((index, element) => {
      const $span = $(element);
      const headlineText = $span.text().toLowerCase().trim();
      
      // FIX: Use 'self' instead of 'this'
      if (self.shouldSkipSection(headlineText, normalizedSkipSections)) {
        console.log(`[SectionFilter] Removing section by headline: "${headlineText}"`);
        const $header = $span.closest('h1, h2, h3, h4, h5, h6');
        if ($header.length > 0) {
          self.removeSectionContent($, $header);
          removedSections++;
        }
      }
    });

    // 3. Direct header text matching (fallback)
    $('h1, h2, h3, h4, h5, h6').each((index, element) => {
      const $header = $(element);
      const headerText = $header.text().toLowerCase().trim()
        .replace(/\[edit\]/gi, '') // Remove [edit] links
        .replace(/\[[^\]]*\]/g, '') // Remove other bracketed content
        .trim();
      
      // FIX: Use 'self' instead of 'this'
      if (headerText && self.shouldSkipSection(headerText, normalizedSkipSections)) {
        console.log(`[SectionFilter] Removing section by direct header match: "${headerText}"`);
        self.removeSectionContent($, $header);
        removedSections++;
      }
    });

    console.log(`[SectionFilter] Removed ${removedSections} sections total`);
  }

  // NEW: Enhanced method to determine if a section should be skipped
  shouldSkipSection(sectionText, normalizedSkipSections) {
    const cleanSectionText = sectionText.toLowerCase().trim();
    
    return normalizedSkipSections.some(skipPattern => {
      // Exact match
      if (cleanSectionText === skipPattern) {
        return true;
      }
      
      // Contains match (for partial matching)
      if (cleanSectionText.includes(skipPattern) || skipPattern.includes(cleanSectionText)) {
        return true;
      }
      
      // Word boundary matching (more precise)
      const skipWords = skipPattern.split(/\s+/);
      const sectionWords = cleanSectionText.split(/\s+/);
      
      // If all words from skip pattern are found in section text
      if (skipWords.length <= sectionWords.length) {
        const wordsMatch = skipWords.every(skipWord => 
          sectionWords.some(sectionWord => 
            sectionWord.includes(skipWord) || skipWord.includes(sectionWord)
          )
        );
        if (wordsMatch) {
          return true;
        }
      }
      
      // Common variations and synonyms
      const synonymMap = {
        'references': ['reference', 'refs', 'citations', 'sources'],
        'navigation': ['nav', 'site navigation', 'site nav'],
        'external links': ['external link', 'links', 'see also'],
        'see also': ['see', 'also see', 'related'],
        'gallery': ['images', 'pictures', 'photos'],
        'trivia': ['facts', 'did you know', 'interesting facts'],
        'behind the scenes': ['production', 'development', 'making of'],
        'voice actors': ['voice cast', 'cast', 'actors', 'voice'],
        'non-canon': ['non canon', 'noncanon', 'filler']
      };
      
      // Check if section matches any synonyms
      for (const [mainTerm, synonyms] of Object.entries(synonymMap)) {
        if (skipPattern.includes(mainTerm) || synonyms.some(syn => skipPattern.includes(syn))) {
          if (cleanSectionText.includes(mainTerm) || synonyms.some(syn => cleanSectionText.includes(syn))) {
            return true;
          }
        }
      }
      
      return false;
    });
  }

  // NEW: Enhanced method to remove section content
  removeSectionContent($, $header) {
    const headerLevel = parseInt($header[0].tagName.charAt(1));
    let $current = $header.next();
    
    // Remove everything until the next header of same or higher level
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

  // ENHANCED: Extract sections with skip sections awareness
  extractSections($, pageTitle, skipSections = []) {
    console.log(`[Sections] Extracting sections from: ${pageTitle}`);
    console.log(`[Sections] Skip sections active: ${skipSections.length > 0 ? 'Yes' : 'No'}`);
    
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
    
    // Additional filtering check - remove sections that match skip patterns but weren't caught during HTML parsing
    const filteredSections = sections.filter(section => {
      const normalizedSkipSections = (skipSections || []).map(s => s.toLowerCase().trim());
      const shouldSkip = this.shouldSkipSection(section.title, normalizedSkipSections);
      
      if (shouldSkip) {
        console.log(`[Sections] Post-processing filter: Removing section "${section.title}"`);
        return false;
      }
      return true;
    });

    if (filteredSections.length !== sections.length) {
      console.log(`[Sections] Post-processing removed ${sections.length - filteredSections.length} additional sections`);
    }
    
    // Process sections according to word count rules
    return this.processSections(filteredSections);
  }

  // Process sections according to word count rules (unchanged)
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

  // Finalize section with question count calculation (unchanged)
  finalizeSection(section) {
    const questionCount = Math.ceil(section.wordCount / 100);
    return {
      ...section,
      questionCount: Math.max(1, questionCount) // Minimum 1 question per section
    };
  }

  // Count words in text (unchanged)
  countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  // Generate a unique identifier for a section (unchanged)
  generateSectionId(category, pageTitle, sectionTitle, fandomName) {
    const data = `${fandomName}_${category}_${pageTitle}_${sectionTitle}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  async isSectionProcessed(sectionId) {
    const { data, error } = await supabase
      .from('processed_sections')
      .select('section_id')
      .eq('section_id', sectionId)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  }

  async markSectionAsProcessed(sectionId, fandomWikiName, metadata = {}) {
    const { error } = await supabase
      .from('processed_sections')
      .upsert({
        section_id: sectionId,
        fandom_wiki_name: fandomWikiName,
        category: metadata.category || null,
        page_title: metadata.pageTitle || '',
        section_title: metadata.sectionTitle || '',
        word_count: metadata.wordCount || 0,
        questions_generated: metadata.questionsGenerated || 0,
        processed_at: new Date().toISOString(),
      });

    if (error) throw error;
  }

  // Remaining methods unchanged...
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

  // Search categories with better filtering (unchanged)
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

  async getPopularPages(fandomWikiName, limit = 500) {
    console.log(`[PopularPages] Fetching popular pages for ${fandomWikiName} via API...`);

    const url = this.createFandomUrl(fandomWikiName);
    const params = {
      action: 'query',
      list: 'querypage',
      qppage: 'Mostrevisions',
      qplimit: Math.min(limit, 500),
      format: 'json',
    };

    try {
      const response = await axios.get(url, { params, headers: BROWSER_HEADERS });
      const data = response.data;

      if (data.error) {
        throw new Error(data.error.info || 'MediaWiki API error');
      }

      const results = data.query?.querypage?.results;
      if (!results || results.length === 0) {
        console.warn('[PopularPages] querypage returned no results');
        return { pages: [], hasMore: false };
      }

      const SYSTEM_PREFIXES = ['Category:', 'Template:', 'File:', 'User:', 'Special:', 'MediaWiki:', 'Talk:'];

      const pages = results
        .filter(p => {
          const title = p.title || '';
          return title.length > 2 && !SYSTEM_PREFIXES.some(prefix => title.startsWith(prefix));
        })
        .map(p => ({
          title: p.title,
          revisions: parseInt(p.value) || 0,
          url: `/wiki/${encodeURIComponent((p.title).replace(/ /g, '_'))}`,
        }))
        .sort((a, b) => b.revisions - a.revisions)
        .slice(0, limit);

      console.log(`[PopularPages] Found ${pages.length} pages via API`);
      return { pages, hasMore: pages.length === limit };

    } catch (error) {
      console.error('[PopularPages] Error:', error.message);
      throw new Error(`Failed to fetch popular pages: ${error.message}`);
    }
  }

  async getProcessingStats(fandomWikiName) {
    const { data, error } = await supabase
      .from('processed_sections')
      .select('*')
      .eq('fandom_wiki_name', fandomWikiName);

    if (error) throw error;

    const stats = {
      fandomWikiName,
      totalSectionsProcessed: data.length,
      totalQuestionsGenerated: data.reduce((sum, s) => sum + (s.questions_generated || 0), 0),
      byPage: {},
    };

    data.forEach(s => {
      stats.byPage[s.page_title] = (stats.byPage[s.page_title] || 0) + 1;
    });

    return stats;
  }
}

module.exports = new ScrapingService();