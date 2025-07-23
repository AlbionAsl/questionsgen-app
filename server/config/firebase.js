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
            console.log('🔧 No serviceAccount.json found, creating from environment variables');
            
            // 🚀 NEW: Create serviceAccount object dynamically from environment variables
            const serviceAccount = createServiceAccountFromEnv();
            
            // Validate the created serviceAccount
            const requiredFields = ['project_id', 'private_key', 'client_email'];
            const missingFields = requiredFields.filter(field => !serviceAccount[field]);
            
            if (missingFields.length > 0) {
                throw new Error(`Missing required environment variables for Firebase: ${missingFields.map(f => 'FIREBASE_' + f.toUpperCase()).join(', ')}`);
            }
            
            console.log(`🎯 Project ID: ${serviceAccount.project_id}`);
            console.log(`📧 Client Email: ${serviceAccount.client_email}`);
            
            credential = admin.credential.cert(serviceAccount);
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

// 🚀 NEW: Function to create serviceAccount object from environment variables
function createServiceAccountFromEnv() {
    console.log('🏗️ Creating serviceAccount from environment variables...');
    
    // Get required environment variables
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    
    // Log what we found (without exposing the private key)
    console.log('Environment check:');
    console.log(`- FIREBASE_PROJECT_ID: ${projectId ? '✅ Found' : '❌ Missing'}`);
    console.log(`- FIREBASE_PRIVATE_KEY: ${privateKey ? '✅ Found (length: ' + privateKey.length + ')' : '❌ Missing'}`);
    console.log(`- FIREBASE_CLIENT_EMAIL: ${clientEmail ? '✅ Found' : '❌ Missing'}`);
    
    if (!projectId || !privateKey || !clientEmail) {
        console.error('❌ Missing required Firebase environment variables');
        console.log('💡 Please set: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL');
        throw new Error('Missing required Firebase environment variables');
    }
    
    // 🔧 ENHANCED: Better private key processing
    let processedPrivateKey = privateKey;
    
    // Debug: Check the raw private key format
    console.log('🔍 Private key debug info:');
    console.log(`- Starts with quotes: ${privateKey.startsWith('"')}`);
    console.log(`- Contains \\n: ${privateKey.includes('\\n')}`);
    console.log(`- Contains actual newlines: ${privateKey.includes('\n')}`);
    console.log(`- First 50 chars: ${privateKey.substring(0, 50)}...`);
    
    // Remove surrounding quotes if present (common when copying from .env files)
    if (processedPrivateKey.startsWith('"') && processedPrivateKey.endsWith('"')) {
        console.log('🧹 Removing surrounding quotes from private key');
        processedPrivateKey = processedPrivateKey.slice(1, -1);
    }
    
    // Replace escaped newlines with actual newlines
    if (processedPrivateKey.includes('\\n')) {
        console.log('🔄 Converting \\n to actual newlines');
        processedPrivateKey = processedPrivateKey.replace(/\\n/g, '\n');
    }
    
    // Validate that we have a proper PEM key
    if (!processedPrivateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        console.error('❌ Private key does not contain PEM header');
        throw new Error('Invalid private key format - missing PEM header');
    }
    
    if (!processedPrivateKey.includes('-----END PRIVATE KEY-----')) {
        console.error('❌ Private key does not contain PEM footer');
        throw new Error('Invalid private key format - missing PEM footer');
    }
    
    console.log('✅ Private key format validated');
    
    // Create the serviceAccount object with all the required fields
    const serviceAccount = {
        type: "service_account",
        project_id: projectId,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || "default-key-id",
        private_key: processedPrivateKey, // Use the processed private key
        client_email: clientEmail,
        client_id: process.env.FIREBASE_CLIENT_ID || "123456789",
        auth_uri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
        token_uri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL || `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(clientEmail)}`,
        universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN || "googleapis.com"
    };
    
    console.log('✅ ServiceAccount object created successfully');
    console.log('🔍 Final private key check:');
    console.log(`- Length: ${serviceAccount.private_key.length}`);
    console.log(`- Has proper newlines: ${serviceAccount.private_key.includes('\n')}`);
    
    return serviceAccount;
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