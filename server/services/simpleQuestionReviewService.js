const { supabase } = require('../config/supabase');

class SimpleQuestionReviewService {
  constructor() {}

  async reviewQuestions(categoryId, batchSize = 10, model = 'gemini-flash-latest', socketEmitter = null, customPrompt = null) {
    console.log(`[SimpleReview] Starting review for category ${categoryId} with batch size ${batchSize}`);

    try {
      const unreviewed = await this.getUnreviewedQuestions(categoryId);

      if (unreviewed.length === 0) {
        return { success: true, message: 'No unreviewed questions found', totalProcessed: 0, results: [] };
      }

      console.log(`[SimpleReview] Found ${unreviewed.length} unreviewed questions`);

      const results = [];
      const totalBatches = Math.ceil(unreviewed.length / batchSize);

      for (let i = 0; i < unreviewed.length; i += batchSize) {
        const batch = unreviewed.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;

        console.log(`[SimpleReview] Processing batch ${batchNumber}/${totalBatches}`);

        if (socketEmitter) {
          socketEmitter('reviewProgress', {
            currentBatch: batchNumber,
            totalBatches,
            questionsInBatch: batch.length,
            totalProcessed: results.length,
          });
        }

        try {
          const scores = await this.getScoresFromAI(batch, model, categoryId, customPrompt);
          await this.updateQuestionsWithScores(batch, scores);

          batch.forEach((question, index) => {
            results.push({ questionId: question.id, question: question.question_text, score: scores[index] || 3 });
          });

          console.log(`[SimpleReview] Completed batch ${batchNumber}, scores: ${scores.join(', ')}`);
        } catch (error) {
          console.error(`[SimpleReview] Error in batch ${batchNumber}:`, error.message);
          const defaultScores = batch.map(() => 3);
          await this.updateQuestionsWithScores(batch, defaultScores);
          batch.forEach(question => {
            results.push({ questionId: question.id, question: question.question_text, score: 3 });
          });
        }
      }

      return {
        success: true,
        totalProcessed: results.length,
        results,
        scoreDistribution: this.calculateScoreDistribution(results),
      };
    } catch (error) {
      console.error(`[SimpleReview] Failed:`, error.message);
      throw error;
    }
  }

  async getUnreviewedQuestions(categoryId) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, question_text, options, correct_answer, review_score')
      .eq('category_id', parseInt(categoryId))
      .is('review_score', null);

    if (error) throw error;
    return data || [];
  }

  async getScoresFromAI(questions, model, categoryId, customPrompt = null) {
    console.log(`[SimpleReview] Getting scores from AI for ${questions.length} questions using ${model}`);

    const prompt = customPrompt
      ? this.buildCustomPrompt(questions, categoryId, customPrompt)
      : this.buildScoreOnlyPrompt(questions, categoryId);

    try {
      if (model.includes('gemini')) {
        return await this.getScoresFromGemini(prompt, model, questions.length);
      } else {
        return await this.getScoresFromOpenAI(prompt, model, questions.length);
      }
    } catch (error) {
      console.error(`[SimpleReview] AI scoring failed:`, error.message);
      return questions.map(() => 3);
    }
  }

  buildCustomPrompt(questions, categoryId, customPrompt) {
    const questionsText = questions.map((q, index) => {
      const optionsText = q.options.map((option, i) => `${String.fromCharCode(65 + i)}. ${option}`).join('\n');
      const correctLetter = String.fromCharCode(65 + q.correct_answer);
      return `Question ${index + 1}:\n${q.question_text}\n${optionsText}\nCorrect Answer: ${correctLetter}`;
    }).join('\n\n');

    return customPrompt
      .replace(/\{count\}/g, questions.length.toString())
      .replace(/\{animeName\}/g, `Category ${categoryId}`)
      .replace(/\{questions\}/g, questionsText);
  }

  buildScoreOnlyPrompt(questions, categoryId) {
    const questionsText = questions.map((q, index) => {
      const optionsText = q.options.map((option, i) => `${String.fromCharCode(65 + i)}. ${option}`).join('\n');
      const correctLetter = String.fromCharCode(65 + q.correct_answer);
      return `Question ${index + 1}:\n${q.question_text}\n${optionsText}\nCorrect Answer: ${correctLetter}`;
    }).join('\n\n');

    return `Rate these ${questions.length} manga quiz questions on a scale of 1-5:

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

  async getScoresFromGemini(prompt, model, expectedCount) {
    try {
      const { GoogleGenAI } = require('@google/genai');
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

      const response = await genAI.models.generateContent({
        model,
        contents: prompt,
        config: { temperature: 0.3 },
      });

      return this.parseScoreArray(response.text || '', expectedCount);
    } catch (error) {
      console.error(`[SimpleReview] Gemini error:`, error.message);
      return Array(expectedCount).fill(3);
    }
  }

  async getScoresFromOpenAI(prompt, model, expectedCount) {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'You are a quiz quality expert. Respond only with a JSON array of integer scores from 1-5.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 10000,
      });

      return this.parseScoreArray(response.choices[0].message.content, expectedCount);
    } catch (error) {
      console.error(`[SimpleReview] OpenAI error:`, error.message);
      return Array(expectedCount).fill(3);
    }
  }

  parseScoreArray(responseText, expectedCount) {
    try {
      const jsonMatch = responseText.match(/\[[\d\s,]+\]/);
      if (!jsonMatch) return Array(expectedCount).fill(3);

      const scores = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(scores)) return Array(expectedCount).fill(3);

      const validScores = scores
        .map(s => Math.max(1, Math.min(5, Math.round(Number(s)) || 3)))
        .slice(0, expectedCount);

      while (validScores.length < expectedCount) validScores.push(3);
      return validScores;
    } catch {
      return Array(expectedCount).fill(3);
    }
  }

  async updateQuestionsWithScores(questions, scores) {
    await Promise.all(
      questions.map((question, index) =>
        supabase
          .from('questions')
          .update({
            review_score: scores[index] || 3,
            updated_at: new Date().toISOString(),
          })
          .eq('id', question.id)
      )
    );
    console.log(`[SimpleReview] Updated ${questions.length} questions with scores`);
  }

  calculateScoreDistribution(results) {
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    results.forEach(r => {
      if (r.score >= 1 && r.score <= 5) distribution[r.score]++;
    });
    return distribution;
  }

  async getReviewStats(categoryId) {
    const { data, error } = await supabase
      .from('questions')
      .select('review_score')
      .eq('category_id', parseInt(categoryId));

    if (error) throw error;

    const stats = {
      total: data.length,
      reviewed: 0,
      unreviewed: 0,
      scoreDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      averageScore: 0,
    };

    let totalScore = 0;
    data.forEach(q => {
      if (q.review_score !== null && q.review_score !== undefined) {
        stats.reviewed++;
        totalScore += q.review_score;
        if (q.review_score >= 1 && q.review_score <= 5) stats.scoreDistribution[q.review_score]++;
      } else {
        stats.unreviewed++;
      }
    });

    if (stats.reviewed > 0) {
      stats.averageScore = Math.round((totalScore / stats.reviewed) * 100) / 100;
    }

    return stats;
  }

  async getQuestionsByScore(categoryId, scores = [1, 2]) {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('category_id', parseInt(categoryId))
      .in('review_score', scores);

    if (error) throw error;
    return data || [];
  }

  async bulkDeleteQuestions(questionIds) {
    const { error } = await supabase
      .from('questions')
      .delete()
      .in('id', questionIds);

    if (error) throw error;
    return { success: true, deletedCount: questionIds.length };
  }
}

module.exports = new SimpleQuestionReviewService();
