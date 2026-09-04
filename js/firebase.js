import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, OAuthProvider } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// No Firebase Storage here on purpose — as of late 2024, Google requires
// the paid Blaze plan just to provision a Storage bucket at all, even for
// usage that stays entirely within the free tier. This project intentionally
// stays on the free Spark plan, so photo uploads go through Cloudinary
// instead (js/cloudinary-upload.js) — genuinely free, no billing account
// required anywhere.
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");
