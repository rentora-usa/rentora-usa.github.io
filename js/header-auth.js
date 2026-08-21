// Loaded on every page. Drives the account dropdown in the header, the
// unread-messages badge, fluid sign-in/out, and guards pages that require
// an account.
import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { subscribeConversations, isUnread } from "./messages.js";

const PROTECTED_PAGES = ["settings.html", "dashboard.html", "create-listing.html", "messages.html"];

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

let unsubConversations = null;

onAuthStateChanged(auth, (user) => {
  document.body.classList.remove("auth-pending");

  const avatarBtn = document.getElementById("avatarButton");
  const dropdown = document.getElementById("accountDropdown");
  const hostLink = document.querySelector(".host-link");

  unsubConversations?.();
  unsubConversations = null;

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
          <a href="messages.html">Messages<span class="nav-badge hidden" id="dropdownMsgBadge">0</span></a>
          <a href="profile.html?uid=${user.uid}">View my profile</a>
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

      // Live unread-messages count, reflected as a badge on the dropdown
      // entry and on the "Messages" nav link if the page has one.
      unsubConversations = subscribeConversations(user.uid, (conversations) => {
        const unreadCount = conversations.filter(c => isUnread(c, user.uid)).length;
        const navBadge = document.getElementById("messagesBadge");
        const dropdownBadge = document.getElementById("dropdownMsgBadge");
        [navBadge, dropdownBadge].forEach(el => {
          if (!el) return;
          el.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
          el.classList.toggle("hidden", unreadCount === 0);
        });
      });
    } else {
      avatarBtn.textContent = "♙";
      avatarBtn.setAttribute("aria-label", "Log in");
      avatarBtn.onclick = (e) => { e.preventDefault(); location.href = loginUrl(); };
      if (dropdown) dropdown.innerHTML = "";
      closeDropdown();
      document.getElementById("messagesBadge")?.classList.add("hidden");
    }
  }

  if (hostLink) {
    hostLink.href = user ? "create-listing.html" : loginUrl();
  }

  const messagesLink = document.getElementById("messagesNavLink");
  if (messagesLink) messagesLink.classList.toggle("hidden", !user);

  if (!user && PROTECTED_PAGES.includes(currentPage())) {
    location.href = loginUrl();
  }
});
