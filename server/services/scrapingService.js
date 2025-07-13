// server/services/scrapingService.js
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ScrapingService {
  constructor() {
    this.chunksDir = path.join(__dirname, '../../chunks');
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

  async saveChunk(chunk, category, pageTitle, chunkNumber, fandomName) {
    const chunksDir = path.join(this.chunksDir, fandomName);
    await fs.mkdir(chunksDir, { recursive: true });

    let cleanTitle = pageTitle.replace(/[^\w\-_\. ]/g, '_');
    let filename = category
      ? `${category}_${cleanTitle}_${chunkNumber}.txt`
      : `${cleanTitle}_${chunkNumber}.txt`;

    if (filename.length > 255) {
      const hash = crypto.createHash('md5').update(filename).digest('hex');
      filename = `${hash}_${chunkNumber}.txt`;
    }

    const filepath = path.join(chunksDir, filename);
    await fs.writeFile(filepath, chunk);
    
    return filename;
  }

  async loadChunkMetadata(fandomName) {
    const metadataPath = path.join(this.chunksDir, fandomName, 'metadata.json');
    try {
      const data = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  async saveChunkMetadata(fandomName, metadata) {
    const metadataPath = path.join(this.chunksDir, fandomName, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  async getAvailableCategories(fandomWikiName) {
    const url = this.createFandomUrl(fandomWikiName);
    const params = {
      action: 'query',
      list: 'allcategories',
      aclimit: '100',
      format: 'json',
    };

    try {
      const response = await axios.get(url, { params });
      const data = response.data;

      if (!data.query || !data.query.allcategories) {
        return [];
      }

      // Filter out system categories
      return data.query.allcategories
        .map(cat => cat['*'])
        .filter(cat => !cat.includes('Hidden') && !cat.includes('Maintenance'));
    } catch (error) {
      console.error('Error fetching categories:', error.message);
      return [];
    }
  }
}

module.exports = new ScrapingService();