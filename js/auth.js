import { auth, googleProvider, appleProvider, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

let signup = false;

const form = document.getElementById("authForm");
const nameWrap = document.getElementById("nameWrap");
const title = document.getElementById("authTitle");
const eyebrow = document.getElementById("authEyebrow");
const subtitle = document.getElementById("authSubtitle");
const submitBtn = document.getElementById("authSubmit");
const switchText = document.getElementById("switchText");
const switchMode = document.getElementById("switchMode");
const googleBtn = document.getElementById("googleSignIn");
const appleBtn = document.getElementById("appleSignIn");
const errorBox = document.getElementById("authError");

// Wherever the person was trying to go before login.html interrupted them.
// header-auth.js sets this on every "you need to be logged in" redirect.
const nextUrl = new URLSearchParams(location.search).get("next") || "index.html";

// Already signed in and landed on the login page anyway (e.g. via back
// button)? Send them straight on rather than showing the form again.
onAuthStateChanged(auth, (user) => {
  if (user) location.href = nextUrl;
});

switchMode.addEventListener("click", () => {
  signup = !signup;
  nameWrap.classList.toggle("hidden", !signup);
  title.textContent = signup ? "Create your Rentora account" : "Log in to Rentora";
  eyebrow.textContent = signup ? "Join Rentora" : "Welcome back";
  subtitle.textContent = signup
    ? "Start renting instead of buying everything."
    : "Rent smarter. Humanity has enough stuff already.";
  submitBtn.textContent = signup ? "Create account" : "Log in";
  switchText.textContent = signup ? "Already have an account?" : "Don't have an account?";
  switchMode.textContent = signup ? "Log in" : "Sign up";
  clearError();
});

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function setLoading(btn, isLoading, busyText) {
  if (isLoading) {
    btn.dataset.label = btn.textContent;
    btn.textContent = busyText;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.label || btn.textContent;
    btn.disabled = false;
  }
}

async function ensureUserDoc(user, extra = {}) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: user.displayName || extra.displayName || (user.email ? user.email.split("@")[0] : "Rentora user"),
      email: user.email || "",
      photoURL: user.photoURL || "",
      bio: "",
      location: "",
      createdAt: serverTimestamp()
    });
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const name = document.getElementById("name")?.value.trim();
  setLoading(submitBtn, true, signup ? "Creating account…" : "Logging in…");
  try {
    if (signup) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (name) await updateProfile(cred.user, { displayName: name });
      await ensureUserDoc(cred.user, { displayName: name });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    location.href = nextUrl;
  } catch (err) {
    showError(friendlyAuthError(err));
    setLoading(submitBtn, false);
  }
});

googleBtn?.addEventListener("click", async () => {
  clearError();
  setLoading(googleBtn, true, "Connecting to Google…");
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    await ensureUserDoc(cred.user);
    location.href = nextUrl;
  } catch (err) {
    showError(friendlyAuthError(err));
    setLoading(googleBtn, false);
  }
});

appleBtn?.addEventListener("click", async () => {
  clearError();
  setLoading(appleBtn, true, "Connecting to Apple…");
  try {
    const cred = await signInWithPopup(auth, appleProvider);
    await ensureUserDoc(cred.user);
    location.href = nextUrl;
  } catch (err) {
    showError(friendlyAuthError(err));
    setLoading(appleBtn, false);
  }
});

function friendlyAuthError(err) {
  const map = {
    "auth/email-already-in-use": "That email already has an account. Try logging in instead.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/user-not-found": "No account found with that email.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/popup-closed-by-user": "That sign-in window was closed before finishing.",
    "auth/unauthorized-domain": "This domain isn't authorized for popup sign-in yet — add it under Authentication > Settings > Authorized domains in Firebase.",
    "auth/operation-not-allowed": "That sign-in method isn't enabled yet in the Firebase console."
  };
  return map[err.code] || `Something went wrong (${err.code || err.message}). Please try again.`;
}
