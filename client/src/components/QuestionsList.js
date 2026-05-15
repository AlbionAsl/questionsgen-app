import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || '';

export default function QuestionsList({ stats }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/review/categories`)
      .then(r => r.json())
      .then(data => setCategories(data.categories || []))
      .catch(err => console.error('Error fetching categories:', err));
  }, []);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategoryId) params.append('categoryId', selectedCategoryId);
      if (selectedStatus) params.append('status', selectedStatus);
      params.append('limit', '100');

      const response = await fetch(`${API_URL}/api/questions?${params}`);
      const data = await response.json();
      setQuestions(data);
    } catch (error) {
      console.error('Error fetching questions:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedCategoryId, selectedStatus]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this question?')) return;

    try {
      await fetch(`${API_URL}/api/questions/${id}`, { method: 'DELETE' });
      setQuestions(questions.filter(q => q.id !== id));
    } catch (error) {
      console.error('Error deleting question:', error);
    }
  };

  const handleEdit = (question) => {
    setEditingQuestion({
      ...question,
      newQuestion: question.question_text,
      newOptions: [...question.options],
      newCorrectAnswer: question.correct_answer
    });
  };

  const handleSaveEdit = async () => {
    try {
      await fetch(`${API_URL}/api/questions/${editingQuestion.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: editingQuestion.newQuestion,
          options: editingQuestion.newOptions,
          correctAnswer: editingQuestion.newCorrectAnswer
        })
      });

      setQuestions(questions.map(q =>
        q.id === editingQuestion.id
          ? {
              ...q,
              question_text: editingQuestion.newQuestion,
              options: editingQuestion.newOptions,
              correct_answer: editingQuestion.newCorrectAnswer
            }
          : q
      ));
      setEditingQuestion(null);
    } catch (error) {
      console.error('Error updating question:', error);
    }
  };

  const handleExport = async (format) => {
    try {
      const response = await fetch(`${API_URL}/api/questions/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          categoryId: selectedCategoryId,
          status: selectedStatus
        })
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `questions.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (error) {
      console.error('Error exporting questions:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Question Database</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Filter by Manga</label>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">All</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Filter by Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="unrated">Unrated</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setShowExportModal(true)}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Export Questions
            </button>
          </div>
        </div>
        {stats && (
          <div className="mt-4 flex gap-6 text-sm text-gray-500">
            <span>Total: <strong>{stats.total}</strong></span>
            {stats.byStatus && Object.entries(stats.byStatus).map(([s, n]) => (
              <span key={s}>{s}: <strong>{n}</strong></span>
            ))}
          </div>
        )}
      </div>

      {/* Questions List */}
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-sm text-gray-500 mb-4">Showing {questions.length} questions</p>
        <div className="space-y-4">
          {questions.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No questions found</p>
          ) : (
            questions.map((question) => (
              <div key={question.id} className="border border-gray-200 rounded-lg p-4">
                {editingQuestion?.id === question.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={editingQuestion.newQuestion}
                      onChange={(e) => setEditingQuestion({
                        ...editingQuestion,
                        newQuestion: e.target.value
                      })}
                      className="w-full p-2 border border-gray-300 rounded-md"
                      rows="2"
                    />
                    <div className="space-y-2">
                      {editingQuestion.newOptions.map((option, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="radio"
                            checked={editingQuestion.newCorrectAnswer === index}
                            onChange={() => setEditingQuestion({
                              ...editingQuestion,
                              newCorrectAnswer: index
                            })}
                          />
                          <input
                            type="text"
                            value={option}
                            onChange={(e) => {
                              const newOptions = [...editingQuestion.newOptions];
                              newOptions[index] = e.target.value;
                              setEditingQuestion({ ...editingQuestion, newOptions });
                            }}
                            className="flex-1 p-1 border border-gray-300 rounded"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => setEditingQuestion(null)}
                        className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-medium text-gray-900">{question.question_text}</h3>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(question)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(question.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {question.options.map((option, index) => (
                        <div
                          key={index}
                          className={`text-sm ${
                            index === question.correct_answer
                              ? 'text-green-600 font-medium'
                              : 'text-gray-600'
                          }`}
                        >
                          {index + 1}. {option}
                          {index === question.correct_answer && ' ✓'}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center space-x-4 text-xs text-gray-500">
                      <span>Manga: {question.categories?.name || `ID ${question.category_id}`}</span>
                      <span>Status: {question.status || 'N/A'}</span>
                      {question.review_score && <span>Score: {question.review_score}</span>}
                      {question.source_url && (
                        <a href={question.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                          Source
                        </a>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Export Questions</h3>
            <p className="text-sm text-gray-500 mb-4">Choose export format:</p>
            <div className="space-y-2">
              <button
                onClick={() => handleExport('json')}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Export as JSON
              </button>
              <button
                onClick={() => handleExport('csv')}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Export as CSV
              </button>
              <button
                onClick={() => setShowExportModal(false)}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancel
            </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
