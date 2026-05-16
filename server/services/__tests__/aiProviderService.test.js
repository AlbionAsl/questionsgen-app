const geminiService = require('../geminiService');

jest.mock('../geminiService', () => ({
  generateQuestionsStructured: jest.fn(),
  generateQuestions: jest.fn(),
  getAvailableModels: jest.fn(() => [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini' },
    { id: 'gemini-flash-latest', name: 'Gemini 2.5 Flash', provider: 'gemini' },
  ]),
}));

jest.mock('../openaiService', () => ({
  createCompletion: jest.fn(),
}));

jest.mock('../../config/supabase', () => ({
  supabase: {},
}));

jest.mock('../modelConfigService', () => ({
  getModels: jest.fn(() => Promise.resolve([
    { id: '1', provider: 'gemini', display_name: 'Gemini 2.5 Pro', api_model_id: 'gemini-2.5-pro', sort_order: 0 },
    { id: '2', provider: 'gemini', display_name: 'Gemini 2.5 Flash', api_model_id: 'gemini-flash-latest', sort_order: 1 },
  ])),
}));

const aiProviderService = require('../aiProviderService');

const VALID_QUESTIONS_RESULT = {
  success: true,
  questions: [
    {
      question: 'What is the name of the main character?',
      options: ['Luffy', 'Zoro', 'Nami', 'Sanji'],
      correctAnswer: 0,
    },
  ],
};

describe('generateWithGemini', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    geminiService.generateQuestionsStructured.mockResolvedValue(VALID_QUESTIONS_RESULT);
  });

  it('uses generateQuestionsStructured for gemini-2.5-pro', async () => {
    const result = await aiProviderService.generateWithGemini(
      'test prompt',
      'gemini-2.5-pro',
      geminiService,
      {}
    );

    expect(geminiService.generateQuestionsStructured).toHaveBeenCalledWith('test prompt', 'gemini-2.5-pro');
    expect(geminiService.generateQuestions).not.toHaveBeenCalled();
    expect(result).toEqual(VALID_QUESTIONS_RESULT.questions);
  });

  it('uses generateQuestionsStructured for gemini-flash-latest', async () => {
    const result = await aiProviderService.generateWithGemini(
      'test prompt',
      'gemini-flash-latest',
      geminiService,
      {}
    );

    expect(geminiService.generateQuestionsStructured).toHaveBeenCalledWith('test prompt', 'gemini-flash-latest');
    expect(geminiService.generateQuestions).not.toHaveBeenCalled();
    expect(result).toEqual(VALID_QUESTIONS_RESULT.questions);
  });

  it('uses generateQuestionsStructured for any new gemini model', async () => {
    const result = await aiProviderService.generateWithGemini(
      'test prompt',
      'gemini-3.1-pro-preview',
      geminiService,
      {}
    );

    expect(geminiService.generateQuestionsStructured).toHaveBeenCalledWith('test prompt', 'gemini-3.1-pro-preview');
    expect(geminiService.generateQuestions).not.toHaveBeenCalled();
    expect(result).toEqual(VALID_QUESTIONS_RESULT.questions);
  });

  it('throws when structured output returns no questions', async () => {
    geminiService.generateQuestionsStructured.mockResolvedValue({
      success: false,
      questions: [],
    });

    await expect(
      aiProviderService.generateWithGemini('test prompt', 'gemini-2.5-pro', geminiService, {})
    ).rejects.toThrow('Gemini did not return valid questions');
  });

  it('does NOT fall back to generateQuestions when structured output throws for gemini-2.5-pro', async () => {
    geminiService.generateQuestionsStructured.mockRejectedValue(new Error('structured output failed'));

    await expect(
      aiProviderService.generateWithGemini('test prompt', 'gemini-2.5-pro', geminiService, {})
    ).rejects.toThrow();

    expect(geminiService.generateQuestions).not.toHaveBeenCalled();
  });
});
