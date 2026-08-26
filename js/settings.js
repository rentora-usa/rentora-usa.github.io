import { auth, db, googleProvider, appleProvider } from "./firebase.js";
import {
  onAuthStateChanged, signOut, updateProfile,
  verifyBeforeUpdateEmail, updatePassword, deleteUser,
  reauthenticateWithCredential, reauthenticateWithPopup, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const form = document.getElementById("profileForm");
const message = document.getElementById("profileMessage");
const submitBtn = document.getElementById("profileSubmit");

function showMessage(el, text, isError = true) {
  el.textContent = text;
  el.className = isError ? "auth-error" : "auth-success";
  el.classList.remove("hidden");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  document.getElementById("accountEmail").textContent = user.email || "—";
  const providerId = user.providerData[0]?.providerId;
  const providerLabel = providerId === "google.com" ? "Google" : providerId === "apple.com" ? "Apple" : "Email & password";
  document.getElementById("accountProvider").textContent = providerLabel;

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
      showMessage(message, "Saved.", false);
    } catch (err) {
      console.error(err);
      showMessage(message, err.message || "Couldn't save your changes. Try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save changes";
    }
  });

  renderSecurity(user, providerId, providerLabel);
});

document.getElementById("signOutBtn").addEventListener("click", async () => {
  await signOut(auth);
  location.href = "index.html";
});

// ---------- Security: change email / change password ----------
// Only meaningful for password-provider accounts — Google/Apple accounts
// don't have a password on Rentora's side, and changing their email here
// would desync from what the provider reports, so those show an
// explanatory note instead of forms that would just fail or mislead.
function renderSecurity(user, providerId, providerLabel) {
  const body = document.getElementById("securityBody");

  if (providerId !== "password") {
    body.innerHTML = `<p class="muted">You sign in with ${providerLabel} — your password and email are managed through your ${providerLabel} account, not here.</p>`;
    return;
  }

  body.innerHTML = `
    <form id="emailForm">
      <label>New email<input id="newEmail" type="email" required></label>
      <label>Current password<input id="emailCurrentPassword" type="password" required autocomplete="current-password"></label>
      <button class="primary-button full" type="submit" id="emailSubmit">Update email</button>
    </form>
    <p id="emailMessage" class="auth-error hidden"></p>

    <hr style="margin:28px 0;border:0;border-top:1px solid var(--line)">

    <form id="passwordForm">
      <label>Current password<input id="currentPassword" type="password" required autocomplete="current-password"></label>
      <label>New password<input id="newPassword" type="password" minlength="6" required autocomplete="new-password"></label>
      <label>Confirm new password<input id="confirmNewPassword" type="password" minlength="6" required autocomplete="new-password"></label>
      <button class="primary-button full" type="submit" id="passwordSubmit">Update password</button>
    </form>
    <p id="passwordMessage" class="auth-error hidden"></p>
  `;

  const emailForm = document.getElementById("emailForm");
  const emailMessage = document.getElementById("emailMessage");
  emailForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    emailMessage.classList.add("hidden");
    const submit = document.getElementById("emailSubmit");
    const newEmail = document.getElementById("newEmail").value.trim();
    const currentPassword = document.getElementById("emailCurrentPassword").value;

    submit.disabled = true;
    submit.textContent = "Sending confirmation…";
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await verifyBeforeUpdateEmail(user, newEmail);
      showMessage(emailMessage, `Check ${newEmail} for a confirmation link — the change applies once you click it.`, false);
      emailForm.reset();
    } catch (err) {
      console.error(err);
      showMessage(emailMessage, friendlyAuthError(err));
    } finally {
      submit.disabled = false;
      submit.textContent = "Update email";
    }
  });

  const passwordForm = document.getElementById("passwordForm");
  const passwordMessage = document.getElementById("passwordMessage");
  passwordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    passwordMessage.classList.add("hidden");
    const submit = document.getElementById("passwordSubmit");
    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmNewPassword = document.getElementById("confirmNewPassword").value;

    if (newPassword !== confirmNewPassword) {
      showMessage(passwordMessage, "New passwords don't match.");
      return;
    }

    submit.disabled = true;
    submit.textContent = "Updating…";
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, newPassword);
      showMessage(passwordMessage, "Password updated.", false);
      passwordForm.reset();
    } catch (err) {
      console.error(err);
      showMessage(passwordMessage, friendlyAuthError(err));
    } finally {
      submit.disabled = false;
      submit.textContent = "Update password";
    }
  });
}

