import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  subscribeConversations, subscribeMessages, sendMessage,
  markConversationRead, isUnread
} from "./messages.js";

const listEl = document.getElementById("conversationList");
const threadEl = document.getElementById("threadPanel");
let currentUid = null;
let conversations = [];
let activeId = new URLSearchParams(location.search).get("c");
let unsubMessages = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  currentUid = user.uid;
  subscribeConversations(user.uid, renderList);
});

function renderList(items) {
  conversations = items;
  if (!items.length) {
    listEl.innerHTML = `<p class="state-message">No conversations yet. Message an owner from a listing page to start one.</p>`;
    return;
  }
  if (!activeId) activeId = items[0].id;

  listEl.innerHTML = items.map(c => {
    const otherName = c.ownerId === currentUid ? "Renter" : "Owner";
    const unread = isUnread(c, currentUid);
    return `<button type="button" class="conversation-row ${c.id === activeId ? "active" : ""}" data-id="${c.id}">
      <div class="conversation-row-top">
        <span class="conversation-title">${escapeHtml(c.listingTitle || "Listing")}</span>
        ${unread ? '<span class="unread-dot"></span>' : ""}
      </div>
      <div class="conversation-preview">${escapeHtml(otherName)}: ${escapeHtml(c.lastMessage || "Say hello")}</div>
    </button>`;
  }).join("");

  listEl.querySelectorAll(".conversation-row").forEach(btn => {
    btn.addEventListener("click", () => openConversation(btn.dataset.id));
  });

  if (activeId) openConversation(activeId, true);
}

function openConversation(id, silent) {
  activeId = id;
  if (!silent) {
    history.replaceState(null, "", `messages.html?c=${id}`);
    listEl.querySelectorAll(".conversation-row").forEach(b => b.classList.toggle("active", b.dataset.id === id));
  }

  const conv = conversations.find(c => c.id === id);
  if (!conv) return;

  markConversationRead(id, currentUid).catch(console.error);

  threadEl.innerHTML = `
    <div class="thread-header">
      <div>
        <strong>${escapeHtml(conv.listingTitle || "Listing")}</strong>
        <div class="listing-meta"><a href="product.html?id=${conv.listingId}" class="text-link">View listing</a></div>
      </div>
    </div>
    <div class="thread-messages" id="threadMessages"><p class="state-message">Loading messages…</p></div>
    <form class="thread-composer" id="composerForm">
      <input id="composerInput" type="text" placeholder="Write a message…" autocomplete="off" maxlength="2000" required>
      <button class="primary-button" type="submit">Send</button>
    </form>`;

  unsubMessages?.();
  unsubMessages = subscribeMessages(id, renderMessages);

  document.getElementById("composerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("composerInput");
    const text = input.value;
    input.value = "";
    try {
      await sendMessage(id, text);
    } catch (err) {
      console.error(err);
    }
  });
}

function renderMessages(messages) {
  const el = document.getElementById("threadMessages");
  if (!el) return;
  el.innerHTML = messages.map(m => `
    <div class="thread-bubble ${m.senderId === currentUid ? "mine" : ""}">${escapeHtml(m.text)}</div>
  `).join("") || `<p class="state-message">Say hello 👋</p>`;
  el.scrollTop = el.scrollHeight;
}
