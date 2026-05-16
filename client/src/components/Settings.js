import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || '';

export default function Settings() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    provider: 'openai',
    display_name: '',
    api_model_id: '',
  });
  const [formError, setFormError] = useState('');

  const fetchModels = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/models`);
      const data = await response.json();
      if (data.success) {
        setModels(data.models);
      } else {
        setError(data.error || 'Failed to load models');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleAddModel = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.provider || !formData.display_name.trim() || !formData.api_model_id.trim()) {
      setFormError('All fields are required');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await response.json();

      if (data.success) {
        setModels([...models, data.model]);
        setFormData({ provider: 'openai', display_name: '', api_model_id: '' });
      } else {
        setFormError(data.error || 'Failed to add model');
      }
    } catch (err) {
      setFormError('Failed to connect to server');
    }
  };

  const handleRemoveModel = async (id) => {
    try {
      const response = await fetch(`${API_URL}/api/models/${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        setModels(models.filter(m => m.id !== id));
      }
    } catch (err) {
      setError('Failed to remove model');
    }
  };

  const handleMove = async (index, direction) => {
    const newModels = [...models];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newModels.length) return;

    [newModels[index], newModels[targetIndex]] = [newModels[targetIndex], newModels[index]];
    setModels(newModels);

    try {
      await fetch(`${API_URL}/api/models/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: newModels.map(m => m.id) }),
      });
    } catch (err) {
      setError('Failed to save new order');
      fetchModels();
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Model Configuration</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">{error}</div>
      )}

      {/* Add Model Form */}
      <form onSubmit={handleAddModel} className="mb-8 p-4 bg-white rounded-lg shadow-sm border">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Model</h3>
        {formError && (
          <div className="mb-3 p-2 bg-red-50 text-red-600 rounded text-sm">{formError}</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <select
            value={formData.provider}
            onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="openai">OpenAI</option>
            <option value="gemini">Google Gemini</option>
          </select>
          <input
            type="text"
            placeholder="Display name"
            value={formData.display_name}
            onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
            className="border rounded-md px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="API model ID"
            value={formData.api_model_id}
            onChange={(e) => setFormData({ ...formData, api_model_id: e.target.value })}
            className="border rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-700"
          >
            Add
          </button>
        </div>
      </form>

      {/* Model List */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-700">
            Configured Models ({models.length})
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            The first model in this list is the default selection in the generation form.
          </p>
        </div>
        {models.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            No models configured. Add one above.
          </div>
        ) : (
          <ul className="divide-y">
            {models.map((model, index) => (
              <li key={model.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    model.provider === 'openai'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {model.provider}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{model.display_name}</span>
                  <span className="text-xs text-gray-400">{model.api_model_id}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleMove(index, -1)}
                    disabled={index === 0}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    title="Move up"
                  >
                    &#9650;
                  </button>
                  <button
                    onClick={() => handleMove(index, 1)}
                    disabled={index === models.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    title="Move down"
                  >
                    &#9660;
                  </button>
                  <button
                    onClick={() => handleRemoveModel(model.id)}
                    className="ml-2 p-1 text-red-400 hover:text-red-600"
                    title="Remove model"
                  >
                    &#10005;
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
