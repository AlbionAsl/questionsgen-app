// server/services/simpleQuestionReviewService.js
const { getDb } = require('../config/firebase');
const admin = require('firebase-admin');

class SimpleQuestionReviewService {
  constructor() {}

  // Main method - just score questions and update Firestore
  async reviewQuestions(animeName, batchSize = 10, model = 'gemini-2.5-flash', socketEmitter = null, customPrompt = null) {
    console.log(`[SimpleReview] Starting review for ${animeName} with batch size ${batchSize}`);
    console.log(`[SimpleReview] Using custom prompt: ${customPrompt ? 'Yes' : 'No (default)'}`);
    
    try {
      // Get unreviewed questions
      const unreviewed = await this.getUnreviewedQuestions(animeName);
      
      if (unreviewed.length === 0) {
        return {
          success: true,
          message: 'No unreviewed questions found',
          totalProcessed: 0,
          results: []
        };
      }

      console.log(`[SimpleReview] Found ${unreviewed.length} unreviewed questions`);

      const results = [];
      const totalBatches = Math.ceil(unreviewed.length / batchSize);
      
      // Process in batches
      for (let i = 0; i < unreviewed.length; i += batchSize) {
        const batch = unreviewed.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        
        console.log(`[SimpleReview] Processing batch ${batchNumber}/${totalBatches} (${batch.length} questions)`);
        
        if (socketEmitter) {
          socketEmitter('reviewProgress', {
            currentBatch: batchNumber,
            totalBatches: totalBatches,
            questionsInBatch: batch.length,
            totalProcessed: results.length
          });
        }

        try {
          // Get scores from AI (pass custom prompt)
          const scores = await this.getScoresFromAI(batch, model, animeName, customPrompt);
          
          // Update database with scores
          await this.updateQuestionsWithScores(batch, scores);
          
          // Track results
          batch.forEach((question, index) => {
            results.push({
              questionId: question.id,
              question: question.question,
              score: scores[index] || 3
            });
          });
          
          console.log(`[SimpleReview] Completed batch ${batchNumber}, scores: ${scores.join(', ')}`);
          
        } catch (error) {
          console.error(`[SimpleReview] Error processing batch ${batchNumber}:`, error.message);
          
          // Give default scores on error
          const defaultScores = batch.map(() => 3);
          await this.updateQuestionsWithScores(batch, defaultScores);
          
          batch.forEach((question, index) => {
            results.push({
              questionId: question.id,
              question: question.question,
              score: 3
            });
          });
        }
      }

      return {
        success: true,
        totalProcessed: results.length,
        results: results,
        scoreDistribution: this.calculateScoreDistribution(results)
      };

    } catch (error) {
      console.error(`[SimpleReview] Failed to review questions:`, error.message);
      throw error;
    }
  }

  // Get unreviewed questions from Firestore
  async getUnreviewedQuestions(animeName) {
    try {
      const db = getDb();
      const snapshot = await db.collection('questions')
        .where('animeName', '==', animeName)
        .where('reviewScore', '==', null)
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error(`[SimpleReview] Error fetching unreviewed questions:`, error.message);
      throw error;
    }
  }

  // Get scores from AI (simplified approach)
  async getScoresFromAI(questions, model, animeName, customPrompt = null) {
    console.log(`[SimpleReview] Getting scores from AI for ${questions.length} questions using ${model}`);
    console.log(`[SimpleReview] Using custom prompt: ${customPrompt ? 'Yes' : 'No'}`);
    
    // Build prompt (use custom if provided, otherwise default)
    const prompt = customPrompt 
      ? this.buildCustomPrompt(questions, animeName, customPrompt)
      : this.buildScoreOnlyPrompt(questions, animeName);
    
    try {
      if (model.includes('gemini')) {
        return await this.getScoresFromGemini(prompt, model, questions.length);
      } else {
        return await this.getScoresFromOpenAI(prompt, model, questions.length);
      }
    } catch (error) {
      console.error(`[SimpleReview] AI scoring failed:`, error.message);
      // Return default scores
      return questions.map(() => 3);
    }
  }

  // NEW: Build custom prompt using user's template
  buildCustomPrompt(questions, animeName, customPrompt) {
    const questionsText = questions.map((q, index) => {
      const optionsText = q.options.map((option, i) => `${String.fromCharCode(65 + i)}. ${option}`).join('\n');
      const correctLetter = String.fromCharCode(65 + q.correctAnswer);
      
      return `Question ${index + 1}:
${q.question}
${optionsText}
Correct Answer: ${correctLetter}`;
    }).join('\n\n');

    console.log(`[SimpleReview] Building custom prompt with ${questions.length} questions for ${animeName}`);
    
    // Replace placeholders in custom prompt
    const finalPrompt = customPrompt
      .replace(/\{count\}/g, questions.length.toString())
      .replace(/\{animeName\}/g, animeName)
      .replace(/\{questions\}/g, questionsText);

    console.log(`[SimpleReview] Custom prompt preview:`, finalPrompt.substring(0, 200) + '...');
    
    return finalPrompt;
  }

  // Build prompt that ONLY asks for scores (default)
  buildScoreOnlyPrompt(questions, animeName) {
    const questionsText = questions.map((q, index) => {
      const optionsText = q.options.map((option, i) => `${String.fromCharCode(65 + i)}. ${option}`).join('\n');
      const correctLetter = String.fromCharCode(65 + q.correctAnswer);
      
      return `Question ${index + 1}:
${q.question}
${optionsText}
Correct Answer: ${correctLetter}`;
    }).join('\n\n');

    return `Rate these ${questions.length} anime quiz questions about "${animeName}" on a scale of 1-5:

5 = Excellent (specific details, clear question, balanced options)
4 = Good (clear question, mostly specific, good options)
3 = Acceptable (basic question, adequate options)
2 = Poor (vague question, obvious wrong answers)
1 = Terrible (broken question, impossible to answer)

${questionsText}

RESPOND WITH ONLY A JSON ARRAY OF ${questions.length} INTEGER SCORES:
Example: [4, 5, 3, 2, 4, 5, 1, 3, 4, 2]

Your response:`;
  }

