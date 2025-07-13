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

console.log('=== FIREBASE DIAGNOSTIC END ===');


const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { initializeFirebase } = require('./config/firebase');

const generationRoutes = require('./routes/generation');
const questionsRoutes = require('./routes/questions');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
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

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Socket.io connection
io.on('connection', (socket) => {
    console.log('New client connected');
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// --- FIX: Use the correct key 'io' to match the routes ---
app.set('io', io);

// API Routes
app.use('/api/generation', generationRoutes);
app.use('/api/questions', questionsRoutes);

// Serve frontend only in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client/build')));

    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../client/build/index.html'));
    });
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));