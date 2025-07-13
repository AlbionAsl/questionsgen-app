// server/services/scrapingService.js
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');

class ScrapingService {
  constructor() {
    // In-memory storage for metadata
    this.metadataStore = new Map();
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

  // Check if chunk was already processed
  isChunkProcessed(chunkId, fandomName) {
    const metadata = this.getMetadata(fandomName);
    return metadata[chunkId]?.questionsGenerated === true;
  }

  // Mark chunk as processed
  markChunkAsProcessed(chunkId, fandomName) {
    const metadata = this.getMetadata(fandomName);
    metadata[chunkId] = { questionsGenerated: true };
  }

  // Get metadata for a fandom
  getMetadata(fandomName) {
    if (!this.metadataStore.has(fandomName)) {
      this.metadataStore.set(fandomName, {});
    }
    return this.metadataStore.get(fandomName);
  }

  async getAvailableCategories(fandomWikiName, searchTerm = '', limit = 500) {
    const url = this.createFandomUrl(fandomWikiName);
    const params = {
      action: 'query',
      list: 'allcategories',
      aclimit: limit.toString(),
      format: 'json',
    };

    // Add search prefix if provided
    if (searchTerm) {
      params.acprefix = searchTerm;
    }

    try {
      const response = await axios.get(url, { params });
      const data = response.data;

      if (!data.query || !data.query.allcategories) {
        return [];
      }

      // Filter out system categories and apply additional search if needed
      return data.query.allcategories
        .map(cat => cat['*'])
        .filter(cat => {
          // Filter out system categories
          if (cat.includes('Hidden') || cat.includes('Maintenance') || cat.includes('Templates')) {
            return false;
          }
          // Additional search filter if searchTerm exists
          if (searchTerm && !cat.toLowerCase().includes(searchTerm.toLowerCase())) {
            return false;
          }
          return true;
        });
    } catch (error) {
      console.error('Error fetching categories:', error.message);
      return [];
    }
  }

  // Get categories for a specific anime from the questions database
  async getCategoriesForAnime(animeName) {
    const { getDb } = require('../config/firebase');
    const db = getDb();
    
    try {
      const snapshot = await db.collection('questions')
        .where('animeName', '==', animeName)
        .get();
      
      const categories = new Set();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.category) {
          categories.add(data.category);
        }
      });
      
      return Array.from(categories).sort();
    } catch (error) {
      console.error('Error fetching categories for anime:', error.message);
      return [];
    }
  }
}

module.exports = new ScrapingService();