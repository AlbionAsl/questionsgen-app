const express = require('express');
const router = express.Router();
const animeService = require('../services/animeService');
const scrapingService = require('../services/scrapingService');
const questionsService = require('../services/questionsService');
const { getDb } = require('../config/firebase'); // NEW: Import Firebase for settings
const admin = require('firebase-admin'); // NEW: Import admin for Firestore operations

const activeProcesses = new Map();

// NEW: Generation Settings Management Routes

// Get all saved generation settings
router.get('/settings', async (req, res) => {
  try {
    const db = getDb();
    const snapshot = await db.collection('generationSettings')
      .orderBy('createdAt', 'desc')
      .limit(50) // Limit to most recent 50 settings
      .get();

    const settings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt ? doc.data().createdAt.toDate().toISOString() : null,
      updatedAt: doc.data().updatedAt ? doc.data().updatedAt.toDate().toISOString() : null,
    }));

    console.log(`[Settings] Retrieved ${settings.length} saved generation settings`);
    
    res.json({
      success: true,
      settings,
      count: settings.length
    });
  } catch (error) {
    console.error('Error fetching generation settings:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get a specific generation setting by ID
router.get('/settings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    
    const doc = await db.collection('generationSettings').doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Generation setting not found'
      });
    }

    const setting = {
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt ? doc.data().createdAt.toDate().toISOString() : null,
      updatedAt: doc.data().updatedAt ? doc.data().updatedAt.toDate().toISOString() : null,
    };

    console.log(`[Settings] Retrieved setting: ${setting.name}`);
    
    res.json({
      success: true,
      setting
    });
  } catch (error) {
    console.error('Error fetching generation setting:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Save a new generation setting
router.post('/settings', async (req, res) => {
  try {
    const {
      name,
      animeName,
      fandomWikiName,
      selectedPages,
      maxApiCalls,
      questionsPerChunk,
      openaiModel,
      promptInstructions,
      skipSections
    } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Setting name is required'
      });
    }

    if (!animeName || !fandomWikiName) {
      return res.status(400).json({
        success: false,
        error: 'Anime name and fandom wiki name are required'
      });
    }

    const db = getDb();
    
    // Check if a setting with this name already exists
    const existingSnapshot = await db.collection('generationSettings')
      .where('name', '==', name.trim())
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      return res.status(400).json({
        success: false,
        error: 'A setting with this name already exists'
      });
    }

    // Create the new setting document
    const settingData = {
      name: name.trim(),
      animeName: animeName.trim(),
      fandomWikiName: fandomWikiName.trim(),
      selectedPages: selectedPages || [],
      maxApiCalls: parseInt(maxApiCalls) || 10,
      questionsPerChunk: parseInt(questionsPerChunk) || 4,
      openaiModel: openaiModel || 'gpt-4o-mini',
      promptInstructions: promptInstructions || '',
      skipSections: skipSections || [],
      usageCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('generationSettings').add(settingData);
    
    console.log(`[Settings] Saved new setting: "${name}" (ID: ${docRef.id})`);
    console.log(`[Settings] - Anime: ${animeName}`);
    console.log(`[Settings] - Wiki: ${fandomWikiName}`);
    console.log(`[Settings] - Pages: ${selectedPages?.length || 0} selected`);
    console.log(`[Settings] - Model: ${openaiModel}`);
    console.log(`[Settings] - Skip sections: ${skipSections?.length || 0} configured`);

    res.json({
      success: true,
      message: 'Generation setting saved successfully',
      settingId: docRef.id,
      setting: {
        id: docRef.id,
        ...settingData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error saving generation setting:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update an existing generation setting
router.put('/settings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      animeName,
      fandomWikiName,
      selectedPages,
      maxApiCalls,
      questionsPerChunk,
      openaiModel,
      promptInstructions,
      skipSections
    } = req.body;

    const db = getDb();
    
    // Check if the setting exists
    const doc = await db.collection('generationSettings').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Generation setting not found'
      });
    }

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Setting name is required'
      });
    }

    if (!animeName || !fandomWikiName) {
      return res.status(400).json({
        success: false,
        error: 'Anime name and fandom wiki name are required'
      });
    }

    // Check if another setting with this name exists (excluding current one)
    const existingSnapshot = await db.collection('generationSettings')
      .where('name', '==', name.trim())
      .get();

    const duplicateExists = existingSnapshot.docs.some(doc => doc.id !== id);
    if (duplicateExists) {
      return res.status(400).json({
        success: false,
        error: 'A setting with this name already exists'
      });
    }

    // Update the setting
    const updateData = {
      name: name.trim(),
      animeName: animeName.trim(),
      fandomWikiName: fandomWikiName.trim(),
      selectedPages: selectedPages || [],
      maxApiCalls: parseInt(maxApiCalls) || 10,
      questionsPerChunk: parseInt(questionsPerChunk) || 4,
      openaiModel: openaiModel || 'gpt-4o-mini',
      promptInstructions: promptInstructions || '',
      skipSections: skipSections || [],
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('generationSettings').doc(id).update(updateData);
    
    console.log(`[Settings] Updated setting: "${name}" (ID: ${id})`);

    res.json({
      success: true,
      message: 'Generation setting updated successfully',
      settingId: id
    });
  } catch (error) {
    console.error('Error updating generation setting:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete a generation setting
router.delete('/settings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    
    // Check if the setting exists
    const doc = await db.collection('generationSettings').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Generation setting not found'
      });
    }

    const settingName = doc.data().name;
    
    // Delete the setting
    await db.collection('generationSettings').doc(id).delete();
    
    console.log(`[Settings] Deleted setting: "${settingName}" (ID: ${id})`);

    res.json({
      success: true,
      message: 'Generation setting deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting generation setting:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Increment usage count when a setting is used
router.post('/settings/:id/use', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    
    // Check if the setting exists and increment usage count
    const docRef = db.collection('generationSettings').doc(id);
    
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      
      if (!doc.exists) {
        throw new Error('Generation setting not found');
      }
      
      const currentUsageCount = doc.data().usageCount || 0;
      
      transaction.update(docRef, {
        usageCount: currentUsageCount + 1,
        lastUsed: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    
    console.log(`[Settings] Incremented usage count for setting ID: ${id}`);

    res.json({
      success: true,
      message: 'Usage count updated'
    });
  } catch (error) {
    console.error('Error updating setting usage:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get settings statistics
router.get('/settings/stats/overview', async (req, res) => {
  try {
    const db = getDb();
    const snapshot = await db.collection('generationSettings').get();

    const stats = {
      totalSettings: snapshot.size,
      byAnime: {},
      byModel: {},
      totalUsage: 0,
      mostUsedSettings: [],
      recentSettings: []
    };

    const settings = [];

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      settings.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt ? data.createdAt.toDate() : null,
        lastUsed: data.lastUsed ? data.lastUsed.toDate() : null
      });

      // Count by anime
      if (data.animeName) {
        stats.byAnime[data.animeName] = (stats.byAnime[data.animeName] || 0) + 1;
      }

      // Count by model
      if (data.openaiModel) {
        stats.byModel[data.openaiModel] = (stats.byModel[data.openaiModel] || 0) + 1;
      }

      // Sum total usage
      stats.totalUsage += data.usageCount || 0;
    });

    // Get most used settings (top 5)
    stats.mostUsedSettings = settings
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, 5)
      .map(s => ({
        id: s.id,
        name: s.name,
        animeName: s.animeName,
        usageCount: s.usageCount || 0
      }));

    // Get recent settings (last 5)
    stats.recentSettings = settings
      .sort((a, b) => (b.createdAt || new Date(0)) - (a.createdAt || new Date(0)))
      .slice(0, 5)
      .map(s => ({
        id: s.id,
        name: s.name,
        animeName: s.animeName,
        createdAt: s.createdAt ? s.createdAt.toISOString() : null
      }));

    console.log(`[Settings] Generated stats for ${stats.totalSettings} settings`);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching settings statistics:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// EXISTING ROUTES (unchanged)

router.post('/start', async (req, res) => {
  const {
    animeName,
    fandomWikiName,
    categories,
    individualPages,
    maxApiCalls,
    questionsPerChunk,
    openaiModel,
    promptInstructions,
    skipSections // Accept skip sections from UI
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
      skipSections: skipSections || [] // Store skip sections in process
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
      skipSections || [], // Pass skip sections to generation function
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

// Get popular pages from Special:MostRevisions
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

// Main Generation Logic - ENHANCED with skip sections
async function generateQuestions(
  processId,
  animeName,
  fandomWikiName,
  categories,
  individualPages,
  maxApiCalls,
  questionsPerChunk, // This is now used as a multiplier/fallback
  skipSections, // Skip sections parameter
  io
) {
  const process = activeProcesses.get(processId);
  const emit = (event, data) => io.emit(`generation:${processId}:${event}`, data);
  const log = (message, type = 'info') => {
    const logEntry = { timestamp: new Date(), message, type };
    process.logs.push(logEntry);
    emit('log', logEntry);
  };

  // Create socket emitter for prompt data
  const socketEmitter = (event, data) => {
    emit(event, data);
  };

  try {
    // Log skip sections configuration
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
      
      // Pass skip sections to fetchPageContent
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

        log(`Processing section: "${section.title}" (${section.wordCount} words, ${section.questionCount} questions planned)`);

        // Check if section was already processed
        const isProcessed = await scrapingService.isSectionProcessed(sectionId, fandomWikiName);
        
        if (!isProcessed) {
          log(`Generating ${section.questionCount} questions for section: "${section.title}"`);
          
          // Generate questions using the calculated amount for this section
          // Pass socket emitter for prompt monitoring
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
              socketEmitter: socketEmitter // Pass socket emitter
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
    
    // Log final filtering statistics
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