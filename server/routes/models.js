const express = require('express');
const router = express.Router();
const modelConfigService = require('../services/modelConfigService');

router.get('/', async (req, res) => {
  try {
    const models = await modelConfigService.getModels();
    res.json({ success: true, models });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { provider, display_name, api_model_id } = req.body;

    if (!provider || !display_name || !api_model_id) {
      return res.status(400).json({
        success: false,
        error: 'provider, display_name, and api_model_id are required',
      });
    }

    if (!['openai', 'gemini'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'provider must be "openai" or "gemini"',
      });
    }

    const model = await modelConfigService.addModel({ provider, display_name, api_model_id });
    res.status(201).json({ success: true, model });
  } catch (error) {
    console.error('Error adding model:', error);
    const status = error.message.includes('duplicate') ? 409 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await modelConfigService.removeModel(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing model:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/reorder', async (req, res) => {
  try {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'orderedIds must be a non-empty array',
      });
    }

    await modelConfigService.reorderModels(orderedIds);
    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering models:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
