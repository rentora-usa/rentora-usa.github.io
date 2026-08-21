// Loaded on every page. Drives the account dropdown in the header, keeps
// sign-in/out fluid (no full reloads on public pages), and redirects away
// from pages that require an account.
import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

const PROTECTED_PAGES = ["settings.html", "dashboard.html", "create-listing.html"];

function currentPage() {
  return location.pathname.split("/").pop() || "index.html";
}

function loginUrl() {
  return `login.html?next=${encodeURIComponent(currentPage() + location.search)}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function closeDropdown() {
  document.getElementById("accountDropdown")?.classList.remove("open");
}

function toggleDropdown() {
  document.getElementById("accountDropdown")?.classList.toggle("open");
}

document.addEventListener("click", (e) => {
  const menu = document.querySelector(".account-menu");
  if (menu && !menu.contains(e.target)) closeDropdown();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDropdown();
});

onAuthStateChanged(auth, (user) => {
  document.body.classList.remove("auth-pending");

  const avatarBtn = document.getElementById("avatarButton");
  const dropdown = document.getElementById("accountDropdown");
  const hostLink = document.querySelector(".host-link");

  if (avatarBtn) {
    if (user) {
      const label = user.displayName || (user.email ? user.email.split("@")[0] : "Account");
      avatarBtn.textContent = label.trim().charAt(0).toUpperCase();
      avatarBtn.setAttribute("aria-label", "Account menu");
      avatarBtn.onclick = (e) => { e.preventDefault(); toggleDropdown(); };

      if (dropdown) {
        dropdown.innerHTML = `
          <div class="dropdown-user">
            <div class="dropdown-name">${escapeHtml(label)}</div>
            <div class="dropdown-email">${escapeHtml(user.email || "")}</div>
          </div>
          <a href="dashboard.html">My listings &amp; rentals</a>
          <a href="settings.html">Settings</a>
          <button type="button" id="dropdownLogout" class="logout-btn">Log out</button>
        `;
        document.getElementById("dropdownLogout").addEventListener("click", async () => {
          closeDropdown();
          await signOut(auth);
          // Fluid sign-out: on public pages we just update the header in
          // place (this same callback fires again with user=null) rather
          // than yanking the person off whatever they're looking at.
          if (PROTECTED_PAGES.includes(currentPage())) location.href = "index.html";
        });
      }
    } else {
      avatarBtn.textContent = "♙";
      avatarBtn.setAttribute("aria-label", "Log in");
      avatarBtn.onclick = (e) => { e.preventDefault(); location.href = loginUrl(); };
      if (dropdown) dropdown.innerHTML = "";
      closeDropdown();
    }
  }

  if (hostLink) {
    hostLink.href = user ? "create-listing.html" : loginUrl();
  }

  if (!user && PROTECTED_PAGES.includes(currentPage())) {
    location.href = loginUrl();
  }
});
