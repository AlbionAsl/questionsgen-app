// server/services/openaiService.js
const OpenAI = require('openai');

class OpenAIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60000, // 60 second timeout
      maxRetries: 2,   // Retry failed requests up to 2 times
    });
  }

  async createCompletion(options) {
    const startTime = Date.now();
    console.log(`[OpenAI] Starting API call at ${new Date().toISOString()}`);
    
    try {
      // Add timeout wrapper around the API call
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('OpenAI API call timed out after 60 seconds')), 60000);
      });

      const apiCallPromise = this.client.chat.completions.create({
        model: options.model || 'gpt-4o-mini', // Use the model from options
        ...options
      });

      // Race between the API call and timeout
      const response = await Promise.race([apiCallPromise, timeoutPromise]);
      
      const duration = Date.now() - startTime;
      console.log(`[OpenAI] API call completed successfully in ${duration}ms`);
      
      return response;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[OpenAI] API call failed after ${duration}ms:`, error.message);
      
      // Log more details about the error
      if (error.code) {
        console.error(`[OpenAI] Error code: ${error.code}`);
      }
      if (error.status) {
        console.error(`[OpenAI] HTTP status: ${error.status}`);
      }
      if (error.response?.data) {
        console.error(`[OpenAI] Response data:`, error.response.data);
      }
      
      // Re-throw with more context
      throw new Error(`OpenAI API error (${duration}ms): ${error.message}`);
    }
  }

  async testConnection() {
    try {
      console.log('[OpenAI] Testing connection...');
      const response = await this.client.models.list();
      console.log('[OpenAI] Connection test successful');
      return { success: true, models: response.data };
    } catch (error) {
      console.error('[OpenAI] Connection test failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new OpenAIService();