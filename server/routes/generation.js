const express = require('express');
const router = express.Router();
const animeService = require('../services/animeService');
const scrapingService = require('../services/scrapingService');
const questionsService = require('../services/questionsService');

const activeProcesses = new Map();

router.post('/start', async (req, res) => {
  const {
    animeName,
    fandomWikiName,
    categories,
    individualPages,
    maxApiCalls,
    questionsPerChunk,
    openaiModel,
    promptInstructions
  } = req.body;

  const processId = Date.now().toString();
  const io = req.app.get('io');

  try {
    if (!animeName || !fandomWikiName) {
      return res.status(400).json({ error: 'Anime name and Fandom wiki name are required' });
    }

    const process = {
      id: processId,
      animeName,
      fandomWikiName,
      status: 'running',
      progress: 0,
      apiCallsMade: 0,
      questionsGenerated: 0,
      startTime: new Date(),
      logs: [],
      openaiModel: openaiModel || 'gpt-4o-mini',
      promptInstructions: promptInstructions || 'Each question should have one correct answer and three incorrect but plausible options. Create challenging and fun questions. Try and be specific if you can. For example, mention names of characters, groups, or locations if you have this information. NEVER mention "according to the text" or something similar.'
    };

    activeProcesses.set(processId, process);

    // Start generation in the background
    generateQuestions(
      processId,
      animeName,
      fandomWikiName,
      categories || [],
      individualPages || [],
      maxApiCalls || 10,
      questionsPerChunk || 4,
      io
    );

    res.json({ 
      processId, 
      message: 'Generation started successfully' 
    });

  } catch (error) {
    console.error('Error starting generation:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/status/:processId', (req, res) => {
  const { processId } = req.params;
  const process = activeProcesses.get(processId);

  if (!process) {
    return res.status(404).json({ error: 'Process not found' });
  }

  res.json(process);
});

router.post('/stop/:processId', (req, res) => {
  const { processId } = req.params;
  const process = activeProcesses.get(processId);

  if (!process) {
    return res.status(404).json({ error: 'Process not found' });
  }

  process.status = 'stopping';
  res.json({ message: 'Stop signal sent to process' });
});

router.get('/history', (req, res) => {
  const history = Array.from(activeProcesses.values())
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, 20);

  res.json(history);
});

router.get('/anime/search/:term', async (req, res) => {
  try {
    const results = await animeService.searchAnime(req.params.term);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/wiki/:wikiName/categories', async (req, res) => {
  try {
    const { search, limit, offset } = req.query;
    
    let result;
    if (search && search.length >= 2) {
      // Use search functionality
      result = await scrapingService.searchCategories(
        req.params.wikiName, 
        search, 
        parseInt(limit) || 100
      );
    } else {
      // Get all categories with pagination
      result = await scrapingService.getAvailableCategories(
        req.params.wikiName, 
        '', 
        parseInt(limit) || 500,
        parseInt(offset) || 0
      );
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// New endpoint for searching categories specifically
router.get('/wiki/:wikiName/categories/search', async (req, res) => {
  try {
    const { q, limit } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ categories: [], hasMore: false });
    }

    const result = await scrapingService.searchCategories(
      req.params.wikiName, 
      q, 
      parseInt(limit) || 50
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// NEW: Get popular pages from Special:MostRevisions
router.get('/wiki/:wikiName/popular-pages', async (req, res) => {
  try {
    const { limit } = req.query;
    const result = await scrapingService.getPopularPages(
      req.params.wikiName, 
      parseInt(limit) || 100
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching popular pages:', error);
    res.status(500).json({ error: error.message });
  }
});

// New endpoint to get processing stats for a fandom
router.get('/wiki/:wikiName/stats', async (req, res) => {
  try {
    const stats = await scrapingService.getProcessingStats(req.params.wikiName);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Main Generation Logic
async function generateQuestions(
  processId,
  animeName,
  fandomWikiName,
  categories,
  individualPages,
  maxApiCalls,
  questionsPerChunk, // This is now used as a multiplier/fallback
  io
) {
  const process = activeProcesses.get(processId);
  const emit = (event, data) => io.emit(`generation:${processId}:${event}`, data);
  const log = (message, type = 'info') => {
    const logEntry = { timestamp: new Date(), message, type };
    process.logs.push(logEntry);
    emit('log', logEntry);
  };

  // NEW: Create socket emitter for prompt data
  const socketEmitter = (event, data) => {
    emit(event, data);
  };

  try {
    log(`Fetching AniList ID for ${animeName}...`);
    const animeData = await animeService.getAnimeId(animeName);
    if (!animeData) throw new Error(`Could not find AniList ID for ${animeName}`);
    process.animeId = animeData.id;
    log(`Found anime: ${animeData.title.romaji} (ID: ${animeData.id})`, 'success');

    const pagesToProcess = [];
    if (categories && categories.length > 0) {
        for (const category of categories) {
            log(`Fetching pages for category: ${category}...`);
            const pages = await scrapingService.fetchRelevantPages(category, fandomWikiName);
            pagesToProcess.push(...pages.map(p => ({ title: p, category })));
        }
    }
    if (individualPages && individualPages.length > 0) {
        pagesToProcess.push(...individualPages.map(p => ({ title: p, category: 'Individual' })));
    }

    if (pagesToProcess.length === 0) {
      throw new Error('No pages found to process. Please select categories or add individual pages.');
    }

    const totalWork = pagesToProcess.length;
    let workDone = 0;

    for (const page of pagesToProcess) {
      if (process.status === 'stopping') {
        log('Generation stopped by user.', 'warning');
        break;
      }

      log(`Processing page: ${page.title}`);
      const sections = await scrapingService.fetchPageContent(page.title, fandomWikiName);
      if (!sections || sections.length === 0) {
        log(`No content sections found for page: ${page.title}`, 'warning');
        workDone++;
        continue;
      }

      log(`Found ${sections.length} sections for processing.`);

      for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
        if (process.apiCallsMade >= maxApiCalls) {
          log(`API call limit of ${maxApiCalls} reached.`, 'warning');
          process.status = 'stopping';
          break;
        }
        
        const section = sections[sectionIndex];
        const sectionId = scrapingService.generateSectionId(page.category, page.title, section.title, fandomWikiName);

        log(`Processing section: "${section.title}" (${section.wordCount} words, ${section.questionCount} questions planned)`);

        // Check if section was already processed
        const isProcessed = await scrapingService.isSectionProcessed(sectionId, fandomWikiName);
        
        if (!isProcessed) {
          log(`Generating ${section.questionCount} questions for section: "${section.title}"`);
          
          // Generate questions using the calculated amount for this section
          // NEW: Pass socket emitter for prompt monitoring
          const questions = await questionsService.generateQuestions(
            section.content, 
            section.questionCount, // Use calculated question count per section
            animeName, 
            page.category, 
            page.title,
            {
              model: process.openaiModel,
              promptInstructions: process.promptInstructions,
              sectionTitle: section.title, // Add section context
              socketEmitter: socketEmitter // NEW: Pass socket emitter
            }
          );

          if (questions && questions.length > 0) {
            const count = await questionsService.writeQuestionsToFirestore(
              questions, 
              process.animeId, 
              { 
                animeName, 
                category: page.category, 
                pageTitle: page.title,
                sectionTitle: section.title,
                model: process.openaiModel,
                promptInstructions: process.promptInstructions
              }
            );
            process.questionsGenerated += count;
            log(`Generated ${count} questions for section "${section.title}".`, 'success');
            emit('questionsGenerated', { count, total: process.questionsGenerated });
          }
          
          process.apiCallsMade++;
          
          // Mark section as processed
          await scrapingService.markSectionAsProcessed(sectionId, fandomWikiName, {
            category: page.category,
            pageTitle: page.title,
            sectionTitle: section.title,
            wordCount: section.wordCount,
            questionsGenerated: questions ? questions.length : 0
          });
        } else {
          log(`Skipping section "${section.title}" (already processed).`);
        }
      }
      
      workDone++;
      process.progress = Math.round((workDone / totalWork) * 100);
      emit('progress', process.progress);
    }

    process.status = 'completed';
    process.duration = Date.now() - new Date(process.startTime).getTime();
    log(`Generation completed! Generated a total of ${process.questionsGenerated} questions.`, 'success');
    emit('completed', process);

  } catch (error) {
    process.status = 'error';
    process.error = error.message;
    log(`Fatal error: ${error.message}`, 'error');
    emit('error', { message: error.message });
  }
}

module.exports = router;