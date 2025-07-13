// server/services/questionsService.js
const { z } = require('zod');
const openaiService = require('./openaiService.js');
const { getDb } = require('../config/firebase');
const admin = require('firebase-admin');

const QuestionsSchema = z.array(
  z.object({
    question: z.string(),
    options: z.array(z.string()).length(4),
    correctAnswer: z.number().int().min(0).max(3),
  })
);

class QuestionService {
  async generateQuestions(chunk, amountOfQuestions, animeName, category, pageTitle, options = {}) {
    const startTime = Date.now();
    console.log(`[Questions] Starting generation for ${amountOfQuestions} questions`);
    console.log(`[Questions] Using model: ${options.model || 'gpt-4o-mini'}`);
    console.log(`[Questions] Chunk length: ${chunk.length} characters`);
    
    // Validate input
    if (!chunk || chunk.trim().length === 0) {
      throw new Error('Cannot generate questions from empty content');
    }
    
    if (chunk.length > 15000) {
      console.warn(`[Questions] Chunk is very large (${chunk.length} chars), truncating to 15000`);
      chunk = chunk.substring(0, 15000);
    }

    // Use custom prompt instructions or default
    const defaultInstructions = 'Each question should have one correct answer and three incorrect but plausible options. Create challenging and fun questions. Try and be specific if you can. For example, mention names of characters, groups, or locations if you have this information. NEVER mention "according to the text" or something similar.';
    const promptInstructions = options.promptInstructions || defaultInstructions;

    const prompt = `
Generate ${amountOfQuestions} multiple-choice questions based on the following text. ${promptInstructions}

Text:
For reference, this piece of text is about the Anime: ${animeName} ${
      category ? `with category: ${category}` : ''
    } and title: ${pageTitle}
${chunk}
`;

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

    try {
      console.log(`[Questions] Making OpenAI API call...`);
      
      const response = await openaiService.createCompletion({
        model: options.model || 'gpt-4o-mini', // Use custom model
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that is an expert in generating fun, challenging, and diverse quiz questions.',
          },
          { role: 'user', content: prompt },
        ],
        functions: functions,
        function_call: { name: 'generate_questions' },
        max_tokens: 1000,
        temperature: 0.7,
      });

      const duration = Date.now() - startTime;
      console.log(`[Questions] OpenAI response received in ${duration}ms`);

      const message = response.choices[0].message;

      if (message.function_call && message.function_call.name === 'generate_questions') {
        try {
          const args = JSON.parse(message.function_call.arguments);
          console.log(`[Questions] Parsing response... found ${args.questions?.length || 0} questions`);
          
          const parsedData = QuestionsSchema.parse(args.questions);
          console.log(`[Questions] Successfully validated ${parsedData.length} questions`);
          
          return parsedData;
        } catch (parseError) {
          console.error('[Questions] Error parsing OpenAI response:', parseError.message);
          console.error('[Questions] Raw response:', message.function_call.arguments);
          throw new Error(`Failed to parse OpenAI response: ${parseError.message}`);
        }
      } else {
        console.error('[Questions] OpenAI did not call the expected function');
        console.error('[Questions] Response:', JSON.stringify(message, null, 2));
        throw new Error('OpenAI did not call the expected function');
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Questions] Generation failed after ${duration}ms:`, error.message);
      
      // Don't re-throw timeout errors, let the caller handle them
      if (error.message.includes('timeout') || error.message.includes('timed out')) {
        throw new Error(`Question generation timed out after ${duration}ms`);
      }
      
      // For other errors, provide more context
      throw new Error(`Question generation failed: ${error.message}`);
    }
  }

  async writeQuestionsToFirestore(questions, animeId, metadata = {}) {
    const startTime = Date.now();
    console.log(`[Questions] Writing ${questions.length} questions to Firestore...`);
    
    if (!questions || questions.length === 0) {
      console.warn('[Questions] No questions to write');
      return 0;
    }

    const db = getDb();
    const batch = db.batch();

    questions.forEach((q, index) => {
      try {
        const docRef = db.collection('questions').doc();
        batch.set(docRef, {
          id: docRef.id,
          animeId: animeId,
          animeName: metadata.animeName || '',
          category: metadata.category || '',
          pageTitle: metadata.pageTitle || '',
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          // NEW: Store generation metadata
          generationMetadata: {
            model: metadata.model || 'gpt-4o-mini',
            promptInstructions: metadata.promptInstructions || 'default',
            generatedAt: new Date().toISOString()
          },
          difficulty: 0, // easy
          dislikes: 0,
          likes: 0,
          totalAnswers: 0,
          correctAnswers: 0,
          random: Math.random(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (error) {
        console.error(`[Questions] Error preparing question ${index + 1}:`, error.message);
        throw error;
      }
    });

    try {
      await batch.commit();
      const duration = Date.now() - startTime;
      console.log(`[Questions] Successfully wrote ${questions.length} questions in ${duration}ms`);
      return questions.length;
    } catch (error) {
      console.error('[Questions] Error writing to Firestore:', error.message);
      throw new Error(`Failed to write questions to database: ${error.message}`);
    }
  }

  async getQuestions(filters = {}) {
    const db = getDb();
    let query = db.collection('questions');

    if (filters.animeId) {
      query = query.where('animeId', '==', filters.animeId);
    }

    if (filters.animeName) {
      query = query.where('animeName', '==', filters.animeName);
    }

    if (filters.category) {
      query = query.where('category', '==', filters.category);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    query = query.orderBy('createdAt', 'desc');

    try {
      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching questions:', error.message);
      throw error;
    }
  }

  async getQuestionStats() {
    const db = getDb();
    
    try {
      const snapshot = await db.collection('questions').get();
      const stats = {
        total: snapshot.size,
        byAnime: {},
        byCategory: {},
        byModel: {}, // NEW: Stats by AI model used
        recentQuestions: []
      };

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        
        // Count by anime
        if (data.animeName) {
          stats.byAnime[data.animeName] = (stats.byAnime[data.animeName] || 0) + 1;
        }
        
        // Count by category
        if (data.category) {
          stats.byCategory[data.category] = (stats.byCategory[data.category] || 0) + 1;
        }

        // Count by AI model
        const model = data.generationMetadata?.model || 'unknown';
        stats.byModel[model] = (stats.byModel[model] || 0) + 1;
      });

      // Get recent questions
      const recentSnapshot = await db.collection('questions')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
      
      stats.recentQuestions = recentSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return stats;
    } catch (error) {
      console.error('Error fetching question stats:', error.message);
      throw error;
    }
  }
}

module.exports = new QuestionService();