// server/config/firebase.js
const admin = require('firebase-admin');
const path = require('path');

let db;

const initializeFirebase = () => {
  if (!admin.apps.length) {
    const serviceAccountPath = path.join(__dirname, '../../serviceAccount.json');
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
    
    db = admin.firestore();
  }
  
  return db;
};

module.exports = {
  getDb: () => {
    if (!db) {
      db = initializeFirebase();
    }
    return db;
  }
};