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
      console.log(`[Gemini] Full response structure:`, JSON.stringify(response, null, 2));
      
      // Check for function calls in the response
      if (response.functionCalls && response.functionCalls.length > 0) {
        const functionCall = response.functionCalls[0];
        console.log(`[Gemini] Function called: ${functionCall.name}`);
        console.log(`[Gemini] Function args:`, JSON.stringify(functionCall.args, null, 2));
        
        if (functionCall.args && functionCall.args.questions) {
          console.log(`[Gemini] Found ${functionCall.args.questions.length} questions`);
          
          // ENHANCED: Fix correctAnswer values if needed
          const questions = functionCall.args.questions;
          for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            
            // Fix correctAnswer if it's not in 0-3 range
            if (typeof q.correctAnswer !== 'number' || q.correctAnswer < 0 || q.correctAnswer > 3) {
              console.warn(`[Gemini] Function call - Question ${i + 1}: correctAnswer is ${q.correctAnswer}, attempting to fix...`);
              
              // Try to find the correct index by matching the answer value to options
              let fixedIndex = -1;
              const correctAnswerStr = String(q.correctAnswer);
              
              for (let optionIndex = 0; optionIndex < q.options?.length || 0; optionIndex++) {
                const option = String(q.options[optionIndex]);
                
                if (option === correctAnswerStr || 
                    option.replace(/,/g, '') === correctAnswerStr.replace(/,/g, '') ||
                    option.includes(correctAnswerStr) || correctAnswerStr.includes(option)) {
                  fixedIndex = optionIndex;
                  break;
                }
              }
              
              if (fixedIndex !== -1) {
                console.log(`[Gemini] Function call - Fixed question ${i + 1}: correctAnswer changed from ${q.correctAnswer} to ${fixedIndex}`);
                q.correctAnswer = fixedIndex;
              } else {
                console.log(`[Gemini] Function call - Defaulting question ${i + 1} correctAnswer to 0`);
                q.correctAnswer = 0;
              }
            }
          }
          
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
        
        // ENHANCED: Check different response properties
        const responseText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log('[Gemini] Response text length:', responseText.length);
        console.log('[Gemini] Response text preview:', responseText.substring(0, 500));
        
        // ENHANCED: Multiple parsing attempts
        try {
          // Try 1: Direct JSON parse
          if (responseText) {
            console.log('[Gemini] Attempting direct JSON parse...');
            const parsed = JSON.parse(responseText);
            if (parsed.questions) {
              console.log(`[Gemini] Successfully parsed ${parsed.questions.length} questions from text`);
              return {
                success: true,
                questions: parsed.questions,
                usage: response.usage || null
              };
            }
          }
          
          // Try 2: Extract JSON from text
          console.log('[Gemini] Attempting to extract JSON from response...');
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            console.log('[Gemini] Found JSON-like content, parsing...');
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.questions) {
              console.log(`[Gemini] Successfully extracted ${parsed.questions.length} questions`);
              return {
                success: true,
                questions: parsed.questions,
                usage: response.usage || null
              };
            }
          }
          
          // Try 3: Check if response is already structured
          if (response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0];
            console.log('[Gemini] Checking candidate structure...');
            
            // Check if there's structured data in the candidate
            if (candidate.content && candidate.content.parts) {
              for (const part of candidate.content.parts) {
                if (part.functionCall) {
                  console.log('[Gemini] Found function call in candidate parts');
                  const args = part.functionCall.args;
                  if (args && args.questions) {
                    return {
                      success: true,
                      questions: args.questions,
                      usage: response.usage || null
                    };
                  }
                }
              }
            }
          }
          
        } catch (parseError) {
          console.error('[Gemini] All parsing attempts failed:', parseError.message);
        }
        
        // FALLBACK: Try structured output instead
        console.log('[Gemini] Function calling failed, falling back to structured output...');
        return await this.generateQuestionsStructured(prompt, 'gemini-2.5-flash');
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
      
      // FALLBACK: If function calling completely fails, try structured output
      if (error.message.includes('function') || error.message.includes('format')) {
        console.log('[Gemini] Attempting fallback to structured output...');
        try {
          return await this.generateQuestionsStructured(prompt, 'gemini-2.5-flash');
        } catch (fallbackError) {
          console.error('[Gemini] Fallback also failed:', fallbackError.message);
        }
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