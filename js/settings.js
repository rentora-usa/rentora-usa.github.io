import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const form = document.getElementById("profileForm");
const message = document.getElementById("profileMessage");
const submitBtn = document.getElementById("profileSubmit");

function showMessage(text, isError = true) {
  message.textContent = text;
  message.className = isError ? "auth-error" : "auth-success";
  message.classList.remove("hidden");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  document.getElementById("accountEmail").textContent = user.email || "—";
  const providerId = user.providerData[0]?.providerId;
  document.getElementById("accountProvider").textContent =
    providerId === "google.com" ? "Google" : providerId === "apple.com" ? "Apple" : "Email & password";

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : {};

  document.getElementById("displayName").value = data.displayName || user.displayName || "";
  document.getElementById("location").value = data.location || "";
  document.getElementById("bio").value = data.bio || "";
  document.getElementById("photoURL").value = data.photoURL || user.photoURL || "";
  document.getElementById("accountCreated").textContent = data.createdAt?.toDate
    ? data.createdAt.toDate().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "—";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    message.classList.add("hidden");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving…";

    const displayName = document.getElementById("displayName").value.trim();
    const location = document.getElementById("location").value.trim();
    const bio = document.getElementById("bio").value.trim();
    const photoURL = document.getElementById("photoURL").value.trim();

    try {
      await setDoc(ref, { displayName, location, bio, photoURL }, { merge: true });
      await updateProfile(user, { displayName, photoURL });
      showMessage("Saved.", false);
    } catch (err) {
      console.error(err);
      showMessage(err.message || "Couldn't save your changes. Try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save changes";
    }
  });
});

document.getElementById("signOutBtn").addEventListener("click", async () => {
  await signOut(auth);
  location.href = "index.html";
});
