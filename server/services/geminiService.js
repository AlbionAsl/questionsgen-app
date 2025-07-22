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

// server/services/geminiService.js - ENHANCED error handling for generateQuestions method

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
        description: 'Generate multiple-choice questions from a text with exactly 4 options each. The correctAnswer must be the INDEX (0, 1, 2, or 3) of the correct option, NOT the actual answer text.',
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
                    description: 'Exactly 4 answer options (A, B, C, D)'
                  },
                  correctAnswer: {
                    type: Type.INTEGER,
                    description: 'Index of correct answer: 0 for first option, 1 for second, 2 for third, 3 for fourth. MUST be 0, 1, 2, or 3 ONLY.',
                    minimum: 0,
                    maximum: 3
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
      
      // ENHANCED: Better response handling
      console.log(`[Gemini] Response type: ${typeof response}`);
      console.log(`[Gemini] Response keys: ${response ? Object.keys(response).join(', ') : 'null'}`);
      
      // Check for function calls in the response
      if (response.functionCalls && response.functionCalls.length > 0) {
        const functionCall = response.functionCalls[0];
        console.log(`[Gemini] Function called: ${functionCall.name}`);
        console.log(`[Gemini] Function args type: ${typeof functionCall.args}`);
        
        if (functionCall.args && functionCall.args.questions) {
          console.log(`[Gemini] Found ${functionCall.args.questions.length} questions`);
          
          // Fix correctAnswer values if needed
          const questions = this.fixCorrectAnswerIndices(functionCall.args.questions);
          
          return {
            success: true,
            questions: questions,
            usage: response.usage || null
          };
        } else {
          console.error(`[Gemini] Function call missing questions array`);
          throw new Error('Function call response missing questions array');
        }
      } else {
        console.log('[Gemini] No function call found, trying to parse response differently');
        
        // Try different response structures
        const responseText = this.extractResponseText(response);
        
        if (responseText) {
          console.log('[Gemini] Response text length:', responseText.length);
          console.log('[Gemini] Response text preview:', responseText.substring(0, 500));
          
          // Try multiple parsing strategies
          const parsedQuestions = await this.tryParseQuestions(responseText);
          
          if (parsedQuestions && parsedQuestions.length > 0) {
            return {
              success: true,
              questions: parsedQuestions,
              usage: response.usage || null
            };
          }
        }
        
        // FALLBACK: Try structured output instead
        console.log('[Gemini] Function calling failed, falling back to structured output...');
        return await this.generateQuestionsStructured(prompt, model);
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Gemini] API call failed after ${duration}ms:`, error.message);
      console.error(`[Gemini] Error stack:`, error.stack);
      
      // Log more details about the error
      if (error.response) {
        console.error(`[Gemini] Error response status:`, error.response.status);
        console.error(`[Gemini] Error response data:`, JSON.stringify(error.response.data, null, 2));
      }
      
      // Add more context to the error
      const enhancedError = new Error(`Gemini API error (${duration}ms, model: ${model}): ${error.message}`);
      enhancedError.originalError = error;
      enhancedError.model = model;
      enhancedError.duration = duration;
      
      throw enhancedError;
    }
  }

  // Helper method to extract text from various response structures
  extractResponseText(response) {
    // Try different paths to find the response text
    const paths = [
      () => response.text,
      () => response.candidates?.[0]?.content?.parts?.[0]?.text,
      () => response.candidates?.[0]?.text,
      () => response.result?.text,
      () => response.response?.text
    ];
    
    for (const pathFn of paths) {
      try {
        const text = pathFn();
        if (text && typeof text === 'string') {
          return text;
        }
      } catch (e) {
        // Continue to next path
      }
    }
    
    return null;
  }

  // Helper method to try multiple parsing strategies
  async tryParseQuestions(responseText) {
    const strategies = [
      // Strategy 1: Direct JSON parse
      () => {
        console.log('[Gemini] Trying direct JSON parse...');
        const parsed = JSON.parse(responseText);
        return parsed.questions || parsed;
      },
      
      // Strategy 2: Extract JSON from text
      () => {
        console.log('[Gemini] Trying to extract JSON from text...');
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return parsed.questions || parsed;
        }
        return null;
      },
      
      // Strategy 3: Extract JSON array
      () => {
        console.log('[Gemini] Trying to extract JSON array...');
        const arrayMatch = responseText.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          return JSON.parse(arrayMatch[0]);
        }
        return null;
      },
      
      // Strategy 4: Clean markdown code blocks
      () => {
        console.log('[Gemini] Trying to clean markdown code blocks...');
        const cleaned = responseText
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/gi, '')
          .trim();
        const parsed = JSON.parse(cleaned);
        return parsed.questions || parsed;
      }
    ];
    
    for (const strategy of strategies) {
      try {
        const result = strategy();
        if (result && Array.isArray(result) && result.length > 0) {
          console.log(`[Gemini] Successfully parsed ${result.length} questions`);
          return this.fixCorrectAnswerIndices(result);
        }
      } catch (e) {
        // Continue to next strategy
      }
    }
    
    console.error('[Gemini] All parsing strategies failed');
    return null;
  }

  // Helper method to fix correctAnswer indices
  fixCorrectAnswerIndices(questions) {
    return questions.map((q, i) => {
      if (typeof q.correctAnswer !== 'number' || q.correctAnswer < 0 || q.correctAnswer > 3) {
        console.warn(`[Gemini] Question ${i + 1}: correctAnswer is ${q.correctAnswer}, attempting to fix...`);
        
        // Try to find the correct index by matching the answer value to options
        let fixedIndex = -1;
        const correctAnswerStr = String(q.correctAnswer);
        
        for (let optionIndex = 0; optionIndex < (q.options?.length || 0); optionIndex++) {
          const option = String(q.options[optionIndex]);
          
          if (option === correctAnswerStr || 
              option.replace(/,/g, '') === correctAnswerStr.replace(/,/g, '') ||
              option.includes(correctAnswerStr) || correctAnswerStr.includes(option)) {
            fixedIndex = optionIndex;
            break;
          }
        }
        
        if (fixedIndex !== -1) {
          console.log(`[Gemini] Fixed question ${i + 1}: correctAnswer changed from ${q.correctAnswer} to ${fixedIndex}`);
          q.correctAnswer = fixedIndex;
        } else {
          console.log(`[Gemini] Defaulting question ${i + 1} correctAnswer to 0`);
          q.correctAnswer = 0;
        }
      }
      
      return q;
    });
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
                  description: 'The question text'
                },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Exactly 4 answer options'
                },
                correctAnswer: {
                  type: Type.INTEGER,
                  description: 'Index of correct answer: 0 for first option, 1 for second, 2 for third, 3 for fourth. MUST be 0, 1, 2, or 3 ONLY.',
                  minimum: 0,
                  maximum: 3
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
      
      // ENHANCED: Better response handling
      console.log(`[Gemini] Structured response length:`, response.text?.length || 0);
      console.log(`[Gemini] Structured response preview:`, response.text?.substring(0, 500) || 'No text');
      
      if (!response.text || response.text.trim().length === 0) {
        console.error('[Gemini] Structured output returned empty response');
        throw new Error('Gemini returned empty structured response');
      }
      
      try {
        const parsedResponse = JSON.parse(response.text);
        console.log(`[Gemini] Successfully parsed structured response`);
        console.log(`[Gemini] Questions found: ${parsedResponse.questions?.length || 0}`);
        
        if (!parsedResponse.questions || !Array.isArray(parsedResponse.questions)) {
          console.error('[Gemini] Parsed response missing questions array:', parsedResponse);
          throw new Error('Structured response missing questions array');
        }
        
        if (parsedResponse.questions.length === 0) {
          console.error('[Gemini] Structured response contains empty questions array');
          throw new Error('Structured response contains no questions');
        }
        
        // Validate question structure
        for (let i = 0; i < parsedResponse.questions.length; i++) {
          const q = parsedResponse.questions[i];
          if (!q.question || !Array.isArray(q.options) || q.options.length !== 4) {
            console.error(`[Gemini] Invalid question structure at index ${i}:`, q);
            throw new Error(`Invalid question structure at index ${i}`);
          }
          
          // ENHANCED: Fix correctAnswer if it's not in 0-3 range
          if (typeof q.correctAnswer !== 'number' || q.correctAnswer < 0 || q.correctAnswer > 3) {
            console.warn(`[Gemini] Question ${i + 1}: correctAnswer is ${q.correctAnswer}, attempting to fix...`);
            
            // Try to find the correct index by matching the answer value to options
            let fixedIndex = -1;
            
            // Convert correctAnswer to string for comparison
            const correctAnswerStr = String(q.correctAnswer);
            
            for (let optionIndex = 0; optionIndex < q.options.length; optionIndex++) {
              const option = String(q.options[optionIndex]);
              
              // Try exact match
              if (option === correctAnswerStr) {
                fixedIndex = optionIndex;
                break;
              }
              
              // Try without commas (for numbers like 77,000,000 vs 77000000)
              if (option.replace(/,/g, '') === correctAnswerStr.replace(/,/g, '')) {
                fixedIndex = optionIndex;
                break;
              }
              
              // Try partial match for longer strings
              if (option.includes(correctAnswerStr) || correctAnswerStr.includes(option)) {
                fixedIndex = optionIndex;
                break;
              }
            }
            
            if (fixedIndex !== -1) {
              console.log(`[Gemini] Fixed question ${i + 1}: correctAnswer changed from ${q.correctAnswer} to ${fixedIndex}`);
              q.correctAnswer = fixedIndex;
            } else {
              console.error(`[Gemini] Could not fix correctAnswer for question ${i + 1}. Options:`, q.options, 'CorrectAnswer:', q.correctAnswer);
              // Default to 0 as last resort
              console.log(`[Gemini] Defaulting question ${i + 1} correctAnswer to 0`);
              q.correctAnswer = 0;
            }
          }
        }
        
        return {
          success: true,
          questions: parsedResponse.questions,
          usage: response.usage || null
        };
      } catch (parseError) {
        console.error('[Gemini] Error parsing structured response:', parseError.message);
        console.error('[Gemini] Raw response:', response.text);
        
        // ENHANCED: Try to extract partial JSON if possible
        try {
          console.log('[Gemini] Attempting to extract partial JSON...');
          const cleanText = response.text.replace(/```json\n?/g, '').replace(/\n?```/g, '');
          const partialParsed = JSON.parse(cleanText);
          
          if (partialParsed.questions && Array.isArray(partialParsed.questions) && partialParsed.questions.length > 0) {
            console.log(`[Gemini] Successfully extracted ${partialParsed.questions.length} questions after cleaning`);
            return {
              success: true,
              questions: partialParsed.questions,
              usage: response.usage || null
            };
          }
        } catch (cleanupError) {
          console.error('[Gemini] Cleanup parsing also failed:', cleanupError.message);
        }
        
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