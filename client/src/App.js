import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import GenerationForm from './components/GenerationForm';
import ProgressMonitor from './components/ProgressMonitor';
import QuestionsList from './components/QuestionsList';
import History from './components/History';
import PopularPages from './components/PopularPages';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function App() {
  const [activeTab, setActiveTab] = useState('generate');
  const [socket, setSocket] = useState(null);
  const [activeProcess, setActiveProcess] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const newSocket = io(API_URL);
    setSocket(newSocket);

    fetchStats();

    return () => newSocket.close();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/api/questions/stats`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleGenerationStart = (processId) => {
    setActiveProcess(processId);
    setActiveTab('progress');
  };

  const handleGenerationComplete = () => {
    fetchStats();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">QuestionsGenA</h1>
              <span className="ml-3 text-sm text-gray-500">Anime Quiz Generator</span>
            </div>
            {stats && (
              <div className="flex items-center space-x-6 text-sm">
                <div>
                  <span className="text-gray-500">Total Questions:</span>
                  <span className="ml-2 font-semibold text-gray-900">{stats.total}</span>
                </div>
                <div>
                  <span className="text-gray-500">Animes:</span>
                  <span className="ml-2 font-semibold text-gray-900">
                    {Object.keys(stats.byAnime).length}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {[
              { id: 'generate', label: 'Generate Questions', icon: '🎯' },
              { id: 'popular', label: 'Popular Pages', icon: '⭐' },
              { id: 'progress', label: 'Progress Monitor', icon: '📊' },
              { id: 'questions', label: 'View Questions', icon: '❓' },
              { id: 'history', label: 'Generation History', icon: '📜' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'generate' && (
          <GenerationForm onStart={handleGenerationStart} />
        )}
        {activeTab === 'popular' && (
          <PopularPages onStart={handleGenerationStart} />
        )}
        {activeTab === 'progress' && (
          <ProgressMonitor
            processId={activeProcess}
            socket={socket}
            onComplete={handleGenerationComplete}
          />
        )}
        {activeTab === 'questions' && (
          <QuestionsList stats={stats} />
        )}
        {activeTab === 'history' && (
          <History onViewProcess={(id) => {
            setActiveProcess(id);
            setActiveTab('progress');
          }} />
        )}
      </main>
    </div>
  );
}