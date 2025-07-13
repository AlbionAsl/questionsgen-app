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
    questionsPerChunk
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
      logs: []
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
    const { search, limit } = req.query;
    const categories = await scrapingService.getAvailableCategories(
      req.params.wikiName, 
      search || '', 
      parseInt(limit) || 500
    );
    res.json(categories);
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
  questionsPerChunk,
  io
) {
  const process = activeProcesses.get(processId);
  const emit = (event, data) => io.emit(`generation:${processId}:${event}`, data);
  const log = (message, type = 'info') => {
    const logEntry = { timestamp: new Date(), message, type };
    process.logs.push(logEntry);
    emit('log', logEntry);
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
      const content = await scrapingService.fetchPageContent(page.title, fandomWikiName);
      if (!content) {
        log(`No content for page: ${page.title}`, 'warning');
        workDone++;
        continue;
      }

      const chunks = scrapingService.splitContent(content);
      log(`Split into ${chunks.length} chunks.`);

      for (let i = 0; i < chunks.length; i++) {
        if (process.apiCallsMade >= maxApiCalls) {
          log(`API call limit of ${maxApiCalls} reached.`, 'warning');
          process.status = 'stopping';
          break;
        }
        
        const chunkId = scrapingService.generateChunkId(page.category, page.title, i + 1, fandomWikiName);

        if (!scrapingService.isChunkProcessed(chunkId, fandomWikiName)) {
          log(`Generating questions for chunk ${i + 1}/${chunks.length}...`);
          const questions = await questionsService.generateQuestions(
            chunks[i], 
            questionsPerChunk, 
            animeName, 
            page.category, 
            page.title
          );

          if (questions && questions.length > 0) {
            const count = await questionsService.writeQuestionsToFirestore(
              questions, 
              process.animeId, 
              { animeName, category: page.category, pageTitle: page.title }
            );
            process.questionsGenerated += count;
            log(`Generated ${count} questions.`, 'success');
            emit('questionsGenerated', { count, total: process.questionsGenerated });
          }
          
          process.apiCallsMade++;
          scrapingService.markChunkAsProcessed(chunkId, fandomWikiName);
        } else {
          log(`Skipping chunk ${i + 1}/${chunks.length} (already processed).`);
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