// Loaded on every page (except the auth page). Swaps the header's avatar
// button and "List an item" link based on real Firebase Auth state.
import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  const avatarBtn = document.querySelector(".avatar-button");
  const hostLink = document.querySelector(".host-link");
  if (!avatarBtn) return;

  if (user) {
    const initial = (user.displayName || user.email || "U").trim().charAt(0).toUpperCase();
    avatarBtn.textContent = initial;
    avatarBtn.title = "Log out";
    avatarBtn.href = "#";
    avatarBtn.onclick = async (e) => {
      e.preventDefault();
      await signOut(auth);
      location.href = "index.html";
    };
    if (hostLink) hostLink.href = "create-listing.html";
  } else {
    avatarBtn.textContent = "♙";
    avatarBtn.title = "Account";
    avatarBtn.href = "login.html";
    avatarBtn.onclick = null;
    if (hostLink) hostLink.href = "login.html";
  }
});
