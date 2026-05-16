const { z } = require('zod');
const aiProviderService = require('./aiProviderService.js');
const { supabase } = require('../config/supabase');

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

    if (!content || content.trim().length === 0) {
      throw new Error('Cannot generate questions from empty content');
    }

    if (content.length > 15000) {
      console.warn(`[Questions] Content is very large (${content.length} chars), truncating to 15000`);
      content = content.substring(0, 15000);
    }

    const defaultInstructions = 'Each question should have one correct answer and three incorrect but plausible options. Create challenging and fun questions. Try and be specific if you can. For example, mention names of characters, groups, or locations if you have this information. NEVER mention "according to the text" or something similar.';
    const promptInstructions = options.promptInstructions || defaultInstructions;

    const prompt = this.buildImprovedPrompt({
      content,
      animeName,
      pageTitle,
      sectionTitle: options.sectionTitle,
      category,
      promptInstructions,
      amountOfQuestions
    });

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

      if (error.message.includes('timeout') || error.message.includes('timed out')) {
        throw new Error(`Question generation timed out after ${duration}ms`);
      }

      throw new Error(`Question generation failed: ${error.message}`);
    }
  }

  async getAvailableModels() {
    return await aiProviderService.getAllAvailableModels();
  }

  async testAIConnections() {
    return await aiProviderService.testAllConnections();
  }

  async getAIProviderStats() {
    return await aiProviderService.getProviderStats();
  }

  buildImprovedPrompt({ content, animeName, pageTitle, sectionTitle, category, promptInstructions, amountOfQuestions }) {
    console.log(`[Questions] Building improved prompt structure...`);

    const cleanContent = content
      .replace(/<FANDOM WIKI TEXT>/gi, '[FANDOM WIKI TEXT]')
      .replace(/<\/FANDOM WIKI TEXT>/gi, '[/FANDOM WIKI TEXT]')
      .trim();

    let referenceInfo = `For reference, this piece of text is about the Anime: '${animeName}' with page title '${pageTitle}'`;

    if (sectionTitle) {
      referenceInfo += ` (and section: '${sectionTitle}')`;
    }

    if (category && category !== 'Individual' && category !== pageTitle) {
      referenceInfo += ` from category: '${category}'`;
    }

    const prompt = `<FANDOM WIKI TEXT>

${cleanContent}

</FANDOM WIKI TEXT>

${referenceInfo}

${promptInstructions}

Generate ${amountOfQuestions} multiple-choice questions based on the 'FANDOM WIKI TEXT'.`;

    console.log(`[Questions] Prompt preview: ${prompt.substring(0, 500)}...`);
    console.log(`[Questions] Total prompt length: ${prompt.length} characters`);

    return prompt;
  }

  async writeQuestionsToSupabase(questions, categoryId, metadata = {}) {
    const startTime = Date.now();
    console.log(`[Questions] Writing ${questions.length} questions to Supabase...`);

    if (!questions || questions.length === 0) {
      console.warn('[Questions] No questions to write');
      return 0;
    }

    const rows = questions.map(q => {
      let options = q.options;
      if (!Array.isArray(options)) {
        options = Object.values(options);
      }

      const pageTitle = metadata.pageTitle || '';
      const fandomWikiName = metadata.fandomWikiName || '';

      return {
        category_id: categoryId,
        question_text: q.question,
        options: options,
        correct_answer: q.correctAnswer,
        is_manga_spoiler: false,
        source_url: fandomWikiName && pageTitle
          ? `https://${fandomWikiName}.fandom.com/wiki/${encodeURIComponent(pageTitle)}`
          : null,
        source_context: metadata.sectionContent
          ? metadata.sectionContent.substring(0, 2000)
          : null,
        review_score: null,
        status: 'approved',
      };
    });

    const { data, error } = await supabase
      .from('questions')
      .insert(rows)
      .select('id');

    if (error) {
      console.error('[Questions] Supabase insert error:', error.message);
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[Questions] Successfully wrote ${data.length} questions in ${duration}ms`);
    return data.length;
  }

  async getQuestions(filters = {}) {
    let query = supabase
      .from('questions')
      .select('*, categories(name, slug)')
      .order('created_at', { ascending: false });

    if (filters.categoryId) {
      query = query.eq('category_id', parseInt(filters.categoryId));
    }

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const limit = parseInt(filters.limit) || 50;
    query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }

  async getQuestionStats() {
    const { data, error } = await supabase
      .from('questions')
      .select('category_id, status, review_score, categories(name)');

    if (error) throw new Error(error.message);

    const stats = {
      total: data.length,
      byCategory: {},
      byStatus: { approved: 0, unrated: 0, rejected: 0 },
      byReviewScore: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, unreviewed: 0 },
    };

    data.forEach(q => {
      const categoryName = q.categories?.name || `Category ${q.category_id}`;
      stats.byCategory[categoryName] = (stats.byCategory[categoryName] || 0) + 1;

      if (q.status && stats.byStatus[q.status] !== undefined) {
        stats.byStatus[q.status]++;
      }

      if (q.review_score) {
        stats.byReviewScore[q.review_score]++;
      } else {
        stats.byReviewScore.unreviewed++;
      }
    });

    return stats;
  }
}

module.exports = new QuestionService();