  // Get scores from Gemini
  async getScoresFromGemini(prompt, model, expectedCount) {
    try {
      const { GoogleGenAI } = require('@google/genai');
      const genAI = new GoogleGenAI({
        apiKey: process.env.GEMINI_KEY,
      });

      const response = await genAI.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          temperature: 0.3,
        },
      });

      const responseText = response.text || '';
      console.log(`[SimpleReview] Gemini response:`, responseText.substring(0, 200));
      
      return this.parseScoreArray(responseText, expectedCount);
      
    } catch (error) {
      console.error(`[SimpleReview] Gemini error:`, error.message);
      return Array(expectedCount).fill(3);
    }
  }

  // Get scores from OpenAI
  async getScoresFromOpenAI(prompt, model, expectedCount) {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are a quiz quality expert. Respond only with a JSON array of integer scores from 1-5.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 100,
      });

      const responseText = response.choices[0].message.content;
      console.log(`[SimpleReview] OpenAI response:`, responseText);
      
      return this.parseScoreArray(responseText, expectedCount);
      
    } catch (error) {
      console.error(`[SimpleReview] OpenAI error:`, error.message);
      return Array(expectedCount).fill(3);
    }
  }

  // Parse score array from AI response
  parseScoreArray(responseText, expectedCount) {
    try {
      // Find JSON array in response
      const jsonMatch = responseText.match(/\[[\d\s,]+\]/);
      if (!jsonMatch) {
        console.warn(`[SimpleReview] No JSON array found in response`);
        return Array(expectedCount).fill(3);
      }

      const scores = JSON.parse(jsonMatch[0]);
      
      if (!Array.isArray(scores)) {
        console.warn(`[SimpleReview] Response is not an array`);
        return Array(expectedCount).fill(3);
      }

      // Validate scores and pad/truncate to expected count
      const validScores = scores
        .map(s => Math.max(1, Math.min(5, Math.round(Number(s)) || 3)))
        .slice(0, expectedCount);
        
      // Pad with 3s if not enough scores
      while (validScores.length < expectedCount) {
        validScores.push(3);
      }

      console.log(`[SimpleReview] Parsed scores:`, validScores);
      return validScores;
      
    } catch (error) {
      console.error(`[SimpleReview] Error parsing scores:`, error.message);
      return Array(expectedCount).fill(3);
    }
  }

  // Update questions in Firestore with scores
  async updateQuestionsWithScores(questions, scores) {
    try {
      const db = getDb();
      const batch = db.batch();
      
      questions.forEach((question, index) => {
        const questionRef = db.collection('questions').doc(question.id);
        batch.update(questionRef, {
          reviewScore: scores[index] || 3,
          reviewedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      
      await batch.commit();
      console.log(`[SimpleReview] Updated ${questions.length} questions with scores`);
      
    } catch (error) {
      console.error(`[SimpleReview] Error updating questions:`, error.message);
      throw error;
    }
  }

  // Calculate score distribution
  calculateScoreDistribution(results) {
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    results.forEach(result => {
      if (result.score >= 1 && result.score <= 5) {
        distribution[result.score]++;
      }
    });
    return distribution;
  }

  // Get review statistics for an anime
  async getReviewStats(animeName) {
    try {
      const db = getDb();
      const snapshot = await db.collection('questions')
        .where('animeName', '==', animeName)
        .get();

      const stats = {
        total: snapshot.size,
        reviewed: 0,
        unreviewed: 0,
        scoreDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        averageScore: 0
      };

      let totalScore = 0;
      let reviewedCount = 0;

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.reviewScore !== null && data.reviewScore !== undefined) {
          stats.reviewed++;
          reviewedCount++;
          totalScore += data.reviewScore;
          if (data.reviewScore >= 1 && data.reviewScore <= 5) {
            stats.scoreDistribution[data.reviewScore]++;
          }
        } else {
          stats.unreviewed++;
        }
      });

      if (reviewedCount > 0) {
        stats.averageScore = Math.round((totalScore / reviewedCount) * 100) / 100;
      }

      return stats;
      
    } catch (error) {
      console.error(`[SimpleReview] Error getting review stats:`, error.message);
      throw error;
    }
  }

  // Get questions by score for deletion preview
  async getQuestionsByScore(animeName, scores = [1, 2]) {
    try {
      const db = getDb();
      const snapshot = await db.collection('questions')
        .where('animeName', '==', animeName)
        .where('reviewScore', 'in', scores)
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error(`[SimpleReview] Error fetching questions by score:`, error.message);
      throw error;
    }
  }

  // Bulk delete questions
  async bulkDeleteQuestions(questionIds) {
    try {
      const db = getDb();
      const batch = db.batch();
      
      questionIds.forEach(questionId => {
        const questionRef = db.collection('questions').doc(questionId);
        batch.delete(questionRef);
      });
      
      await batch.commit();
      
      return {
        success: true,
        deletedCount: questionIds.length
      };
    } catch (error) {
      console.error(`[SimpleReview] Error deleting questions:`, error.message);
      throw error;
    }
  }
}

module.exports = new SimpleQuestionReviewService();