import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  createTicket, subscribeMyTickets, subscribeTicketMessages,
  sendTicketMessage, closeTicket, reopenTicket, TICKET_STAGES
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

function renderStageTracker(status) {
  const idx = TICKET_STAGES.findIndex(s => s.id === status);
  return `<div class="stage-tracker">${TICKET_STAGES.map((s, i) => {
    const state = i < idx ? "done" : i === idx ? "done active" : "";
    const line = i < TICKET_STAGES.length - 1 ? `<div class="stage-line ${i < idx ? "done" : ""}"></div>` : "";
    return `<div class="stage-step ${state}"><span class="stage-dot"></span><span class="stage-label">${s.label}</span></div>${line}`;
  }).join("")}</div>`;
}

onAuthStateChanged(auth, (user) => {
  if (!user) return; // header-auth.js already redirects signed-out visitors here
  currentUid = user.uid;
  subscribeMyTickets(user.uid, renderList);

  if (new URLSearchParams(location.search).get("new") === "1") {
    openNewTicketDialog();
  }
});

document.getElementById("newTicketBtn").addEventListener("click", openNewTicketDialog);

function openNewTicketDialog() {
  const overlay = document.createElement("div");
  overlay.className = "review-overlay";
  overlay.innerHTML = `
    <div class="review-dialog">
      <h3 style="margin:0 0 4px">Open a ticket</h3>
      <p class="muted" style="margin:0 0 18px">Tell us what's going on — a real person will reply here.</p>
      <label style="font-weight:600;font-size:13px">Subject<input id="ticketSubject" type="text" maxlength="150" style="width:100%;border:1px solid #ddd;border-radius:11px;padding:12px;margin-top:6px" placeholder="A short summary"></label>
      <label style="font-weight:600;font-size:13px;display:block;margin-top:14px">What's going on?<textarea id="ticketMessage" rows="5" maxlength="2000" style="width:100%;border:1px solid #ddd;border-radius:11px;padding:12px;margin-top:6px;font-family:inherit" placeholder="Include any details that would help — a listing, a rental, another person's name..."></textarea></label>
      <p id="ticketDialogError" class="auth-error hidden"></p>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="primary-button" id="ticketSubmit" style="flex:1">Open ticket</button>
        <button class="chip-btn" id="ticketCancel">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#ticketSubject").focus();

  const close = () => {
    overlay.remove();
    const url = new URL(location.href);
    url.searchParams.delete("new");
    history.replaceState(null, "", url.pathname + url.search);
  };

  overlay.querySelector("#ticketCancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.querySelector("#ticketSubmit").addEventListener("click", async () => {
    const errorBox = overlay.querySelector("#ticketDialogError");
    const submitBtn = overlay.querySelector("#ticketSubmit");
    const subject = overlay.querySelector("#ticketSubject").value.trim();
    const message = overlay.querySelector("#ticketMessage").value.trim();
    if (!subject) { errorBox.textContent = "Give it a short subject line."; errorBox.classList.remove("hidden"); return; }
    if (!message) { errorBox.textContent = "Add a bit of detail so we know what's going on."; errorBox.classList.remove("hidden"); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = "Opening…";
    try {
      const id = await createTicket(subject, message);
      activeId = id;
      close();
      history.replaceState(null, "", `support.html?t=${id}`);
    } catch (err) {
      console.error(err);
      errorBox.textContent = "Couldn't open the ticket. Try again.";
      errorBox.classList.remove("hidden");
      submitBtn.disabled = false;
      submitBtn.textContent = "Open ticket";
    }
  });
}

function renderList(items) {
  tickets = items;
  if (!items.length) {
    listEl.innerHTML = `<div class="empty-thread" style="padding:40px 16px"><div class="empty-thread-icon">🎫</div><p>No tickets yet.</p></div>`;
    return;
  }
  if (!activeId) activeId = items[0].id;

  listEl.innerHTML = items.map(t => `
    <button type="button" class="conversation-row ${t.id === activeId ? "active" : ""}" data-id="${t.id}">
      <div class="conversation-row-top">
        <span class="conversation-title">${escapeHtml(t.subject)}</span>
        <span class="status-badge status-${t.status}" style="font-size:9px">${escapeHtml((TICKET_STAGES.find(s => s.id === t.status) || {}).label || t.status)}</span>
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
  const isClosed = ticket.status === "closed";

  threadEl.innerHTML = `
    <div class="thread-header" style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <strong>${escapeHtml(ticket.subject)}</strong>
        <div class="listing-meta">${ticket.assignedStaffName ? `Assigned to ${escapeHtml(ticket.assignedStaffName)}` : "Waiting for a support agent"}</div>
      </div>
      ${!isClosed ? `<button class="chip-btn" id="closeBtn">Close ticket</button>` : ""}
    </div>
    ${renderStageTracker(ticket.status)}
    <div class="thread-messages" id="threadMessages"><p class="state-message">Loading messages…</p></div>
    ${isClosed ? `
      <div class="ticket-closed-banner">
        <span>This ticket is closed. Reopen it if you need to add anything else.</span>
        <button class="chip-btn" id="reopenBtn">Reopen ticket</button>
      </div>
    ` : `
      <form class="thread-composer" id="composerForm">
        <textarea id="composerInput" rows="1" placeholder="Reply to support…" maxlength="2000" required></textarea>
        <button class="primary-button" type="submit">Send</button>
      </form>
      <div class="composer-hint">Enter to send · Shift+Enter for a new line</div>
    `}`;

  document.getElementById("closeBtn")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try { await closeTicket(id); }
    catch (err) { console.error(err); e.target.disabled = false; }
  });

  document.getElementById("reopenBtn")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try { await reopenTicket(id); }
    catch (err) { console.error(err); e.target.disabled = false; }
  });

  unsubMessages?.();
  unsubMessages = subscribeTicketMessages(id, renderMessages);

  const input = document.getElementById("composerInput");
  const form = document.getElementById("composerForm");
  if (input) {
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = `${input.scrollHeight}px`;
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
  }
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = "";
    input.style.height = "auto";
    try { await sendTicketMessage(id, text, { isStaff: false, currentStatus: ticket.status }); }
    catch (err) { console.error(err); }
  });
}

function renderMessages(messages) {
  const el = document.getElementById("threadMessages");
  if (!el) return;
  el.innerHTML = messages.map(m => `
    ${m.senderId !== currentUid ? `<div class="thread-sender-name">${escapeHtml(m.senderName || "Support")}</div>` : ""}
    <div class="thread-bubble ${m.senderId === currentUid ? "mine" : ""}">${escapeHtml(m.text).replace(/\n/g, "<br>")}</div>
  `).join("") || `<div class="empty-thread" style="padding:30px 16px"><p>Tell us what's going on — we'll get back to you here.</p></div>`;
  el.scrollTop = el.scrollHeight;
}
