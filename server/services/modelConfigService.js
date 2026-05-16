const { supabase } = require('../config/supabase');

const TABLE = 'model_config';

const DEFAULT_MODELS = [
  { provider: 'openai', display_name: 'GPT-5.5', api_model_id: 'gpt-5.5', sort_order: 0 },
  { provider: 'openai', display_name: 'GPT-5.4', api_model_id: 'gpt-5.4', sort_order: 1 },
  { provider: 'gemini', display_name: 'Gemini 2.5 Pro', api_model_id: 'gemini-2.5-pro', sort_order: 2 },
  { provider: 'gemini', display_name: 'Gemini 2.5 Flash', api_model_id: 'gemini-flash-latest', sort_order: 3 },
  { provider: 'gemini', display_name: 'Gemini 3.1 Pro', api_model_id: 'gemini-3.1-pro-preview', sort_order: 4 },
];

class ModelConfigService {
  async getModels() {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw new Error(`Failed to fetch models: ${error.message}`);
    return data;
  }

  async addModel({ provider, display_name, api_model_id }) {
    const { data: existing, error: fetchError } = await supabase
      .from(TABLE)
      .select('*')
      .order('sort_order', { ascending: true });

    if (fetchError) throw new Error(`Failed to fetch models: ${fetchError.message}`);

    const nextSortOrder = existing.length > 0
      ? Math.max(...existing.map(m => m.sort_order)) + 1
      : 0;

    const { data, error } = await supabase
      .from(TABLE)
      .insert({ provider, display_name, api_model_id, sort_order: nextSortOrder })
      .select();

    if (error) throw new Error(`Failed to add model: ${error.message}`);
    return data[0];
  }

  async removeModel(id) {
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to remove model: ${error.message}`);
  }

  async reorderModels(orderedIds) {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase
        .from(TABLE)
        .update({ sort_order: i })
        .eq('id', orderedIds[i]);

      if (error) throw new Error(`Failed to reorder models: ${error.message}`);
    }
  }

  async seedDefaults() {
    const { data: existing, error: fetchError } = await supabase
      .from(TABLE)
      .select('*')
      .order('sort_order', { ascending: true });

    if (fetchError) throw new Error(`Failed to check existing models: ${fetchError.message}`);

    if (existing.length > 0) return;

    const { error } = await supabase
      .from(TABLE)
      .insert(DEFAULT_MODELS);

    if (error) throw new Error(`Failed to seed defaults: ${error.message}`);
  }
}

module.exports = new ModelConfigService();
