// server/services/aiProviderService.js
const openaiService = require('./openaiService');
const geminiService = require('./geminiService');

class AIProviderService {
  constructor() {
    this.providers = {
      openai: openaiService,
      gemini: geminiService
    };
  }

  // Get all available models from all providers
  getAllAvailableModels() {
    const openaiModels = [
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Fast & Cost-effective (Best for most use cases)',
        provider: 'openai',
        supportsStructuredOutput: false,
        supportsFunctionCalling: true,
      },
      {
        id: 'gpt-4.1',
        name: 'GPT-4.1',
        description: 'Higher quality, slower',
        provider: 'openai',
        supportsStructuredOutput: false,
        supportsFunctionCalling: true,
      },
      {
        id: 'gpt-4.1-mini',
        name: 'GPT-4.1 Mini',
        description: 'Faster 4.1',
        provider: 'openai',
        supportsStructuredOutput: false,
        supportsFunctionCalling: true,
      },
      {
        id: 'o4-mini',
        name: 'o4-mini',
        description: 'Reasoning monster',
        provider: 'openai',
        supportsStructuredOutput: false,
        supportsFunctionCalling: true,
      }
    ];

    const geminiModels = geminiService.getAvailableModels();

    return {
      openai: openaiModels,
      gemini: geminiModels,
      all: [...openaiModels, ...geminiModels]
    };
  }

  // Get provider and model info from model ID
  getProviderInfo(modelId) {
    const allModels = this.getAllAvailableModels().all;
    const modelInfo = allModels.find(model => model.id === modelId);
    
    if (!modelInfo) {
      throw new Error(`Unknown model: ${modelId}`);
    }
    
    return {
      provider: modelInfo.provider,
      model: modelInfo,
      service: this.providers[modelInfo.provider]
    };
  }

  // Unified method to generate questions regardless of provider
  async generateQuestions(prompt, modelId, options = {}) {
    const startTime = Date.now();
    console.log(`[AIProvider] Starting question generation with model: ${modelId}`);
    
    try {
      const { provider, model, service } = this.getProviderInfo(modelId);
      console.log(`[AIProvider] Using provider: ${provider}`);
      
      let result;
      
      if (provider === 'openai') {
        result = await this.generateWithOpenAI(prompt, modelId, service, options);
      } else if (provider === 'gemini') {
        result = await this.generateWithGemini(prompt, modelId, service, options);
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }
      
      // Validate the result format
      this.validateQuestionResult(result);
      
      const duration = Date.now() - startTime;
      console.log(`[AIProvider] Question generation completed in ${duration}ms`);
      console.log(`[AIProvider] Generated ${result.length} questions`);
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[AIProvider] Question generation failed after ${duration}ms:`, error.message);
      throw error;
    }
  }

  // Generate questions using OpenAI
  async generateWithOpenAI(prompt, modelId, openaiService, options) {
    console.log(`[AIProvider] Generating with OpenAI model: ${modelId}`);
    
    const functions = [
      {
        name: 'generate_questions',
        description: 'Generate multiple-choice questions from a text',
        parameters: {
          type: 'object',
          properties: {
            questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  options: {
                    type: 'array',
                    items: { type: 'string' },
                    minItems: 4,
                    maxItems: 4,
                  },
                  correctAnswer: { type: 'integer', minimum: 0, maximum: 3 },
                },
                required: ['question', 'options', 'correctAnswer'],
              },
            },
          },
          required: ['questions'],
        },
      },
    ];

    const response = await openaiService.createCompletion({
      model: modelId,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that is an expert in generating fun, challenging, and diverse quiz questions. You will receive wiki text clearly marked with XML tags, followed by reference information and specific instructions.',
        },
        { role: 'user', content: prompt },
      ],
      functions: functions,
      function_call: { name: 'generate_questions' },
      max_tokens: 1000,
      temperature: options.temperature || 0.7,
    });

    const message = response.choices[0].message;

    if (message.function_call && message.function_call.name === 'generate_questions') {
      try {
        const args = JSON.parse(message.function_call.arguments);
        return args.questions || [];
      } catch (parseError) {
        console.error('[AIProvider] Error parsing OpenAI response:', parseError.message);
        throw new Error(`Failed to parse OpenAI response: ${parseError.message}`);
      }
    } else {
      console.error('[AIProvider] OpenAI did not call the expected function');
      throw new Error('OpenAI did not call the expected function');
    }
  }

  // Generate questions using Gemini
  async generateWithGemini(prompt, modelId, geminiService, options) {
    console.log(`[AIProvider] Generating with Gemini model: ${modelId}`);
    
    // ENHANCED: Try structured output first for better reliability
    let result;
    
    if (modelId === 'gemini-2.5-pro') {
      console.log('[AIProvider] Using Gemini-2.5-Pro with structured output approach (more reliable)');
      try {
        // Try structured output first (more reliable)
        result = await geminiService.generateQuestionsStructured(prompt, modelId);
      } catch (structuredError) {
        console.log('[AIProvider] Structured output failed, falling back to function calling');
        console.log('[AIProvider] Structured error:', structuredError.message);
        
        // Fallback to function calling
        try {
          result = await geminiService.generateQuestions(prompt, modelId);
        } catch (functionError) {
          console.error('[AIProvider] Both structured and function calling failed');
          throw new Error(`Gemini Pro failed with both methods: ${functionError.message}`);
        }
      }
    } else {
      console.log('[AIProvider] Using Gemini Flash with structured output approach');
      // Use structured output for Flash model (more reliable for structured data)
      result = await geminiService.generateQuestionsStructured(prompt, modelId);
    }
    
    if (result.success && result.questions && result.questions.length > 0) {
      console.log(`[AIProvider] Gemini successfully generated ${result.questions.length} questions`);
      return result.questions;
    } else {
      console.error('[AIProvider] Gemini result:', result);
      throw new Error('Gemini did not return valid questions');
    }
  }

  // Validate that the result is in the correct format
  validateQuestionResult(questions) {
    if (!Array.isArray(questions)) {
      throw new Error('Questions result must be an array');
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      
      if (!q.question || typeof q.question !== 'string') {
        throw new Error(`Question ${i + 1}: Missing or invalid question text`);
      }
      
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        throw new Error(`Question ${i + 1}: Must have exactly 4 options`);
      }
      
      if (typeof q.correctAnswer !== 'number' || q.correctAnswer < 0 || q.correctAnswer > 3) {
        throw new Error(`Question ${i + 1}: correctAnswer must be a number between 0 and 3`);
      }
      
      // Check that all options are strings
      for (let j = 0; j < q.options.length; j++) {
        if (typeof q.options[j] !== 'string' || q.options[j].trim().length === 0) {
          throw new Error(`Question ${i + 1}, Option ${j + 1}: Must be a non-empty string`);
        }
      }
    }

    return true;
  }

  // Test connection for all providers
  async testAllConnections() {
    const results = {};
    
    try {
      console.log('[AIProvider] Testing OpenAI connection...');
      results.openai = await openaiService.testConnection();
    } catch (error) {
      results.openai = { success: false, error: error.message };
    }
    
    try {
      console.log('[AIProvider] Testing Gemini connection...');
      results.gemini = await geminiService.testConnection();
    } catch (error) {
      results.gemini = { success: false, error: error.message };
    }
    
    return results;
  }

  // Get provider-specific usage stats if available
  async getProviderStats() {
    const stats = {
      openai: {
        available: !!process.env.OPENAI_API_KEY,
        models: this.getAllAvailableModels().openai.length
      },
      gemini: {
        available: !!process.env.GEMINI_KEY,
        models: this.getAllAvailableModels().gemini.length
      }
    };

    return stats;
  }

  // Method to get recommended model based on use case
  getRecommendedModel(useCase = 'default') {
    const models = this.getAllAvailableModels().all;
    
    switch (useCase) {
      case 'speed':
        // Prioritize speed
        return models.find(m => m.id === 'gpt-4o-mini') || 
               models.find(m => m.id === 'gemini-2.5-flash') ||
               models[0];
               
      case 'quality':
        // Prioritize quality
        return models.find(m => m.id === 'gemini-2.5-pro') || 
               models.find(m => m.id === 'gpt-4.1') ||
               models[0];
               
      case 'cost':
        // Prioritize cost-effectiveness
        return models.find(m => m.id === 'gpt-4o-mini') || 
               models.find(m => m.id === 'gemini-2.5-flash') ||
               models[0];
               
      default:
        // Balanced recommendation
        return models.find(m => m.id === 'gpt-4o-mini') || models[0];
    }
  }
}

module.exports = new AIProviderService();