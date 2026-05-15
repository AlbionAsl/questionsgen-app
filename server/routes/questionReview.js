const express = require('express');
const router = express.Router();
const simpleQuestionReviewService = require('../services/simpleQuestionReviewService');
const { supabase } = require('../config/supabase');

// Get review stats for a category
// Usage: GET /api/review/stats/20  (where 20 is the AniList manga ID)
router.get('/stats/:categoryId', async (req, res) => {
  try {
    const stats = await simpleQuestionReviewService.getReviewStats(req.params.categoryId);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start reviewing questions for a category
// Body: { categoryId: 20, batchSize: 10, model: "gemini-flash-latest", customPrompt: "..." }
router.post('/review', async (req, res) => {
  const { categoryId, batchSize = 10, model = 'gemini-flash-latest', customPrompt } = req.body;

  if (!categoryId) {
    return res.status(400).json({ error: 'categoryId is required' });
  }

  const processId = `review_${Date.now()}`;
  const io = req.app.get('io');

  try {
    const socketEmitter = (event, data) => {
      io.emit(`review:${processId}:${event}`, data);
    };

    setImmediate(async () => {
      try {
        socketEmitter('started', { processId, categoryId, batchSize, model });

        const results = await simpleQuestionReviewService.reviewQuestions(
          categoryId, batchSize, model, socketEmitter, customPrompt
        );

        socketEmitter('completed', { processId, ...results });
      } catch (error) {
        socketEmitter('error', { processId, error: error.message });
      }
    });

    res.json({ success: true, processId, message: `Review started for category ${categoryId}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get questions by review score for a category (preview before deletion)
// Usage: GET /api/review/questions/20/score/1,2
router.get('/questions/:categoryId/score/:scores', async (req, res) => {
  try {
    const scoreArray = req.params.scores
      .split(',')
      .map(s => parseInt(s.trim()))
      .filter(s => s >= 1 && s <= 5);

    if (scoreArray.length === 0) {
      return res.status(400).json({ error: 'Invalid scores. Use format like "1,2"' });
    }

    const questions = await simpleQuestionReviewService.getQuestionsByScore(
      req.params.categoryId, scoreArray
    );

    res.json({ success: true, questions, count: questions.length, scores: scoreArray });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete questions by ID
router.delete('/questions/bulk', async (req, res) => {
  try {
    const { questionIds } = req.body;

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ error: 'questionIds array is required' });
    }

    const result = await simpleQuestionReviewService.bulkDeleteQuestions(questionIds);
    res.json({ success: true, message: `Deleted ${result.deletedCount} questions`, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all categories that have questions (replaces old /animes endpoint)
router.get('/categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, slug')
      .order('name');

    if (error) throw error;

    res.json({ success: true, categories: data, count: data.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Keep /animes as an alias so the existing frontend doesn't break immediately
router.get('/animes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name')
      .order('name');

    if (error) throw error;

    const animes = data.map(c => c.name);
    res.json({ success: true, animes, categories: data, count: data.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/status/:processId', (req, res) => {
  res.json({
    success: true,
    message: 'Use WebSocket connection for real-time status updates',
    processId: req.params.processId,
  });
});

module.exports = router;
