const express = require('express');
const router = express.Router();
const animeService = require('../services/animeService');
const scrapingService = require('../services/scrapingService');
const questionsService = require('../services/questionsService');
const { supabase } = require('../config/supabase');

const activeProcesses = new Map();

// Generation Settings Management Routes

router.get('/settings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('generation_settings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({ success: true, settings: data, count: data.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/settings/stats/overview', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('generation_settings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const stats = {
      totalSettings: data.length,
      byAnime: {},
      byModel: {},
      totalUsage: 0,
      mostUsedSettings: [],
      recentSettings: [],
    };

    data.forEach(s => {
      if (s.anime_name) stats.byAnime[s.anime_name] = (stats.byAnime[s.anime_name] || 0) + 1;
      if (s.model) stats.byModel[s.model] = (stats.byModel[s.model] || 0) + 1;
      stats.totalUsage += s.usage_count || 0;
    });

    stats.mostUsedSettings = [...data]
      .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
      .slice(0, 5)
      .map(s => ({ id: s.id, name: s.name, animeName: s.anime_name, usageCount: s.usage_count || 0 }));

    stats.recentSettings = data.slice(0, 5)
      .map(s => ({ id: s.id, name: s.name, animeName: s.anime_name, createdAt: s.created_at }));

    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/settings/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('generation_settings')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) return res.status(404).json({ success: false, error: 'Setting not found' });

    res.json({ success: true, setting: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/settings', async (req, res) => {
  try {
    const {
      name, animeName, fandomWikiName, selectedPages,
      maxApiCalls, questionsPerChunk, wordsPerChunk, openaiModel,
      promptInstructions, skipSections
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'Setting name is required' });
    }
    if (!animeName || !fandomWikiName) {
      return res.status(400).json({ success: false, error: 'Anime name and fandom wiki name are required' });
    }

    const { data, error } = await supabase
      .from('generation_settings')
      .insert({
        name: name.trim(),
        anime_name: animeName.trim(),
        fandom_wiki_name: fandomWikiName.trim(),
        selected_pages: selectedPages || [],
        max_api_calls: parseInt(maxApiCalls) || 10,
        questions_per_chunk: parseInt(questionsPerChunk) || 4,
        words_per_chunk: parseInt(wordsPerChunk) || 100,
        model: openaiModel || 'gpt-4o-mini',
        prompt_instructions: promptInstructions || '',
        skip_sections: skipSections || [],
        usage_count: 0,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ success: false, error: 'A setting with this name already exists' });
      }
      throw error;
    }

    res.json({ success: true, message: 'Setting saved', settingId: data.id, setting: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/settings/:id', async (req, res) => {
  try {
    const {
      name, animeName, fandomWikiName, selectedPages,
      maxApiCalls, questionsPerChunk, wordsPerChunk, openaiModel,
      promptInstructions, skipSections
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'Setting name is required' });
    }
    if (!animeName || !fandomWikiName) {
      return res.status(400).json({ success: false, error: 'Anime name and fandom wiki name are required' });
    }

    const { error } = await supabase
      .from('generation_settings')
      .update({
        name: name.trim(),
        anime_name: animeName.trim(),
        fandom_wiki_name: fandomWikiName.trim(),
        selected_pages: selectedPages || [],
        max_api_calls: parseInt(maxApiCalls) || 10,
        questions_per_chunk: parseInt(questionsPerChunk) || 4,
        words_per_chunk: parseInt(wordsPerChunk) || 100,
        model: openaiModel || 'gpt-4o-mini',
        prompt_instructions: promptInstructions || '',
        skip_sections: skipSections || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ success: true, message: 'Setting updated', settingId: req.params.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/settings/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('generation_settings')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ success: true, message: 'Setting deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/settings/:id/use', async (req, res) => {
  try {
    const { data: current, error: fetchError } = await supabase
      .from('generation_settings')
      .select('usage_count')
      .eq('id', req.params.id)
      .single();

    if (fetchError) return res.status(404).json({ success: false, error: 'Setting not found' });

    const { error } = await supabase
      .from('generation_settings')
      .update({
        usage_count: (current.usage_count || 0) + 1,
        last_used: new Date().toISOString(),
      })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ success: true, message: 'Usage count updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Existing routes (unchanged)

router.post('/start', async (req, res) => {
  const {
    animeName,
    fandomWikiName,
    categories,
    individualPages,
    maxApiCalls,
    questionsPerChunk,
    wordsPerChunk,
    openaiModel,
    promptInstructions,
    skipSections
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
      promptInstructions: promptInstructions || 'Each question should have one correct answer and three incorrect but plausible options. Create challenging and fun questions. Try and be specific if you can. For example, mention names of characters, groups, or locations if you have this information. NEVER mention "according to the text" or something similar.',
      skipSections: skipSections || []
    };

    activeProcesses.set(processId, process);

    generateQuestions(
      processId,
      animeName,
      fandomWikiName,
      categories || [],
      individualPages || [],
      maxApiCalls || 10,
      questionsPerChunk || 4,
      wordsPerChunk || 100,
      skipSections || [],
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
      result = await scrapingService.searchCategories(
        req.params.wikiName,
        search,
        parseInt(limit) || 100
      );
    } else {
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

router.get('/wiki/:wikiName/popular-pages', async (req, res) => {
  try {
    const { limit } = req.query;
    const result = await scrapingService.getPopularPages(
      req.params.wikiName,
      parseInt(limit) || 500
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching popular pages:', error);
    res.status(500).json({ error: error.message });
  }
});

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
  questionsPerChunk,
  wordsPerChunk,
  skipSections,
  io
) {
  const process = activeProcesses.get(processId);
  const emit = (event, data) => io.emit(`generation:${processId}:${event}`, data);
  const log = (message, type = 'info') => {
    const logEntry = { timestamp: new Date(), message, type };
    process.logs.push(logEntry);
    emit('log', logEntry);
  };

  const socketEmitter = (event, data) => {
    emit(event, data);
  };

  try {
    if (skipSections && skipSections.length > 0) {
      log(`Section filtering enabled: skipping ${skipSections.length} section types`, 'info');
      log(`Skip sections: ${skipSections.slice(0, 5).join(', ')}${skipSections.length > 5 ? '...' : ''}`, 'info');
    } else {
      log('No section filtering configured - processing all sections', 'info');
    }

    log(`Fetching AniList ID for ${animeName}...`);
    const animeData = await animeService.getAnimeId(animeName);
    if (!animeData) throw new Error(`Could not find AniList ID for ${animeName}`);
    process.animeId = animeData.id;
    log(`Found manga: ${animeData.title.romaji} (ID: ${animeData.id})`, 'success');

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

      const sections = await scrapingService.fetchPageContent(page.title, fandomWikiName, {
        skipSections: skipSections || []
      });

      if (!sections || sections.length === 0) {
        log(`No content sections found for page: ${page.title} (possibly all sections were filtered out)`, 'warning');
        workDone++;
        continue;
      }

      log(`Found ${sections.length} sections for processing (after filtering).`);

      for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
        if (process.apiCallsMade >= maxApiCalls) {
          log(`API call limit of ${maxApiCalls} reached.`, 'warning');
          process.status = 'stopping';
          break;
        }

        const section = sections[sectionIndex];
        const sectionId = scrapingService.generateSectionId(page.category, page.title, section.title, fandomWikiName);

        const questionCount = Math.max(1, Math.ceil(section.wordCount * questionsPerChunk / wordsPerChunk));

        log(`Processing section: "${section.title}" (${section.wordCount} words, ${questionCount} questions planned)`);

        const isProcessed = await scrapingService.isSectionProcessed(sectionId);

        if (!isProcessed) {
          log(`Generating ${questionCount} questions for section: "${section.title}"`);

          const questions = await questionsService.generateQuestions(
            section.content,
            questionCount,
            animeName,
            page.category,
            page.title,
            {
              model: process.openaiModel,
              promptInstructions: process.promptInstructions,
              sectionTitle: section.title,
              socketEmitter: socketEmitter
            }
          );

          if (questions && questions.length > 0) {
            const count = await questionsService.writeQuestionsToSupabase(
              questions,
              process.animeId,
              {
                fandomWikiName,
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

    if (skipSections && skipSections.length > 0) {
      log(`Section filtering was active during this generation (${skipSections.length} section types filtered).`, 'info');
    }

    emit('completed', process);

  } catch (error) {
    process.status = 'error';
    process.error = error.message;
    log(`Fatal error: ${error.message}`, 'error');
    emit('error', { message: error.message });
  }
}

module.exports = router;
