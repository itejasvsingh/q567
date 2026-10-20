// Public Firebase web config. Access is controlled by database.rules.json,
// not by keeping these values secret.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBFZ2NfMxFApWvbswSiL9uLNpeoc-aALUA",
  authDomain: "q567mba.firebaseapp.com",
  databaseURL: "https://q567mba-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "q567mba",
  storageBucket: "q567mba.firebasestorage.app",
  messagingSenderId: "935454311755",
  appId: "1:935454311755:web:9c0b44191e8a84026fd4ce",
  measurementId: "G-C2T1TH06GB"
};

// Web Push key pair public key (Firebase Console > Project settings > Cloud
// Messaging > Web Push certificates). Public, safe to commit. While empty,
// phone push stays off and the rest of the app is unaffected.
const FCM_VAPID_KEY = "";
