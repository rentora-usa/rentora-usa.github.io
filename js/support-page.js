import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  createTicket, subscribeMyTickets, subscribeTicketMessages,
  sendTicketMessage, setTicketStatus
} from "./support.js";

const listEl = document.getElementById("ticketList");
const threadEl = document.getElementById("threadPanel");
let currentUid = null;
let tickets = [];
let activeId = new URLSearchParams(location.search).get("t");
let unsubMessages = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

onAuthStateChanged(auth, (user) => {
  if (!user) return; // header-auth.js already redirects signed-out visitors here
  currentUid = user.uid;
  subscribeMyTickets(user.uid, renderList);
});

document.getElementById("newTicketBtn").addEventListener("click", async () => {
  const subject = prompt("What's this about? (a short subject line)");
  if (!subject || !subject.trim()) return;
  const message = prompt("Describe the issue — support will reply here.");
  if (!message || !message.trim()) return;
  try {
    const id = await createTicket(subject, message);
    activeId = id;
    history.replaceState(null, "", `support.html?t=${id}`);
  } catch (err) {
    console.error(err);
    alert("Couldn't open a ticket. Try again.");
  }
});

function renderList(items) {
  tickets = items;
  if (!items.length) {
    listEl.innerHTML = `<p class="state-message">No tickets yet. Click "New ticket" if you need a hand.</p>`;
    return;
  }
  if (!activeId) activeId = items[0].id;

  listEl.innerHTML = items.map(t => `
    <button type="button" class="conversation-row ${t.id === activeId ? "active" : ""}" data-id="${t.id}">
      <div class="conversation-row-top">
        <span class="conversation-title">${escapeHtml(t.subject)}</span>
        <span class="status-badge status-${t.status}" style="font-size:9px">${t.status}</span>
      </div>
      <div class="conversation-preview">${escapeHtml(t.lastMessage || "No messages yet")}</div>
    </button>`).join("");

  listEl.querySelectorAll(".conversation-row").forEach(btn => {
    btn.addEventListener("click", () => openTicket(btn.dataset.id));
  });

  openTicket(activeId, true);
}

function openTicket(id, silent) {
  activeId = id;
  if (!silent) {
    history.replaceState(null, "", `support.html?t=${id}`);
    listEl.querySelectorAll(".conversation-row").forEach(b => b.classList.toggle("active", b.dataset.id === id));
  }

  const ticket = tickets.find(t => t.id === id);
  if (!ticket) return;

  threadEl.innerHTML = `
    <div class="thread-header" style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <strong>${escapeHtml(ticket.subject)}</strong>
        <div class="listing-meta">${ticket.assignedStaffName ? `Assigned to ${escapeHtml(ticket.assignedStaffName)}` : "Waiting for a support agent"}</div>
      </div>
      <button class="chip-btn" id="toggleStatusBtn">${ticket.status === "open" ? "Close ticket" : "Reopen"}</button>
    </div>
    <div class="thread-messages" id="threadMessages"><p class="state-message">Loading messages…</p></div>
    <form class="thread-composer" id="composerForm">
      <input id="composerInput" type="text" placeholder="Reply to support…" autocomplete="off" maxlength="2000" required>
      <button class="primary-button" type="submit">Send</button>
    </form>`;

  document.getElementById("toggleStatusBtn").addEventListener("click", async () => {
    try { await setTicketStatus(id, ticket.status === "open" ? "closed" : "open"); }
    catch (err) { console.error(err); }
  });

  unsubMessages?.();
  unsubMessages = subscribeTicketMessages(id, renderMessages);

  document.getElementById("composerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("composerInput");
    const text = input.value;
    input.value = "";
    try { await sendTicketMessage(id, text, { isStaff: false }); }
    catch (err) { console.error(err); }
  });
}

function renderMessages(messages) {
  const el = document.getElementById("threadMessages");
  if (!el) return;
  el.innerHTML = messages.map(m => `
    ${m.senderId !== currentUid ? `<div class="thread-sender-name">${escapeHtml(m.senderName || "Support")}</div>` : ""}
    <div class="thread-bubble ${m.senderId === currentUid ? "mine" : ""}">${escapeHtml(m.text)}</div>
  `).join("") || `<p class="state-message">Tell us what's going on — we'll get back to you here.</p>`;
  el.scrollTop = el.scrollHeight;
}
