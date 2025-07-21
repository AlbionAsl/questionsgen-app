import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function PopularPages({ onStart }) {
  const [formData, setFormData] = useState({
    animeName: '',
    fandomWikiName: '',
    selectedPages: [],
    maxApiCalls: 10,
    questionsPerChunk: 4,
    openaiModel: 'gpt-4o-mini',
    promptInstructions: 'Each question should have one correct answer and three incorrect but plausible options. Create challenging and fun questions. Try and be specific if you can. For example, mention names of characters, groups, or locations if you have this information. NEVER mention "according to the text" or something similar.'
  });

  const [animeSearchResults, setAnimeSearchResults] = useState([]);
  const [popularPages, setPopularPages] = useState([]);
  const [filteredPages, setFilteredPages] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);
  const [error, setError] = useState('');
  const [searchingAnime, setSearchingAnime] = useState(false);
  const [processingStats, setProcessingStats] = useState(null);
  const [availableModels, setAvailableModels] = useState([]);
  const [aiProviderStats, setAiProviderStats] = useState(null);

  // Default models - will be replaced by dynamic loading
  const defaultModels = [
    { 
      id: 'gpt-4o-mini', 
      name: 'GPT-4o Mini', 
      description: 'Fast & Cost-effective (Best for most use cases)', 
      provider: 'openai',
      category: 'OpenAI Models'
    },
    { 
      id: 'gpt-4.1', 
      name: 'GPT-4.1', 
      description: 'Higher quality, slower', 
      provider: 'openai',
      category: 'OpenAI Models'
    },
    { 
      id: 'gpt-4.1-mini', 
      name: 'GPT-4.1 Mini', 
      description: 'Faster 4.1', 
      provider: 'openai',
      category: 'OpenAI Models'
    },
    { 
      id: 'o4-mini', 
      name: 'o4-mini', 
      description: 'Reasoning monster', 
      provider: 'openai',
      category: 'OpenAI Models'
    },
    { 
      id: 'gemini-2.5-pro', 
      name: 'Gemini 2.5 Pro', 
      description: 'Most capable Google model, higher quality but slower', 
      provider: 'gemini',
      category: 'Google Gemini Models'
    },
    { 
      id: 'gemini-2.5-flash', 
      name: 'Gemini 2.5 Flash', 
      description: 'Fast and efficient Google model, good for most use cases', 
      provider: 'gemini',
      category: 'Google Gemini Models'
    }
  ];

  // Common anime presets
  const animePresets = [
    { name: 'One Piece', wiki: 'onepiece' },
    { name: 'Naruto', wiki: 'naruto' },
    { name: 'Attack on Titan', wiki: 'attackontitan' },
    { name: 'My Hero Academia', wiki: 'myheroacademia' },
    { name: 'Demon Slayer', wiki: 'kimetsu-no-yaiba' },
    { name: 'Jujutsu Kaisen', wiki: 'jujutsu-kaisen' }
  ];

  // Prompt presets
  const promptPresets = [
    {
      name: 'Challenging & Specific (Default)',
      value: 'Each question should have one correct answer and three incorrect but plausible options. Create challenging and fun questions. Try and be specific if you can. For example, mention names of characters, groups, or locations if you have this information. NEVER mention "according to the text" or something similar.'
    },
    {
      name: 'Trivia Style',
      value: 'Generate trivia-style questions with one correct answer and three plausible incorrect options. Focus on memorable details, character names, abilities, and plot points. Make the questions engaging for anime fans.'
    },
    {
      name: 'Character Focused',
      value: 'Create questions that focus on character details, relationships, abilities, and development. Include specific character names and traits. Make incorrect options believable but clearly wrong.'
    },
    {
      name: 'Plot & Events',
      value: 'Generate questions about plot events, story arcs, battles, and key moments. Focus on what happened, when, and why. Include specific details about locations and circumstances.'
    },
    {
      name: 'Technical Details',
      value: 'Create detailed questions about abilities, techniques, power systems, and world-building elements. Focus on specific mechanics and technical aspects of the anime universe.'
    }
  ];

  // Memoized functions to avoid ESLint warnings
  const fetchAvailableModels = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/ai/models`);
      const data = await response.json();
      if (data.success) {
        setAvailableModels(data.models || defaultModels);
      } else {
        setAvailableModels(defaultModels);
      }
    } catch (error) {
      console.error('Error fetching available models:', error);
      setAvailableModels(defaultModels);
    }
  }, [defaultModels]);

  const fetchAIProviderStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/ai/providers/stats`);
      const data = await response.json();
      setAiProviderStats(data);
    } catch (error) {
      console.error('Error fetching AI provider stats:', error);
    }
  }, []);

  const searchAnime = useCallback(async (term) => {
    setSearchingAnime(true);
    try {
      const response = await fetch(`${API_URL}/api/generation/anime/search/${encodeURIComponent(term)}`);
      const data = await response.json();
      setAnimeSearchResults(data);
    } catch (error) {
      console.error('Error searching anime:', error);
    } finally {
      setSearchingAnime(false);
    }
  }, []);

  const fetchPopularPages = useCallback(async (wikiName) => {
    setLoadingPages(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/generation/wiki/${wikiName}/popular-pages`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch popular pages');
      }
      
      setPopularPages(data.pages || []);
      setFilteredPages(data.pages || []);
    } catch (error) {
      console.error('Error fetching popular pages:', error);
      setError(error.message);
      setPopularPages([]);
      setFilteredPages([]);
    } finally {
      setLoadingPages(false);
    }
  }, []);

  const fetchProcessingStats = useCallback(async (wikiName) => {
    try {
      const response = await fetch(`${API_URL}/api/generation/wiki/${wikiName}/stats`);
      const data = await response.json();
      setProcessingStats(data);
    } catch (error) {
      console.error('Error fetching processing stats:', error);
    }
  }, []);

  // Effects with proper dependencies
  useEffect(() => {
    fetchAvailableModels();
    fetchAIProviderStats();
  }, [fetchAvailableModels, fetchAIProviderStats]);

  useEffect(() => {
    if (formData.animeName.length > 2) {
      const timer = setTimeout(() => searchAnime(formData.animeName), 300);
      return () => clearTimeout(timer);
    }
  }, [formData.animeName, searchAnime]);

  useEffect(() => {
    if (formData.fandomWikiName) {
      fetchPopularPages(formData.fandomWikiName);
      fetchProcessingStats(formData.fandomWikiName);
    }
  }, [formData.fandomWikiName, fetchPopularPages, fetchProcessingStats]);

  useEffect(() => {
    if (searchTerm) {
      const filtered = popularPages.filter(page => 
        page.title.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredPages(filtered);
    } else {
      setFilteredPages(popularPages);
    }
  }, [searchTerm, popularPages]);

  const handlePageToggle = (pageTitle) => {
    setFormData(prev => ({
      ...prev,
      selectedPages: prev.selectedPages.includes(pageTitle)
        ? prev.selectedPages.filter(p => p !== pageTitle)
        : [...prev.selectedPages, pageTitle]
    }));
  };

  const handlePageRemove = (pageTitle) => {
    setFormData(prev => ({
      ...prev,
      selectedPages: prev.selectedPages.filter(p => p !== pageTitle)
    }));
  };

  const handleSelectAll = () => {
    setFormData(prev => ({
      ...prev,
      selectedPages: filteredPages.map(page => page.title)
    }));
  };

  const handleDeselectAll = () => {
    setFormData(prev => ({
      ...prev,
      selectedPages: []
    }));
  };

  const handleSubmit = async () => {
    if (!formData.animeName || !formData.fandomWikiName || formData.selectedPages.length === 0) {
      setError('Please select anime, wiki, and at least one page');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/generation/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          categories: [], // No categories for popular pages
          individualPages: formData.selectedPages // Use selected pages as individual pages
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start generation');
      }

      onStart(data.processId);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePromptPresetSelect = (preset) => {
    setFormData(prev => ({
      ...prev,
      promptInstructions: preset.value
    }));
  };

  // Group models by provider
  const groupedModels = availableModels.reduce((groups, model) => {
    const category = model.category || (model.provider === 'openai' ? 'OpenAI Models' : 'Google Gemini Models');
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(model);
    return groups;
  }, {});

  // Check if a provider is available
  const isProviderAvailable = (provider) => {
    return aiProviderStats?.[provider]?.available ?? true; // Default to available if stats not loaded
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Generate from Popular Pages</h2>
        <p className="text-gray-600 mb-6">
          Generate questions from the most revised (and likely most popular) pages on the wiki using advanced AI models.
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Anime Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Anime Name</label>
            <div className="mt-1 relative">
              <input
                type="text"
                value={formData.animeName}
                onChange={(e) => setFormData({ ...formData, animeName: e.target.value })}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2"
                placeholder="Search for an anime..."
              />
              {searchingAnime && (
                <div className="absolute right-2 top-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                </div>
              )}
            </div>

            {/* Anime Presets */}
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1">Quick select:</p>
              <div className="flex flex-wrap gap-2">
                {animePresets.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => setFormData({
                      ...formData,
                      animeName: preset.name,
                      fandomWikiName: preset.wiki
                    })}
                    className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Results */}
            {animeSearchResults.length > 0 && (
              <div className="mt-2 border border-gray-200 rounded-md shadow-sm max-h-48 overflow-y-auto">
                {animeSearchResults.map((anime) => (
                  <button
                    key={anime.id}
                    onClick={() => setFormData({ ...formData, animeName: anime.title.romaji || anime.title.english })}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center space-x-3"
                  >
                    {anime.coverImage && (
                      <img src={anime.coverImage.medium} alt="" className="w-10 h-14 object-cover rounded" />
                    )}
                    <div>
                      <div className="font-medium">{anime.title.romaji}</div>
                      {anime.title.english && (
                        <div className="text-sm text-gray-500">{anime.title.english}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fandom Wiki Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Fandom Wiki Name</label>
            <input
              type="text"
              value={formData.fandomWikiName}
              onChange={(e) => setFormData({ ...formData, fandomWikiName: e.target.value })}
              className="mt-1 shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2"
              placeholder="e.g., onepiece, naruto, attackontitan"
            />
            <p className="mt-1 text-xs text-gray-500">
              The subdomain of the Fandom wiki (e.g., for https://naruto.fandom.com, enter "naruto")
            </p>
          </div>

          {/* Processing Stats */}
          {processingStats && (processingStats.totalChunks > 0 || processingStats.totalSections > 0) && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <h4 className="text-sm font-medium text-blue-800 mb-2">📊 Previous Processing Stats</h4>
              <div className="text-sm text-blue-700">
                {processingStats.totalSections > 0 && (
                  <p>Sections processed: <span className="font-semibold">{processingStats.totalSections}</span></p>
                )}
                {processingStats.totalChunks > 0 && (
                  <p>Legacy chunks processed: <span className="font-semibold">{processingStats.totalChunks}</span></p>
                )}
                {processingStats.lastProcessed && (
                  <p>Last processed: <span className="font-semibold">{new Date(processingStats.lastProcessed).toLocaleDateString()}</span></p>
                )}
                <p className="mt-1 text-xs">Previously processed content will be automatically skipped.</p>
              </div>
            </div>
          )}

          {/* Popular Pages Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="block text-sm font-medium text-gray-700">
                Popular Pages ({formData.selectedPages.length} selected)
              </label>
              <div className="flex space-x-2">
                <button
                  onClick={handleSelectAll}
                  disabled={filteredPages.length === 0}
                  className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                >
                  Select All
                </button>
                <button
                  onClick={handleDeselectAll}
                  disabled={formData.selectedPages.length === 0}
                  className="text-sm text-red-600 hover:text-red-800 disabled:text-gray-400"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Selected Pages Display */}
            {formData.selectedPages.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">Selected pages:</p>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {formData.selectedPages.map((pageTitle) => (
                    <span
                      key={pageTitle}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                    >
                      {pageTitle}
                      <button
                        onClick={() => handlePageRemove(pageTitle)}
                        className="ml-2 text-blue-600 hover:text-blue-800 focus:outline-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Search Pages */}
            {popularPages.length > 0 && (
              <div className="mb-4">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search pages..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            )}

            {/* Pages List */}
            {loadingPages ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-600">Loading popular pages...</span>
              </div>
            ) : filteredPages.length > 0 ? (
              <div className="border border-gray-200 rounded-md max-h-96 overflow-y-auto">
                <div className="divide-y divide-gray-200">
                  {filteredPages.map((page) => (
                    <label
                      key={page.title}
                      className="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={formData.selectedPages.includes(page.title)}
                        onChange={() => handlePageToggle(page.title)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div className="ml-3 flex-1">
                        <div className="text-sm font-medium text-gray-900">{page.title}</div>
                        <div className="text-xs text-gray-500">
                          {page.revisions} revisions
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ) : formData.fandomWikiName && !loadingPages ? (
              <div className="text-center py-8 text-gray-500">
                {error ? 'Failed to load popular pages' : 'No popular pages found'}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Enter a wiki name to load popular pages
              </div>
            )}
          </div>

          {/* Enhanced AI Configuration */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">🤖 AI Configuration</h3>
            
            {/* AI Provider Status */}
            {aiProviderStats && (
              <div className="mb-4 p-3 bg-gray-50 rounded-md">
                <p className="text-xs text-gray-600 mb-2">Provider Status:</p>
                <div className="flex items-center space-x-4 text-xs">
                  <div className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-2 ${isProviderAvailable('openai') ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span>OpenAI ({aiProviderStats.openai?.models || 0} models)</span>
                  </div>
                  <div className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-2 ${isProviderAvailable('gemini') ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span>Google Gemini ({aiProviderStats.gemini?.models || 0} models)</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* AI Model Selection - Now grouped by provider */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">AI Model</label>
              <div className="space-y-4">
                {Object.entries(groupedModels).map(([category, models]) => (
                  <div key={category}>
                    <h4 className="text-sm font-medium text-gray-600 mb-2 flex items-center">
                      {category.includes('OpenAI') ? '🔵' : '🟢'} {category}
                      {!isProviderAvailable(models[0]?.provider) && (
                        <span className="ml-2 text-xs text-red-500">(API key not configured)</span>
                      )}
                    </h4>
                    <div className="space-y-2 ml-4">
                      {models.map((model) => (
                        <label key={model.id} className="flex items-start">
                          <input
                            type="radio"
                            checked={formData.openaiModel === model.id}
                            onChange={() => setFormData({ ...formData, openaiModel: model.id })}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 mt-1"
                            disabled={!isProviderAvailable(model.provider)}
                          />
                          <div className="ml-3">
                            <span className={`text-sm font-medium ${!isProviderAvailable(model.provider) ? 'text-gray-400' : 'text-gray-700'}`}>
                              {model.name}
                            </span>
                            <p className={`text-xs ${!isProviderAvailable(model.provider) ? 'text-gray-400' : 'text-gray-500'}`}>
                              {model.description}
                              {model.provider === 'gemini' && isProviderAvailable('gemini') && (
                                <span className="ml-2 text-green-600 font-medium">✨ New!</span>
                              )}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Prompt Instructions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Question Generation Instructions</label>
              
              {/* Prompt Presets */}
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-2">Quick presets:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {promptPresets.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => handlePromptPresetSelect(preset)}
                      className={`p-2 text-xs border rounded-md text-left transition-colors ${
                        formData.promptInstructions === preset.value
                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Prompt Textarea */}
              <textarea
                value={formData.promptInstructions}
                onChange={(e) => setFormData({ ...formData, promptInstructions: e.target.value })}
                rows={4}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2"
                placeholder="Describe how you want the AI to generate questions..."
              />
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">⚙️ Advanced Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Max API Calls</label>
                <input
                  type="number"
                  value={formData.maxApiCalls}
                  onChange={(e) => setFormData({ ...formData, maxApiCalls: parseInt(e.target.value) })}
                  min="1"
                  max="100"
                  className="mt-1 shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2"
                />
                <p className="mt-1 text-xs text-gray-500">Limits AI API usage</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Questions per Section</label>
                <input
                  type="number"
                  value={formData.questionsPerChunk}
                  onChange={(e) => setFormData({ ...formData, questionsPerChunk: parseInt(e.target.value) })}
                  min="1"
                  max="20"
                  className="mt-1 shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2"
                />
                <p className="mt-1 text-xs text-gray-500">Base multiplier (actual questions = words ÷ 100)</p>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div>
            <button
              onClick={handleSubmit}
              disabled={loading || !formData.animeName || !formData.fandomWikiName || formData.selectedPages.length === 0}
              className={`
                w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white transition-colors
                ${loading || !formData.animeName || !formData.fandomWikiName || formData.selectedPages.length === 0
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }
              `}
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                `Generate Questions from ${formData.selectedPages.length} Selected Pages`
              )}
            </button>
            
            {/* Model info display */}
            {formData.openaiModel && (
              <div className="mt-2 text-center">
                <p className="text-xs text-gray-500">
                  Using: {availableModels.find(m => m.id === formData.openaiModel)?.name || formData.openaiModel}
                  {availableModels.find(m => m.id === formData.openaiModel)?.provider === 'gemini' && (
                    <span className="ml-1 text-green-600">✨ Google Gemini</span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}