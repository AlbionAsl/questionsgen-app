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
          // Enhanced generation metadata
          generationMetadata: {
            model: metadata.model || 'gpt-4o-mini',
            promptInstructions: metadata.promptInstructions || 'default',
            generatedAt: new Date().toISOString(),
            generationVersion: '2.0', // Track different versions of generation logic
            chunkProcessed: true
          },
          // Question analytics
          difficulty: 0, // Can be updated based on user feedback
          dislikes: 0,
          likes: 0,
          totalAnswers: 0,
          correctAnswers: 0,
          accuracyRate: 0, // Will be calculated: correctAnswers / totalAnswers
          // Random field for random sampling
          random: Math.random(),
          // Timestamps
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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

    // Add difficulty filter if provided
    if (filters.difficulty !== undefined) {
      query = query.where('difficulty', '==', filters.difficulty);
    }

    // Add model filter if provided
    if (filters.model) {
      query = query.where('generationMetadata.model', '==', filters.model);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    query = query.orderBy('createdAt', 'desc');

    try {
      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Convert timestamps to readable format
        createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : null,
        updatedAt: doc.data().updatedAt ? doc.data().updatedAt.toDate() : null,
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
        byModel: {}, // Stats by AI model used
        byDifficulty: { 0: 0, 1: 0, 2: 0 }, // Easy, Medium, Hard
        recentQuestions: [],
        averageAccuracy: 0,
        totalAnswered: 0
      };

      let totalAccuracy = 0;
      let questionsWithAnswers = 0;

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

        // Count by difficulty
        if (data.difficulty !== undefined) {
          stats.byDifficulty[data.difficulty] = (stats.byDifficulty[data.difficulty] || 0) + 1;
        }

        // Calculate average accuracy
        if (data.totalAnswers > 0) {
          stats.totalAnswered += data.totalAnswers;
          const accuracy = data.correctAnswers / data.totalAnswers;
          totalAccuracy += accuracy;
          questionsWithAnswers++;
        }
      });

      // Calculate average accuracy
      if (questionsWithAnswers > 0) {
        stats.averageAccuracy = Math.round((totalAccuracy / questionsWithAnswers) * 100);
      }

      // Get recent questions
      const recentSnapshot = await db.collection('questions')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
      
      stats.recentQuestions = recentSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : null,
      }));

      return stats;
    } catch (error) {
      console.error('Error fetching question stats:', error.message);
      throw error;
    }
  }

  // New method to get questions by chunk processing status
  async getQuestionsByProcessingStatus(fandomName, processed = true) {
    const db = getDb();
    
    try {
      let query = db.collection('questions');
      
      if (processed) {
        query = query.where('generationMetadata.chunkProcessed', '==', true);
      } else {
        query = query.where('generationMetadata.chunkProcessed', '==', false);
      }
      
      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching questions by processing status:', error.message);
      throw error;
    }
  }

  // Method to update question analytics (when users answer questions)
  async updateQuestionAnalytics(questionId, wasCorrect) {
    const db = getDb();
    
    try {
      const questionRef = db.collection('questions').doc(questionId);
      
      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(questionRef);
        
        if (!doc.exists) {
          throw new Error('Question not found');
        }
        
        const data = doc.data();
        const newTotalAnswers = (data.totalAnswers || 0) + 1;
        const newCorrectAnswers = (data.correctAnswers || 0) + (wasCorrect ? 1 : 0);
        const newAccuracyRate = newCorrectAnswers / newTotalAnswers;
        
        // Auto-adjust difficulty based on accuracy rate
        let newDifficulty = data.difficulty || 0;
        if (newTotalAnswers >= 10) { // Only adjust after enough data
          if (newAccuracyRate > 0.8) {
            newDifficulty = 0; // Easy
          } else if (newAccuracyRate > 0.5) {
            newDifficulty = 1; // Medium
          } else {
            newDifficulty = 2; // Hard
          }
        }
        
        transaction.update(questionRef, {
          totalAnswers: newTotalAnswers,
          correctAnswers: newCorrectAnswers,
          accuracyRate: newAccuracyRate,
          difficulty: newDifficulty,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      
      console.log(`[Questions] Updated analytics for question ${questionId}`);
    } catch (error) {
      console.error('Error updating question analytics:', error.message);
      throw error;
    }
  }

  // Method to get random questions for quiz generation
  async getRandomQuestions(filters = {}, count = 10) {
    const db = getDb();
    let query = db.collection('questions');

    // Apply filters
    if (filters.animeId) {
      query = query.where('animeId', '==', filters.animeId);
    }
    if (filters.animeName) {
      query = query.where('animeName', '==', filters.animeName);
    }
    if (filters.category) {
      query = query.where('category', '==', filters.category);
    }
    if (filters.difficulty !== undefined) {
      query = query.where('difficulty', '==', filters.difficulty);
    }

    // Use random sampling for better distribution
    query = query.where('random', '>=', Math.random()).limit(count);

    try {
      const snapshot = await query.get();
      let questions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // If we don't have enough questions, try with a different random value
      if (questions.length < count) {
        const additionalQuery = db.collection('questions')
          .where('random', '<=', Math.random())
          .limit(count - questions.length);
        
        // Apply same filters to additional query
        let filteredAdditionalQuery = additionalQuery;
        if (filters.animeId) {
          filteredAdditionalQuery = filteredAdditionalQuery.where('animeId', '==', filters.animeId);
        }
        if (filters.animeName) {
          filteredAdditionalQuery = filteredAdditionalQuery.where('animeName', '==', filters.animeName);
        }
        
        const additionalSnapshot = await filteredAdditionalQuery.get();
        const additionalQuestions = additionalSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        questions = [...questions, ...additionalQuestions];
      }

      // Shuffle and return requested count
      return questions
        .sort(() => Math.random() - 0.5)
        .slice(0, count);
        
    } catch (error) {
      console.error('Error fetching random questions:', error.message);
      throw error;
    }
  }

  // Method to clean up questions (e.g., remove duplicates, low-quality questions)
  async cleanupQuestions(options = {}) {
    const db = getDb();
    
    try {
      let deleteCount = 0;
      
      // Remove questions with very low accuracy (if they have enough data)
      if (options.removeVeryLowAccuracy) {
        const lowAccuracyQuery = db.collection('questions')
          .where('totalAnswers', '>=', 20)
          .where('accuracyRate', '<=', 0.1);
        
        const lowAccuracySnapshot = await lowAccuracyQuery.get();
        const batch = db.batch();
        
        lowAccuracySnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
          deleteCount++;
        });
        
        if (deleteCount > 0) {
          await batch.commit();
          console.log(`[Questions] Removed ${deleteCount} questions with very low accuracy`);
        }
      }
      
      return deleteCount;
    } catch (error) {
      console.error('Error cleaning up questions:', error.message);
      throw error;
    }
  }
}

module.exports = new QuestionService();