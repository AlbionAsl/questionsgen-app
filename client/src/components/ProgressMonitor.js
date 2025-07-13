import React, { useState, useEffect } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function ProgressMonitor({ processId, socket, onComplete }) {
  const [process, setProcess] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!processId) {
      setLoading(false);
      return;
    }

    // Fetch initial status
    fetchProcessStatus();

    // Subscribe to socket events
    if (socket) {
      socket.on(`generation:${processId}:log`, handleLog);
      socket.on(`generation:${processId}:progress`, handleProgress);
      socket.on(`generation:${processId}:questionsGenerated`, handleQuestionsGenerated);
      socket.on(`generation:${processId}:completed`, handleCompleted);
      socket.on(`generation:${processId}:error`, handleError);

      return () => {
        socket.off(`generation:${processId}:log`);
        socket.off(`generation:${processId}:progress`);
        socket.off(`generation:${processId}:questionsGenerated`);
        socket.off(`generation:${processId}:completed`);
        socket.off(`generation:${processId}:error`);
      };
    }
  }, [processId, socket]);

  const fetchProcessStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/api/generation/status/${processId}`);
      const data = await response.json();
      setProcess(data);
      setLogs(data.logs || []);
    } catch (error) {
      console.error('Error fetching process status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLog = (log) => {
    setLogs(prev => [...prev, log]);
  };

  const handleProgress = (progress) => {
    setProcess(prev => ({ ...prev, progress }));
  };

  const handleQuestionsGenerated = ({ count, total }) => {
    setProcess(prev => ({ ...prev, questionsGenerated: total }));
  };

  const handleCompleted = (data) => {
    setProcess(prev => ({ ...prev, status: 'completed', ...data }));
    if (onComplete) onComplete();
  };

  const handleError = ({ message }) => {
    setProcess(prev => ({ ...prev, status: 'error', error: message }));
  };

  const handleStop = async () => {
    try {
      await fetch(`${API_URL}/api/generation/stop/${processId}`, { method: 'POST' });
    } catch (error) {
      console.error('Error stopping process:', error);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'error': return 'bg-red-100 text-red-800';
      case 'stopping': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getLogIcon = (type) => {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      default: return 'ℹ️';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!process && !processId) {
    return (
      <div className="bg-white shadow rounded-lg p-8 text-center">
        <p className="text-gray-500">No active generation process. Start a new generation from the Generate tab.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Process Overview */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Generation Progress</h2>
          {process?.status === 'running' && (
            <button
              onClick={handleStop}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Stop Generation
            </button>
          )}
        </div>

        {process && (
          <div className="space-y-4">
            {/* Status Badge */}
            <div className="flex items-center space-x-4">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(process.status)}`}>
                {process.status.charAt(0).toUpperCase() + process.status.slice(1)}
              </span>
              <span className="text-sm text-gray-500">
                Started: {new Date(process.startTime).toLocaleString()}
              </span>
            </div>

            {/* Anime Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Anime</p>
                <p className="font-medium">{process.animeName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Wiki</p>
                <p className="font-medium">{process.fandomWikiName}</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Progress</span>
                <span>{process.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${process.progress}%` }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500">Questions Generated</p>
                <p className="text-2xl font-bold text-gray-900">{process.questionsGenerated || 0}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500">API Calls Made</p>
                <p className="text-2xl font-bold text-gray-900">{process.apiCallsMade || 0}</p>
              </div>
            </div>

            {/* Error Message */}
            {process.error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{process.error}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Logs */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Activity Log</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-sm text-gray-500">No logs yet...</p>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="flex items-start space-x-2 text-sm">
                <span className="flex-shrink-0">{getLogIcon(log.type)}</span>
                <span className="text-gray-500 flex-shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`flex-1 ${log.type === 'error' ? 'text-red-600' : 'text-gray-700'}`}>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}