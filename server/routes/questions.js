// server/routes/questions.js
const express = require('express');
const router = express.Router();
const questionService = require('../services/questionService');
const { getDb } = require('../config/firebase');

router.get('/', async (req, res) => {
  try {
    const filters = {
      animeId: req.query.animeId,
      animeName: req.query.animeName,
      category: req.query.category,
      limit: parseInt(req.query.limit) || 50
    };

    const questions = await questionService.getQuestions(filters);
    res.json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await questionService.getQuestionStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    await db.collection('questions').doc(req.params.id).delete();
    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { question, options, correctAnswer } = req.body;
    
    await db.collection('questions').doc(req.params.id).update({
      question,
      options,
      correctAnswer,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ message: 'Question updated successfully' });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/export', async (req, res) => {
  try {
    const { format = 'json', ...filters } = req.body;
    const questions = await questionService.getQuestions(filters);

    if (format === 'csv') {
      const csv = convertToCSV(questions);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=questions.csv');
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=questions.json');
      res.json(questions);
    }
  } catch (error) {
    console.error('Error exporting questions:', error);
    res.status(500).json({ error: error.message });
  }
});

function convertToCSV(questions) {
  const headers = ['ID', 'Anime', 'Category', 'Question', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Correct Answer'];
  const rows = questions.map(q => [
    q.id,
    q.animeName || '',
    q.category || '',
    `"${q.question.replace(/"/g, '""')}"`,
    `"${q.options[0].replace(/"/g, '""')}"`,
    `"${q.options[1].replace(/"/g, '""')}"`,
    `"${q.options[2].replace(/"/g, '""')}"`,
    `"${q.options[3].replace(/"/g, '""')}"`,
    q.correctAnswer + 1
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

module.exports = router;