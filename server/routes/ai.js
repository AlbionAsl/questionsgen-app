// server/routes/ai.js
const express = require('express');
const router = express.Router();
const aiProviderService = require('../services/aiProviderService');
const questionsService = require('../services/questionsService');

// Get all available AI models
router.get('/models', async (req, res) => {
  try {
    const models = aiProviderService.getAllAvailableModels();
    res.json({
      success: true,
      models: models.all,
      byProvider: {
        openai: models.openai,
        gemini: models.gemini
      }
    });
  } catch (error) {
    console.error('Error fetching AI models:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      models: [] // Return empty array as fallback
    });
  }
});

// Get AI provider statistics
router.get('/providers/stats', async (req, res) => {
  try {
    const stats = await aiProviderService.getProviderStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching AI provider stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test AI provider connections
router.get('/providers/test', async (req, res) => {
  try {
    const results = await aiProviderService.testAllConnections();
    res.json(results);
  } catch (error) {
    console.error('Error testing AI provider connections:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test specific AI provider
router.get('/providers/:provider/test', async (req, res) => {
  try {
    const { provider } = req.params;
    const results = await aiProviderService.testAllConnections();
    
    if (results[provider]) {
      res.json({ [provider]: results[provider] });
    } else {
      res.status(404).json({ error: `Provider '${provider}' not found` });
    }
  } catch (error) {
    console.error(`Error testing ${req.params.provider} provider:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Get recommended model for a specific use case
router.get('/models/recommend/:useCase?', async (req, res) => {
  try {
    const useCase = req.params.useCase || 'default';
    const recommendedModel = aiProviderService.getRecommendedModel(useCase);
    res.json({
      success: true,
      recommendedModel,
      useCase
    });
  } catch (error) {
    console.error('Error getting recommended model:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Generate sample questions (for testing AI models)
router.post('/test/generate', async (req, res) => {
  try {
    const { 
      model = 'gpt-4o-mini', 
      sampleText = 'Naruto Uzumaki is a ninja from the Hidden Leaf Village. He dreams of becoming Hokage and is known for his determination and love of ramen.',
      questionsCount = 2
    } = req.body;

    // Create a simple test prompt
    const testPrompt = `
<FANDOM WIKI TEXT>

${sampleText}

</FANDOM WIKI TEXT>

For reference, this piece of text is about the Anime: 'Test Anime' with page title 'Test Character' (and section: 'Introduction')

Each question should have one correct answer and three incorrect but plausible options. Create challenging and fun questions.

Generate ${questionsCount} multiple-choice questions based on the 'FANDOM WIKI TEXT'.
`;

    console.log(`[AI Test] Testing model: ${model} with ${questionsCount} questions`);
    
    const questions = await aiProviderService.generateQuestions(testPrompt, model, {
      temperature: 0.7
    });

    res.json({
      success: true,
      model,
      questionsGenerated: questions.length,
      questions,
      testPrompt: testPrompt.substring(0, 200) + '...' // Include snippet of prompt for debugging
    });

  } catch (error) {
    console.error('Error in AI test generation:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      model: req.body.model || 'unknown'
    });
  }
});

// Get AI model performance analytics
router.get('/analytics/models', async (req, res) => {
  try {
    // Get questions stats grouped by model
    const stats = await questionsService.getQuestionStats();
    
    // Analyze prompt structure performance if available
    let promptAnalysis = null;
    try {
      promptAnalysis = await questionsService.analyzePromptStructurePerformance();
    } catch (error) {
      console.log('[AI Analytics] Prompt structure analysis not available:', error.message);
    }

    res.json({
      success: true,
      modelStats: stats.byModel || {},
      promptStructureStats: stats.byPromptStructure || {},
      promptAnalysis,
      generationVersions: stats.generationVersions || {},
      totalQuestions: stats.total || 0
    });
  } catch (error) {
    console.error('Error fetching AI analytics:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get detailed model information
router.get('/models/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const models = aiProviderService.getAllAvailableModels().all;
    const model = models.find(m => m.id === modelId);
    
    if (!model) {
      return res.status(404).json({ 
        success: false, 
        error: `Model '${modelId}' not found` 
      });
    }

    // Get usage stats for this model if available
    const stats = await questionsService.getQuestionStats();
    const modelUsage = stats.byModel[modelId] || 0;
    
    res.json({
      success: true,
      model: {
        ...model,
        usage: {
          questionsGenerated: modelUsage,
          percentage: stats.total > 0 ? Math.round((modelUsage / stats.total) * 100) : 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching model details:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health check endpoint for AI services
router.get('/health', async (req, res) => {
  try {
    const health = {
      timestamp: new Date().toISOString(),
      services: {},
      overall: 'healthy'
    };

    // Check OpenAI
    health.services.openai = {
      available: !!process.env.OPENAI_API_KEY,
      status: 'unknown'
    };

    // Check Gemini
    health.services.gemini = {
      available: !!process.env.GEMINI_KEY,
      status: 'unknown'
    };

    // Quick connection tests (with timeout)
    const connectionTests = await Promise.allSettled([
      Promise.race([
        aiProviderService.testAllConnections(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ])
    ]);

    if (connectionTests[0].status === 'fulfilled') {
      const testResults = connectionTests[0].value;
      health.services.openai.status = testResults.openai?.success ? 'healthy' : 'error';
      health.services.gemini.status = testResults.gemini?.success ? 'healthy' : 'error';
    }

    // Determine overall health
    const hasHealthyService = Object.values(health.services).some(service => 
      service.available && service.status === 'healthy'
    );
    
    if (!hasHealthyService) {
      health.overall = 'degraded';
    }

    res.json(health);
  } catch (error) {
    console.error('Error checking AI health:', error);
    res.status(500).json({
      timestamp: new Date().toISOString(),
      overall: 'error',
      error: error.message
    });
  }
});

module.exports = router;