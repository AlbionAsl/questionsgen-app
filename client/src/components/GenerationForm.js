import React, { useState, useEffect } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function GenerationForm({ onStart }) {
  const [formData, setFormData] = useState({
    animeName: '',
    fandomWikiName: '',
    categories: [],
    individualPages: [],
    maxApiCalls: 10,
    questionsPerChunk: 4,
    openaiModel: 'gpt-4o-mini',
    promptInstructions: 'Each question should have one correct answer and three incorrect but plausible options. Create challenging and fun questions. Try and be specific if you can. For example, mention names of characters, groups, or locations if you have this information. NEVER mention "according to the text" or something similar.'
  });

  const [animeSearchResults, setAnimeSearchResults] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [categorySearchResults, setCategorySearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchingAnime, setSearchingAnime] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [searchingCategories, setSearchingCategories] = useState(false);
  const [newPageInput, setNewPageInput] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [processingStats, setProcessingStats] = useState(null);

  // Available OpenAI models
  const openaiModels = [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast & Cost-effective)', description: 'Best for most use cases' },
    { value: 'gpt-4.1', label: 'GPT-4.1', description: 'Higher quality, slower' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1.mini', description: 'Faster 4.1' },
    { value: 'o4-mini', label: 'o4-mini', description: 'Reasoning monster' }
  ];

  // Prompt presets for different question styles
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

  // Common anime presets
  const animePresets = [
    { name: 'One Piece', wiki: 'onepiece' },
    { name: 'Naruto', wiki: 'naruto' },
    { name: 'Attack on Titan', wiki: 'attackontitan' },
    { name: 'My Hero Academia', wiki: 'myheroacademia' },
    { name: 'Demon Slayer', wiki: 'kimetsu-no-yaiba' },
    { name: 'Jujutsu Kaisen', wiki: 'jujutsu-kaisen' }
  ];

  useEffect(() => {
    if (formData.animeName.length > 2) {
      const timer = setTimeout(() => searchAnime(formData.animeName), 300);
      return () => clearTimeout(timer);
    }
  }, [formData.animeName]);

  useEffect(() => {
    if (formData.fandomWikiName) {
      fetchInitialCategories(formData.fandomWikiName);
      fetchProcessingStats(formData.fandomWikiName);
    }
  }, [formData.fandomWikiName]);

  useEffect(() => {
    if (categorySearchTerm.length >= 2 && formData.fandomWikiName) {
      const timer = setTimeout(() => searchCategories(categorySearchTerm), 300);
      return () => clearTimeout(timer);
    } else if (categorySearchTerm.length === 0) {
      setCategorySearchResults([]);
    }
  }, [categorySearchTerm, formData.fandomWikiName]);

  const searchAnime = async (term) => {
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
  };

  const fetchInitialCategories = async (wikiName) => {
    setLoadingCategories(true);
    try {
      const response = await fetch(`${API_URL}/api/generation/wiki/${wikiName}/categories?limit=200`);
      const data = await response.json();
      setAvailableCategories(data.categories || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoadingCategories(false);
    }
  };

  const searchCategories = async (term) => {
    setSearchingCategories(true);
    try {
      const response = await fetch(`${API_URL}/api/generation/wiki/${formData.fandomWikiName}/categories/search?q=${encodeURIComponent(term)}&limit=50`);
      const data = await response.json();
      setCategorySearchResults(data.categories || []);
    } catch (error) {
      console.error('Error searching categories:', error);
    } finally {
      setSearchingCategories(false);
    }
  };

  const fetchProcessingStats = async (wikiName) => {
    try {
      const response = await fetch(`${API_URL}/api/generation/wiki/${wikiName}/stats`);
      const data = await response.json();
      setProcessingStats(data);
    } catch (error) {
      console.error('Error fetching processing stats:', error);
    }
  };

  const handleSubmit = async () => {
    if (!formData.animeName || !formData.fandomWikiName) return;
    
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/generation/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
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

  const handleCategoryToggle = (category) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }));
  };

  const handleCategoryAdd = (category) => {
    if (!formData.categories.includes(category)) {
      setFormData(prev => ({
        ...prev,
        categories: [...prev.categories, category]
      }));
    }
    setCategorySearchTerm('');
    setShowCategoryDropdown(false);
  };

  const handleCategoryRemove = (category) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.filter(c => c !== category)
    }));
  };

  const handleIndividualPageAdd = () => {
    if (newPageInput && !formData.individualPages.includes(newPageInput)) {
      setFormData(prev => ({
        ...prev,
        individualPages: [...prev.individualPages, newPageInput]
      }));
      setNewPageInput('');
    }
  };

  const handlePromptPresetSelect = (preset) => {
    setFormData(prev => ({
      ...prev,
      promptInstructions: preset.value
    }));
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Generate New Questions</h2>

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
          {processingStats && processingStats.totalChunks > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <h4 className="text-sm font-medium text-blue-800 mb-2">📊 Previous Processing Stats</h4>
              <div className="text-sm text-blue-700">
                <p>Total chunks processed: <span className="font-semibold">{processingStats.totalChunks}</span></p>
                {processingStats.lastProcessed && (
                  <p>Last processed: <span className="font-semibold">{new Date(processingStats.lastProcessed).toLocaleDateString()}</span></p>
                )}
                <p className="mt-1 text-xs">Previously processed chunks will be automatically skipped.</p>
              </div>
            </div>
          )}

          {/* Enhanced Categories Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Categories</label>
            
            {/* Selected Categories Display */}
            {formData.categories.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-2">Selected categories ({formData.categories.length}):</p>
                <div className="flex flex-wrap gap-2">
                  {formData.categories.map((category) => (
                    <span
                      key={category}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                    >
                      {category}
                      <button
                        onClick={() => handleCategoryRemove(category)}
                        className="ml-2 text-blue-600 hover:text-blue-800 focus:outline-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Category Search */}
            <div className="relative mb-3">
              <input
                type="text"
                value={categorySearchTerm}
                onChange={(e) => {
                  setCategorySearchTerm(e.target.value);
                  setShowCategoryDropdown(true);
                }}
                onFocus={() => setShowCategoryDropdown(true)}
                placeholder="Search categories..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              {searchingCategories && (
                <div className="absolute right-2 top-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                </div>
              )}
              
              {/* Category Search Results Dropdown */}
              {showCategoryDropdown && categorySearchTerm.length >= 2 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {categorySearchResults.length > 0 ? (
                    categorySearchResults.map((category) => (
                      <button
                        key={category}
                        onClick={() => handleCategoryAdd(category)}
                        className={`w-full text-left px-4 py-2 hover:bg-gray-50 text-sm ${
                          formData.categories.includes(category) ? 'bg-blue-50 text-blue-700' : ''
                        }`}
                      >
                        {category}
                        {formData.categories.includes(category) && (
                          <span className="ml-2 text-blue-500">✓</span>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-2 text-sm text-gray-500">No categories found</div>
                  )}
                </div>
              )}
            </div>

            {/* Initial Categories (when not searching) */}
            {loadingCategories ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : availableCategories.length > 0 && categorySearchTerm.length < 2 ? (
              <div>
                <p className="text-xs text-gray-500 mb-2">Available categories (showing first 200):</p>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-3">
                  {availableCategories.slice(0, 50).map((category) => (
                    <label key={category} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.categories.includes(category)}
                        onChange={() => handleCategoryToggle(category)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700">{category}</span>
                    </label>
                  ))}
                  {availableCategories.length > 50 && (
                    <p className="text-xs text-gray-500 italic">
                      Showing 50 of {availableCategories.length} categories. Use search to find more.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Enter a wiki name to load categories</p>
            )}
          </div>

          {/* Individual Pages */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Individual Pages (Optional)</label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={newPageInput}
                onChange={(e) => setNewPageInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleIndividualPageAdd();
                  }
                }}
                placeholder="Add specific page titles..."
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2"
              />
              <button
                onClick={handleIndividualPageAdd}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm transition-colors"
              >
                Add
              </button>
            </div>
            {formData.individualPages.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {formData.individualPages.map((page, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800"
                  >
                    {page}
                    <button
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        individualPages: prev.individualPages.filter((_, i) => i !== index)
                      }))}
                      className="ml-2 text-green-600 hover:text-green-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* AI Configuration Section */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">🤖 AI Configuration</h3>
            
            {/* OpenAI Model Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">OpenAI Model</label>
              <div className="space-y-2">
                {openaiModels.map((model) => (
                  <label key={model.value} className="flex items-start">
                    <input
                      type="radio"
                      checked={formData.openaiModel === model.value}
                      onChange={() => setFormData({ ...formData, openaiModel: model.value })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 mt-1"
                    />
                    <div className="ml-3">
                      <span className="text-sm font-medium text-gray-700">{model.label}</span>
                      <p className="text-xs text-gray-500">{model.description}</p>
                    </div>
                  </label>
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
              <p className="mt-1 text-xs text-gray-500">
                Customize how the AI should generate questions. This affects question style, difficulty, and focus areas.
              </p>
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
                <p className="mt-1 text-xs text-gray-500">Limits OpenAI API usage</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Questions per Chunk</label>
                <input
                  type="number"
                  value={formData.questionsPerChunk}
                  onChange={(e) => setFormData({ ...formData, questionsPerChunk: parseInt(e.target.value) })}
                  min="1"
                  max="10"
                  className="mt-1 shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2"
                />
                <p className="mt-1 text-xs text-gray-500">Questions generated per text chunk</p>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div>
            <button
              onClick={handleSubmit}
              disabled={loading || !formData.animeName || !formData.fandomWikiName}
              className={`
                w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white transition-colors
                ${loading || !formData.animeName || !formData.fandomWikiName
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }
              `}
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                'Start Generation'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Click outside to close dropdown */}
      {showCategoryDropdown && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setShowCategoryDropdown(false)}
        />
      )}
    </div>
  );
}