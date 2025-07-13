// server/config/firebase.js
const admin = require('firebase-admin');
const path = require('path');

let db;

function initializeFirebase() {
    // Correctly resolve the path to the service account key
    const serviceAccountPath = path.resolve(__dirname, 'serviceAccount.json');
    
    // Check if the app is already initialized
    if (admin.apps.length === 0) {
        try {
            const serviceAccount = require(serviceAccountPath);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            db = admin.firestore();
        } catch (error) {
            console.error("Failed to load Firebase service account key. Make sure 'serviceAccount.json' is in the 'server/config' directory.", error);
            // Re-throw the error to be caught by the caller in index.js
            throw error;
        }
    }
}

function getDb() {
    if (!db) {
        throw new Error('Firebase has not been initialized. Call initializeFirebase first.');
    }
    return db;
}

// --- FIX: Correctly export the functions ---
module.exports = {
    initializeFirebase,
    getDb
};