const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let db;
let isInitialized = false;

function initializeFirebase() {
    console.log('🔥 Starting Firebase initialization...');
    
    // Check if already initialized
    if (isInitialized && admin.apps.length > 0) {
        console.log('✅ Firebase already initialized, reusing connection');
        db = admin.firestore();
        return;
    }

    // Clear any existing apps first
    if (admin.apps.length > 0) {
        console.log('🧹 Clearing existing Firebase apps');
        admin.apps.forEach(app => {
            if (app) {
                app.delete();
            }
        });
    }

    try {
        let credential;
        const serviceAccountPath = path.resolve(__dirname, '../../serviceAccount.json');
        
        console.log('📍 Looking for serviceAccount.json at:', serviceAccountPath);
        
        if (fs.existsSync(serviceAccountPath)) {
            console.log('📄 Found serviceAccount.json, using file-based authentication');
            
            try {
                const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
                
                // Validate required fields
                const requiredFields = ['project_id', 'private_key', 'client_email'];
                const missingFields = requiredFields.filter(field => !serviceAccount[field]);
                
                if (missingFields.length > 0) {
                    throw new Error(`Missing required fields in serviceAccount.json: ${missingFields.join(', ')}`);
                }
                
                console.log(`🎯 Project ID: ${serviceAccount.project_id}`);
                console.log(`📧 Client Email: ${serviceAccount.client_email}`);
                
                credential = admin.credential.cert(serviceAccount);
                
            } catch (error) {
                throw new Error(`Failed to parse serviceAccount.json: ${error.message}`);
            }
            
        } else {
            console.log('🔧 No serviceAccount.json found, trying environment variables');
            
            const envCredentials = {
                type: "service_account",
                project_id: process.env.FIREBASE_PROJECT_ID,
                private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
                private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                client_email: process.env.FIREBASE_CLIENT_EMAIL,
                client_id: process.env.FIREBASE_CLIENT_ID,
                auth_uri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
                token_uri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
                auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
                client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
            };
            
            // Validate required fields
            const requiredFields = ['project_id', 'private_key', 'client_email'];
            const missingFields = requiredFields.filter(field => !envCredentials[field]);
            
            if (missingFields.length > 0) {
                throw new Error(`Missing required environment variables: ${missingFields.map(f => 'FIREBASE_' + f.toUpperCase()).join(', ')}`);
            }
            
            console.log(`🎯 Project ID: ${envCredentials.project_id}`);
            console.log(`📧 Client Email: ${envCredentials.client_email}`);
            
            credential = admin.credential.cert(envCredentials);
        }

        // Initialize Firebase Admin
        const app = admin.initializeApp({
            credential: credential
        });
        
        console.log('🚀 Firebase Admin initialized successfully');
        
        // Initialize Firestore
        db = admin.firestore();
        
        // Test the connection
        console.log('🧪 Testing Firestore connection...');
        
        // Simple test query to verify authentication
        db.collection('test').limit(1).get()
            .then(() => {
                console.log('✅ Firestore connection test successful');
            })
            .catch((error) => {
                console.error('❌ Firestore connection test failed:', error.message);
                throw error;
            });
        
        isInitialized = true;
        console.log('🎉 Firebase initialization complete');
        
    } catch (error) {
        console.error('💥 Firebase initialization failed:', error.message);
        console.error('📋 Full error:', error);
        throw error;
    }
}

function getDb() {
    if (!db) {
        throw new Error('🔥 Firebase Firestore has not been initialized. Call initializeFirebase() first.');
    }
    return db;
}

// Export functions
module.exports = {
    initializeFirebase,
    getDb
};