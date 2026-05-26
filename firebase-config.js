import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Use the exact keys the user provided
const firebaseConfig = {
  apiKey: "AIzaSyCJ91I7_hBpKoANQS7QNZmA2BjmNmeMpGs",
  authDomain: "expense-tracker-3bb82.firebaseapp.com",
  databaseURL: "https://expense-tracker-3bb82-default-rtdb.firebaseio.com",
  projectId: "expense-tracker-3bb82",
  storageBucket: "expense-tracker-3bb82.firebasestorage.app",
  messagingSenderId: "541219542951",
  appId: "1:541219542951:web:2ba8346dac8f04acb20882",
  measurementId: "G-9XD6NECV8Y"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
