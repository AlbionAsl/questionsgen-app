// server/services/questionService.js
const { z } = require('zod');
const openaiService = require('./openaiService.js');
const { getDb } = require('../config/firebase');

const QuestionsSchema = z.array(
  z.object({
    question: z.string(),
    options: z.array(z.string()).length(4),
    correctAnswer: z.number().int().min(0).max(3),
  })
);

class QuestionService {
  async generateQuestions(chunk, amountOfQuestions, animeName, category, pageTitle) {
    const prompt = `
Generate ${amountOfQuestions} multiple-choice questions based on the following text. Each question should have one correct answer and three incorrect but plausible options. Create challenging and fun questions. Try and be specific if you can. For example, mention names of characters, groups, or locations if you have this information. NEVER mention "according to the text" or something similar.

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
      const response = await openaiService.createCompletion({
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

      const message = response.choices[0].message;

      if (message.function_call && message.function_call.name === 'generate_questions') {
        const args = JSON.parse(message.function_call.arguments);
        const parsedData = QuestionsSchema.parse(args.questions);
        return parsedData;
      } else {
        console.error('Assistant did not call the expected function.');
        return [];
      }
    } catch (error) {
      console.error('Error generating questions:', error.message);
      throw error;
    }
  }

  async writeQuestionsToFirestore(questions, animeId, metadata = {}) {
    const db = getDb();
    const batch = db.batch();

    questions.forEach((q) => {
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
        difficulty: 0, // easy
        dislikes: 0,
        likes: 0,
        totalAnswers: 0,
        correctAnswers: 0,
        random: Math.random(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    try {
      await batch.commit();
      return questions.length;
    } catch (error) {
      console.error('Error writing questions to Firestore:', error.message);
      throw error;
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