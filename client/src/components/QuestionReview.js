// client/src/components/QuestionReview.js
import React, { useState, useEffect } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function QuestionReview({ socket }) {
  const [selectedAnime, setSelectedAnime] = useState('');
  const [animeList, setAnimeList] = useState([]);
  const [batchSize, setBatchSize] = useState(10);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const [reviewPrompt, setReviewPrompt] = useState(`Rate these {count} anime quiz questions about "{animeName}" on a scale of 1-5:

5 = Excellent (specific details, clear question, balanced options)
4 = Good (clear question, mostly specific, good options)
3 = Acceptable (basic question, adequate options)
2 = Poor (vague question, obvious wrong answers)
1 = Terrible (broken question, impossible to answer)

{questions}

RESPOND WITH ONLY A JSON ARRAY OF {count} INTEGER SCORES:
Example: [4, 5, 3, 2, 4, 5, 1, 3, 4, 2]

Your response:`); // NEW: Customizable review prompt
  const [reviewStats, setReviewStats] = useState(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewProgress, setReviewProgress] = useState(null);
  const [reviewResults, setReviewResults] = useState(null);
  const [questionsToDelete, setQuestionsToDelete] = useState([]);
  const [showDeletePreview, setShowDeletePreview] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const [loadingAnimes, setLoadingAnimes] = useState(false);
  const [availableModels] = useState([
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
    { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai' }
  ]);

  // Fetch available animes on component mount
  useEffect(() => {
    console.log('[QuestionReview] Component mounted, fetching animes...');
    fetchAvailableAnimes();
  }, []);

  // Fetch stats when anime is selected
  useEffect(() => {
    if (selectedAnime) {
      console.log('[QuestionReview] Selected anime changed:', selectedAnime);
      fetchReviewStats(selectedAnime);
    }
  }, [selectedAnime]);

  // Socket event listeners for review progress
  useEffect(() => {
    if (!socket) {
      console.log('[QuestionReview] No socket connection available');
      return;
    }

    console.log('[QuestionReview] Setting up socket event listeners');

    const handleReviewStarted = (data) => {
      console.log('[Review] Started:', data);
      setIsReviewing(true);
      setReviewProgress({ currentBatch: 0, totalBatches: 0, totalProcessed: 0 });
      setError('');
    };

    const handleReviewProgress = (data) => {
      console.log('[Review] Progress:', data);
      setReviewProgress(data);
    };

    const handleReviewCompleted = (data) => {
      console.log('[Review] Completed:', data);
      setIsReviewing(false);
      setReviewProgress(null);
      setReviewResults(data);
      
      // Refresh stats
      if (selectedAnime) {
        fetchReviewStats(selectedAnime);
      }
    };

    const handleReviewError = (data) => {
      console.error('[Review] Error:', data);
      setIsReviewing(false);
      setReviewProgress(null);
      setError(data.error || 'Review process failed');
    };

    // Listen to all socket events to debug
    socket.onAny((eventName, ...args) => {
      if (eventName.includes('review:')) {
        console.log('[Socket] Received event:', eventName, args);
      }
    });

    // Listen to specific review events
    socket.on('review:started', handleReviewStarted);
    socket.on('review:progress', handleReviewProgress);  
    socket.on('review:completed', handleReviewCompleted);
    socket.on('review:error', handleReviewError);

    return () => {
      console.log('[QuestionReview] Cleaning up socket event listeners');
      socket.off('review:started', handleReviewStarted);
      socket.off('review:progress', handleReviewProgress);
      socket.off('review:completed', handleReviewCompleted);
      socket.off('review:error', handleReviewError);
      if (socket.offAny) {
        socket.offAny();
      }
    };
  }, [socket, selectedAnime]);

  const fetchAvailableAnimes = async () => {
    setLoadingAnimes(true);
    setError('');
    
    try {
      console.log('[QuestionReview] Fetching animes from:', `${API_URL}/api/review/animes`);
      const response = await fetch(`${API_URL}/api/review/animes`);
      const data = await response.json();
      
      console.log('[QuestionReview] Animes response:', data);
      
      if (data.success && data.animes) {
        setAnimeList(data.animes);
        console.log('[QuestionReview] Successfully loaded', data.animes.length, 'animes:', data.animes);
      } else {
        console.error('[QuestionReview] Failed to fetch animes:', data);
        setError('Failed to fetch available animes: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('[QuestionReview] Error fetching animes:', error);
      setError('Error fetching available animes: ' + error.message);
    } finally {
      setLoadingAnimes(false);
    }
  };

  const fetchReviewStats = async (animeName) => {
    try {
      const response = await fetch(`${API_URL}/api/review/stats/${encodeURIComponent(animeName)}`);
      const data = await response.json();
      setReviewStats(data);
    } catch (error) {
      console.error('Error fetching review stats:', error);
      setError('Error fetching review statistics');
    }
  };

  const startReview = async () => {
    if (!selectedAnime) {
      setError('Please select an anime first');
      return;
    }

    setError('');
    setReviewResults(null);
    
    try {
      const response = await fetch(`${API_URL}/api/review/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          animeName: selectedAnime,
          batchSize: batchSize,
          model: selectedModel,
          customPrompt: reviewPrompt // NEW: Send custom prompt
        }),
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to start review');
      }

      console.log('[Review] Started with process ID:', data.processId);
      
    } catch (error) {
      console.error('Error starting review:', error);
      setError(error.message);
    }
  };

  const previewQuestionsToDelete = async () => {
    if (!selectedAnime) {
      setError('Please select an anime first');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/review/questions/${encodeURIComponent(selectedAnime)}/score/1,2`);
      const data = await response.json();
      
      if (data.success) {
        setQuestionsToDelete(data.questions);
        setShowDeletePreview(true);
      } else {
        setError('Failed to fetch questions for deletion preview');
      }
    } catch (error) {
      console.error('Error fetching questions to delete:', error);
      setError('Error fetching questions for deletion');
    }
  };

  const executeDelete = async () => {
    if (questionsToDelete.length === 0) {
      setError('No questions to delete');
      return;
    }

    setIsDeleting(true);
    setError('');

    try {
      const questionIds = questionsToDelete.map(q => q.id);
      
      const response = await fetch(`${API_URL}/api/review/questions/bulk`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ questionIds }),
      });

      const data = await response.json();
      
      if (data.success) {
        console.log(`[Delete] Successfully deleted ${data.deletedCount} questions`);
        setQuestionsToDelete([]);
        setShowDeletePreview(false);
        
        // Refresh stats
        if (selectedAnime) {
          fetchReviewStats(selectedAnime);
        }
      } else {
        setError(data.error || 'Failed to delete questions');
      }
    } catch (error) {
      console.error('Error deleting questions:', error);
      setError('Error deleting questions');
    } finally {
      setIsDeleting(false);
    }
  };

  const getScoreColor = (score) => {
    switch (score) {
      case 5: return 'bg-green-100 text-green-800';
      case 4: return 'bg-blue-100 text-blue-800';
      case 3: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-orange-100 text-orange-800';
      case 1: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Question Review</h2>
        <p className="text-gray-600">
          Use AI to review and score questions. Questions with scores ≤ 2 can be deleted to improve overall quality.
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Configuration */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Review Configuration</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Anime Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Anime</label>
            <div className="relative">
              <select
                value={selectedAnime}
                onChange={(e) => {
                  console.log('[QuestionReview] Anime selected:', e.target.value);
                  setSelectedAnime(e.target.value);
                }}
                disabled={loadingAnimes}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-500"
              >
                <option value="">
                  {loadingAnimes ? 'Loading animes...' : 'Choose anime...'}
                </option>
                {animeList.map((anime) => (
                  <option key={anime} value={anime}>
                    {anime}
                  </option>
                ))}
              </select>
              {loadingAnimes && (
                <div className="absolute right-2 top-2 pointer-events-none">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {animeList.length > 0 
                ? `${animeList.length} animes available` 
                : loadingAnimes 
                  ? 'Loading...' 
                  : 'No animes found'
              }
            </p>
          </div>

          {/* Batch Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Batch Size</label>
            <input
              type="number"
              min="1"
              max="50"
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value) || 1)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">Questions per AI call (1-50)</p>
          </div>

          {/* AI Model Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">AI Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.provider})
                </option>
              ))}
            </select>
          </div>

          {/* Start Review Button */}
          <div className="flex items-end">
            <button
              onClick={startReview}
              disabled={!selectedAnime || isReviewing}
              className={`w-full px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                !selectedAnime || isReviewing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
              }`}
            >
              {isReviewing ? 'Reviewing...' : 'Start Review'}
            </button>
          </div>
        </div>

        {/* NEW: Custom Review Prompt Section */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="text-md font-medium text-gray-900 mb-3">🤖 Custom Review Prompt</h4>
          <p className="text-sm text-gray-600 mb-3">
            Customize how the AI reviews questions. Use placeholders: 
            <code className="text-xs bg-gray-100 px-1 rounded">{'{count}'}</code>, 
            <code className="text-xs bg-gray-100 px-1 rounded">{'{animeName}'}</code>, 
            <code className="text-xs bg-gray-100 px-1 rounded">{'{questions}'}</code>
          </p>
          <textarea
            value={reviewPrompt}
            onChange={(e) => setReviewPrompt(e.target.value)}
            rows={8}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm font-mono text-sm"
            placeholder="Enter your custom review prompt here..."
          />
          <p className="mt-2 text-xs text-gray-500">
            The AI must return a JSON array of scores (1-5) matching the number of questions being reviewed.
          </p>
        </div>
      </div>

      {/* Review Statistics */}
      {reviewStats && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Review Statistics - {selectedAnime}</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {/* Total Questions */}
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-gray-900">{reviewStats.total}</div>
              <div className="text-sm text-gray-500">Total</div>
            </div>

            {/* Reviewed */}
            <div className="bg-green-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600">{reviewStats.reviewed}</div>
              <div className="text-sm text-gray-500">Reviewed</div>
            </div>

            {/* Score Distribution */}
            {[5, 4, 3, 2, 1].map((score) => (
              <div key={score} className={`p-4 rounded-lg text-center ${getScoreColor(score)}`}>
                <div className="text-2xl font-bold">{reviewStats.scoreDistribution[score]}</div>
                <div className="text-sm">Score {score}</div>
              </div>
            ))}
          </div>

          {/* Progress Bar and Average */}
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
                style={{ 
                  width: `${reviewStats.total > 0 ? (reviewStats.reviewed / reviewStats.total) * 100 : 0}%` 
                }}
              />
            </div>
            {reviewStats.averageScore > 0 && (
              <div className="mt-2 text-center">
                <span className="text-sm text-gray-600">Average Score: </span>
                <span className="font-semibold text-gray-900">{reviewStats.averageScore}/5</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Review Progress */}
      {reviewProgress && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Review Progress</h3>
          
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">
                Batch {reviewProgress.currentBatch} of {reviewProgress.totalBatches}
              </span>
              <span className="text-sm text-gray-600">
                {reviewProgress.totalProcessed} questions processed
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ 
                  width: `${reviewProgress.totalBatches > 0 ? (reviewProgress.currentBatch / reviewProgress.totalBatches) * 100 : 0}%` 
                }}
              />
            </div>
          </div>
          
          <div className="text-sm text-gray-600">
            Currently processing {reviewProgress.questionsInBatch} questions in this batch...
          </div>
        </div>
      )}

      {/* Review Results */}
      {reviewResults && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Review Results</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-gray-900">{reviewResults.totalProcessed}</div>
              <div className="text-sm text-gray-500">Processed</div>
            </div>
            
            {[5, 4, 3, 2, 1].map((score) => (
              <div key={score} className={`p-4 rounded-lg text-center ${getScoreColor(score)}`}>
                <div className="text-2xl font-bold">{reviewResults.scoreDistribution[score]}</div>
                <div className="text-sm">Score {score}</div>
              </div>
            ))}
          </div>
          
          <div className="text-center">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800">
              ✅ Review completed successfully
            </span>
          </div>
        </div>
      )}

      {/* Delete Preview and Controls */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Question Management</h3>
          <button
            onClick={previewQuestionsToDelete}
            disabled={!selectedAnime}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              !selectedAnime
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-orange-600 text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500'
            }`}
          >
            Preview Questions to Delete
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Questions with scores ≤ 2 are considered low quality and can be deleted to improve your question database.
        </p>

        {showDeletePreview && (
          <div className="space-y-4">
            {questionsToDelete.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No questions found with scores ≤ 2</p>
                <p className="text-sm">All questions meet the quality threshold!</p>
              </div>
            ) : (
              <>
                <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                  <h4 className="font-medium text-red-800">
                    {questionsToDelete.length} questions will be deleted
                  </h4>
                  <p className="text-sm text-red-600 mt-1">
                    This action cannot be undone. Review the questions below before proceeding.
                  </p>
                </div>

                <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-md">
                  <div className="divide-y divide-gray-200">
                    {questionsToDelete.map((question) => (
                      <div key={question.id} className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h5 className="font-medium text-gray-900">{question.question}</h5>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getScoreColor(question.reviewScore)}`}>
                            {question.reviewScore}/5
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {question.options.map((option, index) => (
                            <div
                              key={index}
                              className={`p-2 rounded ${
                                index === question.correctAnswer
                                  ? 'bg-green-50 border border-green-200 text-green-800'
                                  : 'bg-gray-50 text-gray-700'
                              }`}
                            >
                              {String.fromCharCode(65 + index)}. {option}
                              {index === question.correctAnswer && ' ✓'}
                            </div>
                          ))}
                        </div>
                        
                        <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                          <span>Category: {question.category || 'None'}</span>
                          <span>Page: {question.pageTitle || 'Unknown'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <button
                    onClick={() => setShowDeletePreview(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={executeDelete}
                    disabled={isDeleting}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      isDeleting
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500'
                    }`}
                  >
                    {isDeleting ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Deleting...
                      </div>
                    ) : (
                      `Delete ${questionsToDelete.length} Questions`
                    )}
                  </button>
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
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="font-medium text-green-800 mb-2">5/5 - Excellent</div>
            <div className="text-green-700">Specific details, clear question, balanced options, tests knowledge</div>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="font-medium text-blue-800 mb-2">4/5 - Good</div>
            <div className="text-blue-700">Clear question, mostly specific, good options</div>
          </div>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="font-medium text-yellow-800 mb-2">3/5 - Acceptable</div>
            <div className="text-yellow-700">Basic question, adequate options, could be improved</div>
          </div>
          
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <div className="font-medium text-orange-800 mb-2">2/5 - Poor</div>
            <div className="text-orange-700">Vague question, obvious wrong answers, or confusing</div>
          </div>
          
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="font-medium text-red-800 mb-2">1/5 - Terrible</div>
            <div className="text-red-700">Broken question, impossible to answer, or completely wrong</div>
          </div>
        </div>
      </div>
    </div>
  );
}