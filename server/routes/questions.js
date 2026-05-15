const express = require('express');
const router = express.Router();
const questionService = require('../services/questionsService');
const { supabase } = require('../config/supabase');

// List questions — filter by categoryId (integer) or status
router.get('/', async (req, res) => {
  try {
    const filters = {
      categoryId: req.query.categoryId,
      status: req.query.status,
      limit: parseInt(req.query.limit) || 50,
    };

    const questions = await questionService.getQuestions(filters);
    res.json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Question stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await questionService.getQuestionStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a question
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('questions')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: error.message });
  }
});

// Edit a question
router.put('/:id', async (req, res) => {
  try {
    const { question, options, correctAnswer } = req.body;

    let normalizedOptions = options;
    if (options && !Array.isArray(options)) {
      normalizedOptions = Object.values(options);
    }

    const { error } = await supabase
      .from('questions')
      .update({
        question_text: question,
        options: normalizedOptions,
        correct_answer: correctAnswer,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Question updated successfully' });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export questions
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
  const headers = ['ID', 'Category ID', 'Question', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Correct Answer', 'Status', 'Review Score'];
  const rows = questions.map(q => [
    q.id,
    q.category_id,
    `"${(q.question_text || '').replace(/"/g, '""')}"`,
    `"${(q.options[0] || '').replace(/"/g, '""')}"`,
    `"${(q.options[1] || '').replace(/"/g, '""')}"`,
    `"${(q.options[2] || '').replace(/"/g, '""')}"`,
    `"${(q.options[3] || '').replace(/"/g, '""')}"`,
    q.correct_answer + 1,
    q.status || '',
    q.review_score || '',
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

module.exports = router;
