// server/services/geminiService.js
const { GoogleGenAI, Type } = require('@google/genai');

class GeminiService {
  constructor() {
    if (!process.env.GEMINI_KEY) {
      console.error('[Gemini] GEMINI_KEY not found in environment variables');
      this.client = null;
    } else {
      this.client = new GoogleGenAI({
        apiKey: process.env.GEMINI_KEY,
      });
      console.log('[Gemini] Service initialized successfully');
    }
  }

  async generateQuestions(prompt, model = 'gemini-2.5-pro') {
    const startTime = Date.now();
    console.log(`[Gemini] Starting API call at ${new Date().toISOString()}`);
    console.log(`[Gemini] Using model: ${model}`);
    
    if (!this.client) {
      throw new Error('Gemini client not initialized. Check GEMINI_KEY environment variable.');
    }

    try {
      // Define the function declaration for question generation
      const generateQuestionsFunctionDeclaration = {
        name: 'generate_questions',
        description: 'Generate multiple-choice questions from a text with exactly 4 options each',
        parameters: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: {
                    type: Type.STRING,
                    description: 'The question text'
                  },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Exactly 4 answer options'
                  },
                  correctAnswer: {
                    type: Type.INTEGER,
                    description: 'Index of correct answer (0-3)'
                  },
                },
                required: ['question', 'options', 'correctAnswer'],
              },
              description: 'Array of generated questions'
            },
          },
          required: ['questions'],
        },
      };

      // Add timeout wrapper around the API call
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Gemini API call timed out after 60 seconds')), 60000);
      });

      const apiCallPromise = this.client.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          tools: [{
            functionDeclarations: [generateQuestionsFunctionDeclaration]
          }],
          temperature: 0.7,
        },
      });

      // Race between the API call and timeout
      const response = await Promise.race([apiCallPromise, timeoutPromise]);
      
      const duration = Date.now() - startTime;
      console.log(`[Gemini] API call completed successfully in ${duration}ms`);
      
      // Check for function calls in the response
      if (response.functionCalls && response.functionCalls.length > 0) {
        const functionCall = response.functionCalls[0];
        console.log(`[Gemini] Function called: ${functionCall.name}`);
        console.log(`[Gemini] Found ${functionCall.args.questions?.length || 0} questions`);
        
        return {
          success: true,
          questions: functionCall.args.questions || [],
          usage: response.usage || null
        };
      } else {
        console.log('[Gemini] No function call found, trying to parse text response');
        console.log('[Gemini] Response text:', response.text);
        
        // Fallback: try to parse JSON from text response
        try {
          const textResponse = response.text;
          const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.questions) {
              return {
                success: true,
                questions: parsed.questions,
                usage: response.usage || null
              };
            }
          }
        } catch (parseError) {
          console.error('[Gemini] Failed to parse text response as JSON');
        }
        
        throw new Error('Gemini did not return questions in expected format');
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Gemini] API call failed after ${duration}ms:`, error.message);
      
      // Log more details about the error
      if (error.code) {
        console.error(`[Gemini] Error code: ${error.code}`);
      }
      if (error.status) {
        console.error(`[Gemini] HTTP status: ${error.status}`);
      }
      
      // Re-throw with more context
      throw new Error(`Gemini API error (${duration}ms): ${error.message}`);
    }
  }

  // Alternative method using structured output instead of function calling
  async generateQuestionsStructured(prompt, model = 'gemini-2.5-flash') {
    const startTime = Date.now();
    console.log(`[Gemini] Starting structured output API call at ${new Date().toISOString()}`);
    console.log(`[Gemini] Using model: ${model}`);
    
    if (!this.client) {
      throw new Error('Gemini client not initialized. Check GEMINI_KEY environment variable.');
    }

    try {
      // Define the response schema for structured output
      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: {
                  type: Type.STRING,
                },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                correctAnswer: {
                  type: Type.INTEGER,
                },
              },
              required: ['question', 'options', 'correctAnswer'],
            },
          },
        },
        required: ['questions'],
      };

      // Add timeout wrapper around the API call
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Gemini API call timed out after 60 seconds')), 60000);
      });

      const apiCallPromise = this.client.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          temperature: 0.7,
        },
      });

      // Race between the API call and timeout
      const response = await Promise.race([apiCallPromise, timeoutPromise]);
      
      const duration = Date.now() - startTime;
      console.log(`[Gemini] Structured output API call completed successfully in ${duration}ms`);
      
      try {
        const parsedResponse = JSON.parse(response.text);
        console.log(`[Gemini] Successfully parsed ${parsedResponse.questions?.length || 0} questions`);
        
        return {
          success: true,
          questions: parsedResponse.questions || [],
          usage: response.usage || null
        };
      } catch (parseError) {
        console.error('[Gemini] Error parsing structured response:', parseError.message);
        console.error('[Gemini] Raw response:', response.text);
        throw new Error(`Failed to parse Gemini structured response: ${parseError.message}`);
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Gemini] Structured output API call failed after ${duration}ms:`, error.message);
      
      // Re-throw with more context
      throw new Error(`Gemini structured output API error (${duration}ms): ${error.message}`);
    }
  }

  async testConnection() {
    try {
      console.log('[Gemini] Testing connection...');
      
      if (!this.client) {
        return { success: false, error: 'Gemini client not initialized. Check GEMINI_KEY environment variable.' };
      }

      // Simple test with a basic prompt
      const testResponse = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Hello, this is a test. Please respond with "Connection successful".',
      });

      console.log('[Gemini] Connection test successful');
      return { 
        success: true, 
        response: testResponse.text,
        model: 'gemini-2.5-flash'
      };
    } catch (error) {
      console.error('[Gemini] Connection test failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Utility method to get available models
  getAvailableModels() {
    return [
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        description: 'Most capable model, higher quality but slower',
        provider: 'gemini',
        supportsStructuredOutput: true,
        supportsFunctionCalling: true,
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Fast and efficient, good for most use cases',
        provider: 'gemini',
        supportsStructuredOutput: true,
        supportsFunctionCalling: true,
      },
    ];
  }

  // Utility method to validate question format
  validateQuestions(questions) {
    if (!Array.isArray(questions)) {
      throw new Error('Questions must be an array');
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
}

module.exports = new GeminiService();