// ---------- Delete account ----------
document.getElementById("deleteAccountBtn").addEventListener("click", () => {
  const user = auth.currentUser;
  if (!user) return;
  openDeleteAccountDialog(user);
});

function openDeleteAccountDialog(user) {
  const providerId = user.providerData[0]?.providerId;
  const isPassword = providerId === "password";
  const providerLabel = providerId === "google.com" ? "Google" : providerId === "apple.com" ? "Apple" : "Email & password";

  const overlay = document.createElement("div");
  overlay.className = "review-overlay";
  overlay.innerHTML = `
    <div class="review-dialog">
      <h3 style="margin:0 0 4px">Delete your account</h3>
      <p class="muted" style="margin:0 0 18px">This permanently deletes your Rentora login. Your listings, reviews, and messages stay behind — this can't be undone.</p>
      <label style="font-weight:600;font-size:13px">Type DELETE to confirm<input id="deleteConfirmInput" type="text" style="width:100%;border:1px solid #ddd;border-radius:11px;padding:12px;margin-top:6px"></label>
      ${isPassword ? `
        <label style="font-weight:600;font-size:13px;display:block;margin-top:14px">Current password<input id="deletePasswordInput" type="password" style="width:100%;border:1px solid #ddd;border-radius:11px;padding:12px;margin-top:6px"></label>
      ` : `
        <p class="demo-note" style="margin-top:14px">You'll be asked to confirm with ${providerLabel} before this completes.</p>
      `}
      <p id="deleteDialogError" class="auth-error hidden"></p>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="chip-btn danger" id="deleteConfirmBtn" style="flex:1">Delete my account</button>
        <button class="chip-btn" id="deleteCancelBtn">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector("#deleteCancelBtn").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector("#deleteConfirmBtn").addEventListener("click", async () => {
    const errorBox = overlay.querySelector("#deleteDialogError");
    const typed = overlay.querySelector("#deleteConfirmInput").value.trim();
    if (typed !== "DELETE") {
      errorBox.textContent = 'Type "DELETE" (all caps) to confirm.';
      errorBox.classList.remove("hidden");
      return;
    }

    const submit = overlay.querySelector("#deleteConfirmBtn");
    submit.disabled = true;
    submit.textContent = "Deleting…";
    try {
      if (isPassword) {
        const password = overlay.querySelector("#deletePasswordInput").value;
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      } else {
        const provider = providerId === "google.com" ? googleProvider : appleProvider;
        await reauthenticateWithPopup(user, provider);
      }
      await deleteUser(user);
      overlay.remove();
      location.href = "index.html";
    } catch (err) {
      console.error(err);
      errorBox.textContent = friendlyAuthError(err);
      errorBox.classList.remove("hidden");
      submit.disabled = false;
      submit.textContent = "Delete my account";
    }
  });
}

function friendlyAuthError(err) {
  const map = {
    "auth/wrong-password": "That password doesn't match your account.",
    "auth/invalid-credential": "That password doesn't match your account.",
    "auth/email-already-in-use": "That email is already in use by another account.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/requires-recent-login": "For security, please try again — this needs a fresh confirmation.",
    "auth/popup-closed-by-user": "That confirmation window was closed before finishing."
  };
  return map[err.code] || `Something went wrong (${err.code || err.message}). Please try again.`;
}
