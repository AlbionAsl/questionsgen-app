// server/services/openaiService.js
const OpenAI = require('openai');

class OpenAIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async createCompletion(options) {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        ...options
      });
      return response;
    } catch (error) {
      console.error('OpenAI API Error:', error.message);
      throw error;
    }
  }

  async testConnection() {
    try {
      const response = await this.client.models.list();
      return { success: true, models: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new OpenAIService();