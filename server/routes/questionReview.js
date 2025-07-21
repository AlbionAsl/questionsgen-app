// server/routes/questionReview.js
const express = require('express');
const router = express.Router();
const QuestionReviewService = require('../services/questionReviewService'); // CHANGED: Use simple service

// Get review statistics for an anime
router.get('/stats/:animeName', async (req, res) => {
  try {
    const { animeName } = req.params;
    const stats = await QuestionReviewService.getReviewStats(animeName);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching review stats:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Start reviewing questions for an anime
router.post('/review', async (req, res) => {
  const {
    animeName,
    batchSize = 10,
    model = 'gemini-2.5-flash'
  } = req.body;

  if (!animeName) {
    return res.status(400).json({ error: 'animeName is required' });
  }

  const processId = `review_${Date.now()}`;
  const io = req.app.get('io');

  try {
    console.log(`[API] Starting simple review process ${processId} for ${animeName}`);
    
    // Create socket emitter for progress updates
    const socketEmitter = (event, data) => {
      console.log(`[WebSocket] Emitting event: review:${processId}:${event}`, data);
      io.emit(`review:${processId}:${event}`, data);
    };

    // Start review process in background
    setImmediate(async () => {
      try {
        socketEmitter('started', { 
          processId,
          animeName,
          batchSize,
          model 
        });

        const results = await QuestionReviewService.reviewQuestions( // CHANGED: Use simple service
          animeName,
          batchSize,
          model,
          socketEmitter
        );

        socketEmitter('completed', {
          processId,
          ...results
        });

      } catch (error) {
        console.error(`[API] Simple review process ${processId} failed:`, error.message);
        socketEmitter('error', {
          processId,
          error: error.message
        });
      }
    });

    res.json({
      success: true,
      processId,
      message: `Simple review started for ${animeName}`
    });

  } catch (error) {
    console.error('[API] Error starting simple review:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get questions by score (for preview before deletion)
router.get('/questions/:animeName/score/:scores', async (req, res) => {
  try {
    const { animeName, scores } = req.params;
    
    // Parse scores string like "1,2" into array [1, 2]
    const scoreArray = scores.split(',').map(s => parseInt(s.trim())).filter(s => s >= 1 && s <= 5);
    
    if (scoreArray.length === 0) {
      return res.status(400).json({ error: 'Invalid scores parameter. Use format like "1,2"' });
    }

    const questions = await QuestionReviewService.getQuestionsByScore(animeName, scoreArray); // CHANGED: Use simple service
    res.json({
      success: true,
      questions,
      count: questions.length,
      scores: scoreArray
    });

  } catch (error) {
    console.error('Error fetching questions by score:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete questions
router.delete('/questions/bulk', async (req, res) => {
  try {
    const { questionIds } = req.body;

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ error: 'questionIds array is required' });
    }

    console.log(`[API] Bulk delete request for ${questionIds.length} questions`);

    const result = await QuestionReviewService.bulkDeleteQuestions(questionIds); // CHANGED: Use simple service
    
    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} questions`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('Error during bulk delete:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get available animes that have questions
router.get('/animes', async (req, res) => {
  console.log('[API] Fetching available animes for review...');
  
  try {
    const { getDb } = require('../config/firebase');
    const db = getDb();
    
    console.log('[API] Database connection established, querying questions...');
    
    // Get unique anime names from questions collection
    const snapshot = await db.collection('questions').get();
    const animeSet = new Set();
    
    console.log(`[API] Found ${snapshot.size} total questions in database`);
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.animeName && typeof data.animeName === 'string' && data.animeName.trim()) {
        animeSet.add(data.animeName.trim());
      }
    });
    
    const animes = Array.from(animeSet).sort();
    
    console.log(`[API] Found ${animes.length} unique animes:`, animes);
    
    res.json({
      success: true,
      animes,
      count: animes.length
    });

  } catch (error) {
    console.error('[API] Error fetching animes:', error.message);
    console.error('[API] Full error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get review process status (for real-time updates)
router.get('/status/:processId', (req, res) => {
  // This is mainly for WebSocket updates, but we can return basic status
  res.json({
    success: true,
    message: 'Use WebSocket connection for real-time status updates',
    processId: req.params.processId
  });
});

module.exports = router;