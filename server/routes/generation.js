// server/routes/generation.js
const express = require('express');
const router = express.Router();
const animeService = require('../services/animeService');
const scrapingService = require('../services/scrapingService');
const questionService = require('../services/questionService');

// Store active generation processes
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
    // Validate inputs
    if (!animeName || !fandomWikiName) {
      return res.status(400).json({ error: 'Anime name and Fandom wiki name are required' });
    }

    // Check if process already running for this anime
    const existingProcess = Array.from(activeProcesses.values()).find(
      p => p.animeName === animeName && p.status === 'running'
    );
    
    if (existingProcess) {
      return res.status(400).json({ error: 'Generation already in progress for this anime' });
    }

    // Initialize process
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

    // Start generation in background
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
    .slice(0, 20); // Last 20 processes

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
    const categories = await scrapingService.getAvailableCategories(req.params.wikiName);
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Main generation function
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
  
  const emit = (event, data) => {
    io.emit(`generation:${processId}:${event}`, data);
  };

  const log = (message, type = 'info') => {
    const logEntry = {
      timestamp: new Date(),
      message,
      type
    };
    process.logs.push(logEntry);
    emit('log', logEntry);
  };

  const updateProgress = (progress) => {
    process.progress = progress;
    emit('progress', progress);
  };

  try {
    // Step 1: Fetch anime ID
    log(`Fetching AniList ID for ${animeName}...`);
    const animeData = await animeService.getAnimeId(animeName);
    
    if (!animeData) {
      throw new Error(`Could not find AniList ID for ${animeName}`);
    }

    const animeId = animeData.id;
    process.animeId = animeId;
    log(`Found anime: ${animeData.title.romaji} (ID: ${animeId})`, 'success');

    // Load metadata
    let metadata = await scrapingService.loadChunkMetadata(fandomWikiName);

    // Calculate total work
    const totalPages = [];
    for (const category of categories) {
      const pages = await scrapingService.fetchRelevantPages(category, fandomWikiName);
      totalPages.push(...pages.map(p => ({ title: p, category })));
    }
    individualPages.forEach(p => totalPages.push({ title: p, category: null }));

    const totalWork = Math.min(totalPages.length * 3, maxApiCalls); // Estimate 3 chunks per page

    // Process pages
    for (let i = 0; i < totalPages.length; i++) {
      if (process.status === 'stopping') {
        log('Generation stopped by user', 'warning');
        break;
      }

      if (process.apiCallsMade >= maxApiCalls) {
        log(`Reached maximum of ${maxApiCalls} API calls`, 'warning');
        break;
      }

      const { title, category } = totalPages[i];
      log(`Processing page: ${title}`);

      try {
        const content = await scrapingService.fetchPageContent(title, fandomWikiName);
        
        if (!content) {
          log(`No content found for page: ${title}`, 'warning');
          continue;
        }

        const chunks = scrapingService.splitContent(content);
        log(`Split into ${chunks.length} chunks`);

        for (let j = 0; j < chunks.length; j++) {
          if (process.status === 'stopping' || process.apiCallsMade >= maxApiCalls) {
            break;
          }

          const chunkFilename = await scrapingService.saveChunk(
            chunks[j],
            category,
            title,
            j + 1,
            fandomWikiName
          );

          if (!metadata[chunkFilename] || !metadata[chunkFilename].questionsGenerated) {
            log(`Generating questions for chunk ${j + 1}/${chunks.length}...`);
            
            const questions = await questionService.generateQuestions(
              chunks[j],
              questionsPerChunk,
              animeName,
              category,
              title
            );

            if (questions.length > 0) {
              const count = await questionService.writeQuestionsToFirestore(questions, animeId, {
                animeName,
                category,
                pageTitle: title
              });
              
              process.questionsGenerated += count;
              process.apiCallsMade += 1;
              
              metadata[chunkFilename] = { questionsGenerated: true };
              await scrapingService.saveChunkMetadata(fandomWikiName, metadata);
              
              log(`Generated ${count} questions`, 'success');
              emit('questionsGenerated', { count, total: process.questionsGenerated });
            }
          } else {
            log(`Skipping chunk ${j + 1}/${chunks.length} (already processed)`);
          }

          // Update progress
          const progress = Math.min(
            ((i * 3 + j + 1) / totalWork) * 100,
            (process.apiCallsMade / maxApiCalls) * 100
          );
          updateProgress(Math.round(progress));
        }
      } catch (error) {
        log(`Error processing page ${title}: ${error.message}`, 'error');
      }
    }

    // Complete
    process.status = 'completed';
    process.endTime = new Date();
    process.duration = process.endTime - process.startTime;
    
    log(`Generation completed! Generated ${process.questionsGenerated} questions`, 'success');
    emit('completed', {
      questionsGenerated: process.questionsGenerated,
      apiCallsMade: process.apiCallsMade,
      duration: process.duration
    });

  } catch (error) {
    process.status = 'error';
    process.error = error.message;
    log(`Fatal error: ${error.message}`, 'error');
    emit('error', { message: error.message });
  }
}

module.exports = router;