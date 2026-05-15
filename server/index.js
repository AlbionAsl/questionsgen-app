require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const generationRoutes = require('./routes/generation');
const questionsRoutes = require('./routes/questions');
const aiRoutes = require('./routes/ai');
const questionReviewRoutes = require('./routes/questionReview');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:3000',
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => console.log('Client disconnected'));
});

app.set('io', io);

app.use('/api/generation', generationRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/review', questionReviewRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      supabase: !!process.env.SUPABASE_URL ? 'configured' : 'not_configured',
      openai: !!process.env.OPENAI_API_KEY ? 'configured' : 'not_connected',
      gemini: !!process.env.GEMINI_KEY ? 'configured' : 'not_configured',
    },
  });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

async function testAIProviders() {
  try {
    const aiProviderService = require('./services/aiProviderService');
    const results = await aiProviderService.testAllConnections();
    console.log('OpenAI:', results.openai?.success ? 'connected' : 'failed');
    console.log('Gemini:', results.gemini?.success ? 'connected' : 'failed');
  } catch (error) {
    console.error('Could not test AI providers:', error.message);
  }
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  testAIProviders();
});
