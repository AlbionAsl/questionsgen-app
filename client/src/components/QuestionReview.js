import React, { useState, useEffect } from 'react';

const API_URL = process.env.REACT_APP_API_URL || '';

export default function QuestionReview({ socket }) {
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedCategoryName, setSelectedCategoryName] = useState('');
  const [batchSize, setBatchSize] = useState(10);
  const [selectedModel, setSelectedModel] = useState('gemini-flash-latest');
  const [reviewPrompt, setReviewPrompt] = useState(`Rate these {count} manga quiz questions about "{animeName}" on a scale of 1-5:

5 = Excellent (specific details, clear question, balanced options)
4 = Good (clear question, mostly specific, good options)
3 = Acceptable (basic question, adequate options)
2 = Poor (vague question, obvious wrong answers)
1 = Terrible (broken question, impossible to answer)

{questions}

RESPOND WITH ONLY A JSON ARRAY OF {count} INTEGER SCORES:
Example: [4, 5, 3, 2, 4, 5, 1, 3, 4, 2]

Your response:`);
  const [reviewStats, setReviewStats] = useState(null);
  const [activeProcessId, setActiveProcessId] = useState(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewProgress, setReviewProgress] = useState(null);
  const [reviewResults, setReviewResults] = useState(null);
  const [questionsToDelete, setQuestionsToDelete] = useState([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState(new Set());
  const [showDeletePreview, setShowDeletePreview] = useState(false);
  const [selectedScoreFilters, setSelectedScoreFilters] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [availableModels] = useState([
    { id: 'gemini-flash-latest', name: 'Gemini Flash', provider: 'gemini' },
    { id: 'gemini-2.5-pro', name: 'Gemini Pro', provider: 'gemini' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
    { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai' },
  ]);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (selectedCategoryId) {
      fetchReviewStats(selectedCategoryId);
    } else {
      setReviewStats(null);
    }
  }, [selectedCategoryId]);

  // Socket listeners are registered directly in startReview to avoid race conditions.

  const fetchCategories = async () => {
    setLoadingCategories(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/review/categories`);
      const data = await response.json();
      if (data.success) {
        setCategories(data.categories || []);
      } else {
        setError('Failed to fetch categories: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      setError('Error fetching categories: ' + err.message);
    } finally {
      setLoadingCategories(false);
    }
  };

  const fetchReviewStats = async (categoryId) => {
    try {
      const response = await fetch(`${API_URL}/api/review/stats/${categoryId}`);
      const data = await response.json();
      if (data.error) {
        setError('Error loading stats: ' + data.error);
        setReviewStats(null);
      } else {
        setReviewStats(data);
      }
    } catch (err) {
      setError('Error fetching review statistics');
    }
  };

  const handleCategoryChange = (e) => {
    const id = e.target.value;
    setSelectedCategoryId(id);
    const cat = categories.find(c => String(c.id) === id);
    setSelectedCategoryName(cat ? cat.name : '');
    setReviewResults(null);
    setShowDeletePreview(false);
    setSelectedQuestionIds(new Set());
    setSelectedScoreFilters(new Set());
  };

  const startReview = async () => {
    if (!selectedCategoryId) {
      setError('Please select a category first');
      return;
    }
    setError('');
    setReviewResults(null);
    try {
      const response = await fetch(`${API_URL}/api/review/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: selectedCategoryId,
          batchSize,
          model: selectedModel,
          customPrompt: reviewPrompt,
        }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to start review');

      const processId = data.processId;
      const prefix = `review:${processId}:`;
      console.log('[Review] Registering listeners for process:', processId);

      // Register listeners immediately — before any React re-render — to avoid missing events
      const onStarted = () => {
        setIsReviewing(true);
        setReviewProgress({ currentBatch: 0, totalBatches: 0, totalProcessed: 0 });
        setError('');
      };
      const onProgress = (d) => setReviewProgress(d);
      const onCompleted = (d) => {
        setIsReviewing(false);
        setReviewProgress(null);
        setReviewResults(d);
        socket.off(`${prefix}started`, onStarted);
        socket.off(`${prefix}reviewProgress`, onProgress);
        socket.off(`${prefix}error`, onError);
        fetchReviewStats(selectedCategoryId);
      };
      const onError = (d) => {
        setIsReviewing(false);
        setReviewProgress(null);
        setError(d.error || 'Review process failed');
        socket.off(`${prefix}started`, onStarted);
        socket.off(`${prefix}reviewProgress`, onProgress);
        socket.off(`${prefix}completed`, onCompleted);
      };

      socket.on(`${prefix}started`, onStarted);
      socket.on(`${prefix}reviewProgress`, onProgress);
      socket.once(`${prefix}completed`, onCompleted);
      socket.once(`${prefix}error`, onError);

      setActiveProcessId(processId);
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleScoreFilter = (score) => {
    setSelectedScoreFilters(prev => {
      const next = new Set(prev);
      if (next.has(score)) next.delete(score);
      else next.add(score);
      return next;
    });
  };

  const previewFilteredQuestions = async () => {
    if (!selectedCategoryId) {
      setError('Please select a category first');
      return;
    }
    if (selectedScoreFilters.size === 0) {
      setError('Please select at least one score to filter on');
      return;
    }
    try {
      const scores = Array.from(selectedScoreFilters).sort().join(',');
      const response = await fetch(`${API_URL}/api/review/questions/${selectedCategoryId}/score/${scores}`);
      const data = await response.json();
      if (data.success) {
        setQuestionsToDelete(data.questions);
        setSelectedQuestionIds(new Set(data.questions.map(q => q.id)));
        setShowDeletePreview(true);
      } else {
        setError('Failed to fetch questions');
      }
    } catch (err) {
      setError('Error fetching questions');
    }
  };

  const toggleQuestionSelection = (questionId) => {
    setSelectedQuestionIds(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  const executeDelete = async () => {
    if (selectedQuestionIds.size === 0) {
      setError('No questions selected for deletion');
      return;
    }
    if (!window.confirm(`Delete ${selectedQuestionIds.size} selected questions? This cannot be undone.`)) return;

    setIsDeleting(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/review/questions/bulk`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionIds: Array.from(selectedQuestionIds) }),
      });
      const data = await response.json();
      if (data.success) {
        setQuestionsToDelete([]);
        setSelectedQuestionIds(new Set());
        setShowDeletePreview(false);
        if (selectedCategoryId) fetchReviewStats(selectedCategoryId);
      } else {
        setError(data.error || 'Failed to delete questions');
      }
    } catch (err) {
      setError('Error deleting questions');
    } finally {
      setIsDeleting(false);
    }
  };

  const getScoreColor = (score) => {
    const colors = { 5: 'bg-green-100 text-green-800', 4: 'bg-blue-100 text-blue-800', 3: 'bg-yellow-100 text-yellow-800', 2: 'bg-orange-100 text-orange-800', 1: 'bg-red-100 text-red-800' };
    return colors[score] || 'bg-gray-100 text-gray-800';
  };

  const scoreDistribution = reviewStats?.scoreDistribution || {};

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Question Review</h2>
        <p className="text-gray-600">Use AI to score questions. Low-scoring questions can be deleted to improve quality.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Configuration */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Review Configuration</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Manga</label>
            <select
              value={selectedCategoryId}
              onChange={handleCategoryChange}
              disabled={loadingCategories}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100"
            >
              <option value="">{loadingCategories ? 'Loading...' : 'Choose manga...'}</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">{categories.length} categories available</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Batch Size</label>
            <input
              type="number" min="1" max="50"
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value) || 1)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">Questions per AI call (1-50)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">AI Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              {availableModels.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={startReview}
              disabled={!selectedCategoryId || isReviewing}
              className={`w-full px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                !selectedCategoryId || isReviewing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isReviewing ? 'Reviewing...' : 'Start Review'}
            </button>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="text-md font-medium text-gray-900 mb-3">Custom Review Prompt</h4>
          <p className="text-sm text-gray-600 mb-3">
            Placeholders:{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">{'{count}'}</code>{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">{'{animeName}'}</code>{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">{'{questions}'}</code>
          </p>
          <textarea
            value={reviewPrompt}
            onChange={(e) => setReviewPrompt(e.target.value)}
            rows={8}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm font-mono text-sm"
          />
          <p className="mt-2 text-xs text-gray-500">The AI must return a JSON array of scores (1-5) matching the question count.</p>
        </div>
      </div>

      {/* Review Statistics */}
      {reviewStats && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Statistics — {selectedCategoryName}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-gray-900">{reviewStats.total}</div>
              <div className="text-sm text-gray-500">Total</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600">{reviewStats.reviewed}</div>
              <div className="text-sm text-gray-500">Reviewed</div>
            </div>
            {[5, 4, 3, 2, 1].map(score => (
              <div key={score} className={`p-4 rounded-lg text-center ${getScoreColor(score)}`}>
                <div className="text-2xl font-bold">{scoreDistribution[score] ?? 0}</div>
                <div className="text-sm">Score {score}</div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Review Progress</span>
              <span className="text-sm text-gray-600">
                {reviewStats.total > 0 ? Math.round((reviewStats.reviewed / reviewStats.total) * 100) : 0}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${reviewStats.total > 0 ? (reviewStats.reviewed / reviewStats.total) * 100 : 0}%` }}
              />
            </div>
            {reviewStats.averageScore > 0 && (
              <div className="mt-2 text-center">
                <span className="text-sm text-gray-600">Average Score: </span>
                <span className="font-semibold">{reviewStats.averageScore}/5</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Review Progress */}
      {reviewProgress && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Review in Progress</h3>
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Batch {reviewProgress.currentBatch} of {reviewProgress.totalBatches}</span>
              <span className="text-sm text-gray-600">{reviewProgress.totalProcessed} questions processed</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${reviewProgress.totalBatches > 0 ? (reviewProgress.currentBatch / reviewProgress.totalBatches) * 100 : 0}%` }}
              />
            </div>
          </div>
          <p className="text-sm text-gray-600">Processing {reviewProgress.questionsInBatch} questions in this batch...</p>
        </div>
      )}

      {/* Review Results */}
      {reviewResults && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Review Results</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold">{reviewResults.totalProcessed}</div>
              <div className="text-sm text-gray-500">Processed</div>
            </div>
            {[5, 4, 3, 2, 1].map(score => (
              <div key={score} className={`p-4 rounded-lg text-center ${getScoreColor(score)}`}>
                <div className="text-2xl font-bold">{(reviewResults.scoreDistribution || {})[score] ?? 0}</div>
                <div className="text-sm">Score {score}</div>
              </div>
            ))}
          </div>
          <div className="text-center">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800">
              Review completed successfully
            </span>
          </div>
        </div>
      )}

      {/* Question Management */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Question Management</h3>
        <p className="text-sm text-gray-600 mb-3">Filter questions by score to preview and manage them.</p>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {[1, 2, 3, 4, 5].map(score => (
            <button
              key={score}
              onClick={() => toggleScoreFilter(score)}
              className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                selectedScoreFilters.has(score)
                  ? score <= 2
                    ? 'bg-red-600 text-white border-red-600'
                    : score === 3
                    ? 'bg-yellow-500 text-white border-yellow-500'
                    : 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Score {score}
            </button>
          ))}
          <button
            onClick={previewFilteredQuestions}
            disabled={!selectedCategoryId || selectedScoreFilters.size === 0}
            className={`ml-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              !selectedCategoryId || selectedScoreFilters.size === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-orange-600 text-white hover:bg-orange-700'
            }`}
          >
            Preview ({selectedScoreFilters.size} selected)
          </button>
        </div>

        {showDeletePreview && (
          <div className="space-y-4">
            {questionsToDelete.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No questions found with the selected score{selectedScoreFilters.size !== 1 ? 's' : ''}</p>
              </div>
            ) : (
              <>
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-medium text-red-800">
                      {selectedQuestionIds.size} of {questionsToDelete.length} selected for deletion
                    </h4>
                    <div className="flex space-x-2">
                      <button onClick={() => setSelectedQuestionIds(new Set(questionsToDelete.map(q => q.id)))}
                        className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200">
                        Select All
                      </button>
                      <button onClick={() => setSelectedQuestionIds(new Set())}
                        className="px-3 py-1 text-sm bg-white text-red-700 border border-red-300 rounded hover:bg-red-50">
                        Deselect All
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-red-600">This action cannot be undone.</p>
                </div>

                <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-200">
                  {questionsToDelete.map(question => (
                    <div
                      key={question.id}
                      className={`p-4 transition-colors ${selectedQuestionIds.has(question.id) ? 'bg-red-50 border-l-4 border-red-400' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex items-start space-x-3">
                        <input
                          type="checkbox"
                          checked={selectedQuestionIds.has(question.id)}
                          onChange={() => toggleQuestionSelection(question.id)}
                          className="mt-1 h-4 w-4 text-red-600 border-gray-300 rounded"
                        />
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-2">
                            <h5 className="font-medium text-gray-900">{question.question_text}</h5>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getScoreColor(question.review_score)}`}>
                              {question.review_score}/5
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {(question.options || []).map((option, index) => (
                              <div
                                key={index}
                                className={`p-2 rounded ${index === question.correct_answer ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-gray-50 text-gray-700'}`}
                              >
                                {String.fromCharCode(65 + index)}. {option}
                                {index === question.correct_answer && ' ✓'}
                              </div>
                            ))}
                          </div>
                          {question.source_url && (
                            <div className="mt-2 text-xs text-gray-500">
                              <a href={question.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Source</a>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-4 border-t">
                  <span className="text-sm text-gray-600">
                    {selectedQuestionIds.size === 0 ? 'No questions selected' : `${selectedQuestionIds.size} question${selectedQuestionIds.size !== 1 ? 's' : ''} will be deleted`}
                  </span>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => { setShowDeletePreview(false); setSelectedQuestionIds(new Set()); }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeDelete}
                      disabled={isDeleting || selectedQuestionIds.size === 0}
                      className={`px-4 py-2 text-sm font-medium rounded-md ${isDeleting || selectedQuestionIds.size === 0 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
                    >
                      {isDeleting ? 'Deleting...' : `Delete ${selectedQuestionIds.size} Question${selectedQuestionIds.size !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Scoring Rubric */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Scoring Rubric</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-sm">
          {[
            { score: 5, label: 'Excellent', color: 'bg-green-50 border-green-200 text-green-700', head: 'text-green-800', desc: 'Specific details, clear question, balanced options' },
            { score: 4, label: 'Good', color: 'bg-blue-50 border-blue-200 text-blue-700', head: 'text-blue-800', desc: 'Clear question, mostly specific, good options' },
            { score: 3, label: 'Acceptable', color: 'bg-yellow-50 border-yellow-200 text-yellow-700', head: 'text-yellow-800', desc: 'Basic question, adequate options, could be improved' },
            { score: 2, label: 'Poor', color: 'bg-orange-50 border-orange-200 text-orange-700', head: 'text-orange-800', desc: 'Vague question, obvious wrong answers' },
            { score: 1, label: 'Terrible', color: 'bg-red-50 border-red-200 text-red-700', head: 'text-red-800', desc: 'Broken question, impossible to answer' },
          ].map(({ score, label, color, head, desc }) => (
            <div key={score} className={`border rounded-lg p-3 ${color}`}>
              <div className={`font-medium mb-2 ${head}`}>{score}/5 — {label}</div>
              <div>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
