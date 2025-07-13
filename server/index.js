// server/index.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
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