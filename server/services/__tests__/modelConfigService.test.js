jest.mock('../../config/supabase', () => {
  const mockSupabase = {
    from: jest.fn(),
  };
  return { supabase: mockSupabase };
});

const { supabase } = require('../../config/supabase');
const modelConfigService = require('../modelConfigService');

const DEFAULT_MODELS = [
  { provider: 'openai', display_name: 'GPT-5.5', api_model_id: 'gpt-5.5', sort_order: 0 },
  { provider: 'openai', display_name: 'GPT-5.4', api_model_id: 'gpt-5.4', sort_order: 1 },
  { provider: 'gemini', display_name: 'Gemini 2.5 Pro', api_model_id: 'gemini-2.5-pro', sort_order: 2 },
  { provider: 'gemini', display_name: 'Gemini 2.5 Flash', api_model_id: 'gemini-flash-latest', sort_order: 3 },
  { provider: 'gemini', display_name: 'Gemini 3.1 Pro', api_model_id: 'gemini-3.1-pro-preview', sort_order: 4 },
];

function mockChain(returnValue) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(returnValue),
  };
  chain.select.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  chain.delete.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockResolvedValue(returnValue);
  chain.single.mockResolvedValue(returnValue);
  return chain;
}

describe('ModelConfigService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getModels', () => {
    it('returns models ordered by sort_order', async () => {
      const models = [
        { id: '1', provider: 'openai', display_name: 'GPT-5.5', api_model_id: 'gpt-5.5', sort_order: 0 },
        { id: '2', provider: 'gemini', display_name: 'Gemini 2.5 Pro', api_model_id: 'gemini-2.5-pro', sort_order: 1 },
      ];
      const chain = mockChain({ data: models, error: null });
      supabase.from.mockReturnValue(chain);

      const result = await modelConfigService.getModels();

      expect(supabase.from).toHaveBeenCalledWith('model_config');
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.order).toHaveBeenCalledWith('sort_order', { ascending: true });
      expect(result).toEqual(models);
    });
  });

  describe('addModel', () => {
    it('assigns the next available sort_order and returns the new model', async () => {
      const newModel = { provider: 'openai', display_name: 'GPT-6', api_model_id: 'gpt-6' };
      const existingModels = [
        { sort_order: 0 },
        { sort_order: 1 },
        { sort_order: 2 },
      ];
      const insertedModel = { id: 'new-uuid', ...newModel, sort_order: 3 };

      const selectChain = mockChain({ data: existingModels, error: null });
      const insertChain = mockChain({ data: [insertedModel], error: null });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return insertChain;
      });
      insertChain.insert.mockReturnValue(insertChain);
      insertChain.select.mockResolvedValue({ data: [insertedModel], error: null });

      const result = await modelConfigService.addModel(newModel);

      expect(result).toEqual(insertedModel);
    });

    it('rejects a model with a duplicate api_model_id', async () => {
      const newModel = { provider: 'openai', display_name: 'Dupe', api_model_id: 'gpt-5.5' };

      const selectChain = mockChain({ data: [{ sort_order: 0 }], error: null });
      const insertChain = mockChain({ data: null, error: { code: '23505', message: 'duplicate key' } });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return insertChain;
      });
      insertChain.insert.mockReturnValue(insertChain);
      insertChain.select.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } });

      await expect(modelConfigService.addModel(newModel)).rejects.toThrow();
    });
  });

  describe('removeModel', () => {
    it('deletes the specified model', async () => {
      const chain = mockChain({ data: null, error: null });
      supabase.from.mockReturnValue(chain);
      chain.delete.mockReturnValue(chain);
      chain.eq.mockResolvedValue({ data: null, error: null });

      await modelConfigService.removeModel('some-uuid');

      expect(supabase.from).toHaveBeenCalledWith('model_config');
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('id', 'some-uuid');
    });
  });

  describe('reorderModels', () => {
    it('updates sort_order to match the provided ID order', async () => {
      const orderedIds = ['id-c', 'id-a', 'id-b'];
      const chain = mockChain({ data: null, error: null });
      supabase.from.mockReturnValue(chain);
      chain.update.mockReturnValue(chain);
      chain.eq.mockResolvedValue({ data: null, error: null });

      await modelConfigService.reorderModels(orderedIds);

      expect(supabase.from).toHaveBeenCalledWith('model_config');
      expect(chain.update).toHaveBeenCalledWith({ sort_order: 0 });
      expect(chain.update).toHaveBeenCalledWith({ sort_order: 1 });
      expect(chain.update).toHaveBeenCalledWith({ sort_order: 2 });
    });
  });

  describe('seedDefaults', () => {
    it('populates the table with 5 models when the table is empty', async () => {
      const selectChain = mockChain({ data: [], error: null });
      const insertChain = mockChain({ data: DEFAULT_MODELS, error: null });

      let callCount = 0;
      supabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return insertChain;
      });

      await modelConfigService.seedDefaults();

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ api_model_id: 'gpt-5.5', sort_order: 0 }),
          expect.objectContaining({ api_model_id: 'gemini-3.1-pro-preview', sort_order: 4 }),
        ])
      );
    });

    it('is a no-op when models already exist in the table', async () => {
      const selectChain = mockChain({ data: [{ id: '1' }], error: null });
      supabase.from.mockReturnValue(selectChain);

      await modelConfigService.seedDefaults();

      expect(supabase.from).toHaveBeenCalledTimes(1);
    });
  });
});
