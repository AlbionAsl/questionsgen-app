// server/index.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// Add this to the very beginning of your server/index.js file
// BEFORE any other requires or Firebase initialization

console.log('=== FIREBASE DIAGNOSTIC START ===');
console.log('Node modules path:', __dirname);
console.log('Current working directory:', process.cwd());

// Check if Firebase is already loaded/initialized
console.log('Firebase admin module loaded?', !!require.cache[require.resolve('firebase-admin')]);

// Check for service account file
const fs = require('fs');
const path = require('path');
const serviceAccountPath = path.resolve(__dirname, '../serviceAccount.json');
console.log('ServiceAccount.json path:', serviceAccountPath);
console.log('ServiceAccount.json exists?', fs.existsSync(serviceAccountPath));

if (fs.existsSync(serviceAccountPath)) {
    try {
        const serviceAccount = require(serviceAccountPath);
        console.log('ServiceAccount project_id:', serviceAccount.project_id);
        console.log('ServiceAccount client_email:', serviceAccount.client_email);
        console.log('ServiceAccount has private_key?', !!serviceAccount.private_key);
    } catch (error) {
        console.log('Error reading serviceAccount.json:', error.message);
    }
}

// Check environment variables
console.log('Environment variables:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID);
console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL);
console.log('OPENAI_API_KEY configured:', !!process.env.OPENAI_API_KEY);
console.log('GEMINI_KEY configured:', !!process.env.GEMINI_KEY);

console.log('=== FIREBASE DIAGNOSTIC END ===');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { initializeFirebase } = require('./config/firebase');

// IMPORTANT: Make sure these imports are correct
const generationRoutes = require('./routes/generation');
const questionsRoutes = require('./routes/questions');
const aiRoutes = require('./routes/ai');
const questionReviewRoutes = require('./routes/questionReview'); // NEW: Question Review routes

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' ? false : "http://localhost:3000",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

// Initialize Firebase
try {
    initializeFirebase();
    console.log("Firebase initialized successfully.");
} catch (error) {
    console.error("CRITICAL: Failed to initialize Firebase. Exiting.", error);
    process.exit(1);
}

// Add this temporary debug code to your server/index.js 
// RIGHT AFTER the require statements and BEFORE app.use()

console.log('=== ROUTE DEBUG START ===');

// Test the imports
try {
    const generationRoutes = require('./routes/generation');
    console.log('Generation routes type:', typeof generationRoutes);
    console.log('Generation routes is function:', typeof generationRoutes === 'function');
    console.log('Generation routes keys:', Object.keys(generationRoutes));
} catch (error) {
    console.error('Error importing generation routes:', error.message);
}

try {
    const questionsRoutes = require('./routes/questions');
    console.log('Questions routes type:', typeof questionsRoutes);
    console.log('Questions routes is function:', typeof questionsRoutes === 'function');
    console.log('Questions routes keys:', Object.keys(questionsRoutes));
} catch (error) {
    console.error('Error importing questions routes:', error.message);
}

try {
    const aiRoutes = require('./routes/ai');
    console.log('AI routes type:', typeof aiRoutes);
    console.log('AI routes is function:', typeof aiRoutes === 'function');
    console.log('AI routes keys:', Object.keys(aiRoutes));
} catch (error) {
    console.error('Error importing AI routes:', error.message);
}

try {
    const questionReviewRoutes = require('./routes/questionReview');
    console.log('Question Review routes type:', typeof questionReviewRoutes);
    console.log('Question Review routes is function:', typeof questionReviewRoutes === 'function');
    console.log('Question Review routes keys:', Object.keys(questionReviewRoutes));
} catch (error) {
    console.error('Error importing Question Review routes:', error.message);
}

console.log('=== ROUTE DEBUG END ===');

// Then your existing code continues...

// Middleware
app.use(cors({ 
    origin: process.env.NODE_ENV === 'production' ? false : "http://localhost:3000" 
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Socket.io connection
io.on('connection', (socket) => {
    console.log('New client connected');
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Set io instance for routes to access
app.set('io', io);

// API Routes - THIS IS THE CRITICAL FIX
app.use('/api/generation', generationRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/review', questionReviewRoutes); // NEW: Question Review routes

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
                firebase: 'connected',
                openai: !!process.env.OPENAI_API_KEY ? 'configured' : 'not_configured',
                gemini: !!process.env.GEMINI_KEY ? 'configured' : 'not_configured'
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// 🚀 CRITICAL FIX: Serve frontend in production
if (process.env.NODE_ENV === 'production') {
    // Serve static files from the React app build directory
    app.use(express.static(path.join(__dirname, '../client/build')));

    // Handle React routing, return all requests to React app
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../client/build/index.html'));
    });
}

// Test AI providers on startup
async function testAIProviders() {
    console.log('🧪 Testing AI providers on startup...');
    
    try {
        const aiProviderService = require('./services/aiProviderService');
        const results = await aiProviderService.testAllConnections();
        
        console.log('OpenAI Status:', results.openai?.success ? '✅ Connected' : '❌ Failed');
        if (results.openai?.error) {
            console.log('OpenAI Error:', results.openai.error);
        }
        
        console.log('Gemini Status:', results.gemini?.success ? '✅ Connected' : '❌ Failed');
        if (results.gemini?.error) {
            console.log('Gemini Error:', results.gemini.error);
        }
        
        const availableProviders = Object.entries(results)
            .filter(([_, result]) => result.success)
            .map(([provider]) => provider);
            
        if (availableProviders.length === 0) {
            console.log('⚠️  WARNING: No AI providers are available. Check your API keys.');
        } else {
            console.log(`🎉 Available AI providers: ${availableProviders.join(', ')}`);
        }
        
    } catch (error) {
        console.error('❌ Failed to test AI providers:', error.message);
    }
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Serving static files: ${process.env.NODE_ENV === 'production' ? 'Yes' : 'No'}`);
    
    // Test AI providers after server starts
    testAIProviders();
});