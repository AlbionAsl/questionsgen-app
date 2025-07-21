// server/services/questionsService.js
const { z } = require('zod');
const aiProviderService = require('./aiProviderService.js');
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
  async generateQuestions(content, amountOfQuestions, animeName, category, pageTitle, options = {}) {
    const startTime = Date.now();
    console.log(`[Questions] Starting generation for ${amountOfQuestions} questions`);
    console.log(`[Questions] Using model: ${options.model || 'gpt-4o-mini'}`);
    console.log(`[Questions] Content length: ${content.length} characters`);
    console.log(`[Questions] Section: ${options.sectionTitle || 'N/A'}`);
    
    // Validate input
    if (!content || content.trim().length === 0) {
      throw new Error('Cannot generate questions from empty content');
    }
    
    if (content.length > 15000) {
      console.warn(`[Questions] Content is very large (${content.length} chars), truncating to 15000`);
      content = content.substring(0, 15000);
    }

    // Use custom prompt instructions or default
    const defaultInstructions = 'Each question should have one correct answer and three incorrect but plausible options. Create challenging and fun questions. Try and be specific if you can. For example, mention names of characters, groups, or locations if you have this information. NEVER mention "according to the text" or something similar.';
    const promptInstructions = options.promptInstructions || defaultInstructions;

    // NEW IMPROVED PROMPT STRUCTURE
    const prompt = this.buildImprovedPrompt({
      content,
      animeName,
      pageTitle,
      sectionTitle: options.sectionTitle,
      category,
      promptInstructions,
      amountOfQuestions
    });

    // NEW: Emit prompt data for progress monitoring (if socket context available)
    if (options.socketEmitter) {
      options.socketEmitter('promptGenerated', {
        sectionTitle: options.sectionTitle || 'Unknown Section',
        pageTitle,
        animeName,
        model: options.model || 'gpt-4o-mini',
        promptLength: prompt.length,
        contentLength: content.length,
        questionsRequested: amountOfQuestions,
        fullPrompt: prompt,
        timestamp: new Date().toISOString()
      });
    }

    try {
      console.log(`[Questions] Making AI API call with improved prompt structure...`);
      console.log(`[Questions] Using AI Provider Service with model: ${options.model || 'gpt-4o-mini'}`);
      
      const questions = await aiProviderService.generateQuestions(
        prompt,
        options.model || 'gpt-4o-mini',
        {
          temperature: 0.7,
          ...options
        }
      );

      const duration = Date.now() - startTime;
      console.log(`[Questions] AI response received in ${duration}ms`);
      console.log(`[Questions] Successfully validated ${questions.length} questions`);
      
      return questions;
      
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

  // Get all available AI models
  getAvailableModels() {
    return aiProviderService.getAllAvailableModels();
  }

  // Test AI provider connections
  async testAIConnections() {
    return await aiProviderService.testAllConnections();
  }

  // Get AI provider statistics
  async getAIProviderStats() {
    return await aiProviderService.getProviderStats();
  }

  // NEW METHOD: Build improved prompt with clear structure
  buildImprovedPrompt({ content, animeName, pageTitle, sectionTitle, category, promptInstructions, amountOfQuestions }) {
    console.log(`[Questions] Building improved prompt structure...`);
    
    // Clean the content to ensure it doesn't interfere with the XML-like tags
    const cleanContent = content
      .replace(/<FANDOM WIKI TEXT>/gi, '[FANDOM WIKI TEXT]') // Replace any existing tags to avoid conflicts
      .replace(/<\/FANDOM WIKI TEXT>/gi, '[/FANDOM WIKI TEXT]')
      .trim();

    // Build reference information
    let referenceInfo = `For reference, this piece of text is about the Anime: '${animeName}' with page title '${pageTitle}'`;
    
    // Add section info if available
    if (sectionTitle) {
      referenceInfo += ` (and section: '${sectionTitle}')`;
    }
    
    // Add category if available and different from pageTitle
    if (category && category !== 'Individual' && category !== pageTitle) {
      referenceInfo += ` from category: '${category}'`;
    }

    // Build the complete prompt with the new structure
    const prompt = `<FANDOM WIKI TEXT>

${cleanContent}

</FANDOM WIKI TEXT>

${referenceInfo}

${promptInstructions}

Generate ${amountOfQuestions} multiple-choice questions based on the 'FANDOM WIKI TEXT'.`;

    // Log the prompt structure for debugging (first 500 chars)
    console.log(`[Questions] Prompt preview: ${prompt.substring(0, 500)}...`);
    console.log(`[Questions] Total prompt length: ${prompt.length} characters`);
    
    return prompt;
  }

  // server/services/questionsService.js - FIXED VERSION
  // Key changes: options as object, added usage tracking fields, fixed accuracyRate

  // server/services/questionsService.js - CORRECTED writeQuestionsToFirestore method
  // This matches what's actually in Firebase

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
        
        // The questions already come with options in the correct object format
        // from the OpenAI response parsing, so we don't need to convert them
        
        batch.set(docRef, {
          id: docRef.id,
          animeId: animeId, // Number type
          animeName: metadata.animeName || '',
          category: metadata.category || '', // Wiki category from fandom
          pageTitle: metadata.pageTitle || '',
          // sectionTitle is stored inside generationMetadata, not at root level
          question: q.question,
          options: q.options, // Already in object format {"0": "...", "1": "...", etc}
          correctAnswer: q.correctAnswer,
          
          // Generation metadata
          generationMetadata: {
            model: metadata.model || 'gpt-4o-mini',
            promptInstructions: metadata.promptInstructions || 'default',
            generatedAt: new Date().toISOString(),
            generationVersion: '2.1',
            sectionProcessed: true,
            sectionTitle: metadata.sectionTitle || '', // Section title goes here
            promptStructure: 'improved-v2.1' // NEW: Track prompt structure version
          },
          
          // Question analytics fields
          difficulty: 0, // 0=Easy, 1=Medium, 2=Hard (auto-adjusted based on user performance)
          dislikes: 0,
          likes: 0,
          totalAnswers: 0,
          correctAnswers: 0,
          reviewScore: null,
          // NO accuracyRate field - it's calculated on the fly when needed
          
          // Usage tracking for the quiz system
          timesUsed: 0,
          lastUsed: null, // Will be set to timestamp string when first used
          usedDates: [], // Array of YYYY-MM-DD dates
          categories: [], // IMPORTANT: Quiz categories where used (e.g., ["all", "123"])
          
          // Random field for random sampling
          random: Math.random(),
          
          // Timestamp
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          // NO updatedAt unless the question is actually updated later
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

  // When updating question analytics (in quiz app after user answers)
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
        
        transaction.update(questionRef, {
          totalAnswers: newTotalAnswers,
          correctAnswers: newCorrectAnswers,
          difficulty: newDifficulty,
          // Don't store accuracyRate - calculate it when needed
          // Only add updatedAt when actually updating
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      
      console.log(`[Questions] Updated analytics for question ${questionId}`);
    } catch (error) {
      console.error('Error updating question analytics:', error.message);
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

    // Add difficulty filter if provided
    if (filters.difficulty !== undefined) {
      query = query.where('difficulty', '==', filters.difficulty);
    }

    // Add model filter if provided
    if (filters.model) {
      query = query.where('generationMetadata.model', '==', filters.model);
    }

    // Add section filter if provided
    if (filters.sectionTitle) {
      query = query.where('sectionTitle', '==', filters.sectionTitle);
    }

    // Add prompt structure filter if provided
    if (filters.promptStructure) {
      query = query.where('generationMetadata.promptStructure', '==', filters.promptStructure);
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
        bySection: {}, // NEW: Stats by section
        byModel: {}, // Stats by AI model used
        byPromptStructure: {}, // NEW: Stats by prompt structure version
        byDifficulty: { 0: 0, 1: 0, 2: 0 }, // Easy, Medium, Hard
        recentQuestions: [],
        averageAccuracy: 0,
        totalAnswered: 0,
        generationVersions: {} // Track different generation versions
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

        // Count by section (NEW)
        if (data.sectionTitle) {
          stats.bySection[data.sectionTitle] = (stats.bySection[data.sectionTitle] || 0) + 1;
        }

        // Count by AI model
        const model = data.generationMetadata?.model || 'unknown';
        stats.byModel[model] = (stats.byModel[model] || 0) + 1;

        // Count by prompt structure (NEW)
        const promptStructure = data.generationMetadata?.promptStructure || 'legacy';
        stats.byPromptStructure[promptStructure] = (stats.byPromptStructure[promptStructure] || 0) + 1;

        // Count by generation version
        const version = data.generationMetadata?.generationVersion || 'legacy';
        stats.generationVersions[version] = (stats.generationVersions[version] || 0) + 1;

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

  // New method to get questions by section processing status
  async getQuestionsByProcessingStatus(fandomName, processed = true) {
    const db = getDb();
    
    try {
      let query = db.collection('questions');
      
      if (processed) {
        query = query.where('generationMetadata.sectionProcessed', '==', true);
      } else {
        query = query.where('generationMetadata.sectionProcessed', '==', false);
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
    if (filters.sectionTitle) {
      query = query.where('sectionTitle', '==', filters.sectionTitle);
    }
    if (filters.difficulty !== undefined) {
      query = query.where('difficulty', '==', filters.difficulty);
    }
    if (filters.promptStructure) {
      query = query.where('generationMetadata.promptStructure', '==', filters.promptStructure);
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
        if (filters.promptStructure) {
          filteredAdditionalQuery = filteredAdditionalQuery.where('generationMetadata.promptStructure', '==', filters.promptStructure);
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

  // Method to get questions by section for analysis
  async getQuestionsBySection(animeName, sectionTitle) {
    const db = getDb();
    
    try {
      let query = db.collection('questions');
      
      if (animeName) {
        query = query.where('animeName', '==', animeName);
      }
      
      if (sectionTitle) {
        query = query.where('sectionTitle', '==', sectionTitle);
      }
      
      query = query.orderBy('createdAt', 'desc');
      
      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : null,
      }));
    } catch (error) {
      console.error('Error fetching questions by section:', error.message);
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

  // Method to migrate legacy questions to include section information
  async migrateLegacyQuestions() {
    const db = getDb();
    
    try {
      // Find questions that don't have the new prompt structure
      const legacyQuery = db.collection('questions')
        .where('generationMetadata.promptStructure', '==', null)
        .limit(100); // Process in batches
      
      const snapshot = await legacyQuery.get();
      
      if (snapshot.empty) {
        console.log('[Questions] No legacy questions to migrate');
        return 0;
      }
      
      const batch = db.batch();
      let migratedCount = 0;
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        
        // Update with new prompt structure metadata
        batch.update(doc.ref, {
          sectionTitle: data.sectionTitle || 'Legacy Content',
          'generationMetadata.sectionProcessed': true,
          'generationMetadata.generationVersion': '2.1-migrated',
          'generationMetadata.promptStructure': 'legacy',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        migratedCount++;
      });
      
      await batch.commit();
      console.log(`[Questions] Migrated ${migratedCount} legacy questions`);
      return migratedCount;
      
    } catch (error) {
      console.error('Error migrating legacy questions:', error.message);
      throw error;
    }
  }

  // NEW: Method to analyze prompt structure performance
  async analyzePromptStructurePerformance() {
    const db = getDb();
    
    try {
      const snapshot = await db.collection('questions').get();
      const analysis = {
        byPromptStructure: {},
        totalQuestions: snapshot.size
      };

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const promptStructure = data.generationMetadata?.promptStructure || 'legacy';
        
        if (!analysis.byPromptStructure[promptStructure]) {
          analysis.byPromptStructure[promptStructure] = {
            count: 0,
            totalAnswered: 0,
            totalCorrect: 0,
            avgAccuracy: 0,
            avgLikes: 0,
            avgDislikes: 0
          };
        }
        
        const structure = analysis.byPromptStructure[promptStructure];
        structure.count++;
        
        if (data.totalAnswers > 0) {
          structure.totalAnswered += data.totalAnswers;
          structure.totalCorrect += data.correctAnswers;
        }
        
        structure.avgLikes += data.likes || 0;
        structure.avgDislikes += data.dislikes || 0;
      });

      // Calculate averages
      Object.keys(analysis.byPromptStructure).forEach(structure => {
        const data = analysis.byPromptStructure[structure];
        if (data.totalAnswered > 0) {
          data.avgAccuracy = Math.round((data.totalCorrect / data.totalAnswered) * 100);
        }
        data.avgLikes = Math.round(data.avgLikes / data.count);
        data.avgDislikes = Math.round(data.avgDislikes / data.count);
      });

      console.log('[Questions] Prompt structure performance analysis:', analysis);
      return analysis;
    } catch (error) {
      console.error('Error analyzing prompt structure performance:', error.message);
      throw error;
    }
  }
}

module.exports = new QuestionService();