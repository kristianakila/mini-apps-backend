const admin = require('firebase-admin');
const config = require('./index');
const logger = require('../utils/logger');

let firebaseApp;

const initializeFirebase = () => {
  try {
    if (admin.apps.length === 0) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.firebase.projectId,
          privateKey: config.firebase.privateKey,
          clientEmail: config.firebase.clientEmail,
        }),
        databaseURL: config.firebase.databaseURL,
      });
      
      logger.info('Firebase Admin SDK initialized successfully');
    } else {
      firebaseApp = admin.app();
    }
    
    return {
      firestore: firebaseApp.firestore(),
      auth: firebaseApp.auth(),
      admin,
    };
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin SDK:', error);
    throw error;
  }
};

const getFirestore = () => {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return firebaseApp.firestore();
};

const getAuth = () => {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return firebaseApp.auth();
};

module.exports = {
  initializeFirebase,
  getFirestore,
  getAuth,
  admin,
};
