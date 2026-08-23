import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  isStaffUser, fetchStaffProfile, saveStaffProfile,
  subscribeAllTickets, subscribeTicketMessages, sendTicketMessage,
  claimTicket, setTicketStatus
} from "./support.js";

const root = document.getElementById("adminRoot");
let currentUid = null;
let myStaffProfile = null;
let tickets = [];
let activeId = null;
let activeFilter = "open";
let unsubMessages = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { root.innerHTML = `<p class="state-message">Sign in to continue.</p>`; return; }
  currentUid = user.uid;

  const staff = await isStaffUser(user.uid);
  if (!staff) {
    root.innerHTML = `<p class="state-message">This page is for Rentora staff only. If you think that's a mistake, contact whoever runs your Rentora instance.</p>`;
    return;
  }

  myStaffProfile = await fetchStaffProfile(user.uid);
  renderShell();
  subscribeAllTickets(items => { tickets = items; renderTicketList(); });
});

function renderShell() {
  root.innerHTML = `
    <div class="dash-header">
      <div><p class="eyebrow">Staff Admin</p><h1 style="font:700 34px Manrope;letter-spacing:-1.2px;margin:0">Support queue</h1></div>
      <button class="chip-btn" id="staffProfileBtn">My support identity</button>
    </div>

    <div class="tab-row" style="margin-top:24px">
      <button class="tab-btn active" data-filter="open">Open</button>
      <button class="tab-btn" data-filter="mine">Assigned to me</button>
      <button class="tab-btn" data-filter="closed">Closed</button>
    </div>

    <div class="messages-layout">
      <aside class="conversation-list" id="ticketList"><p class="state-message">Loading tickets…</p></aside>
      <section class="thread-panel" id="threadPanel"><div class="state-message">Pick a ticket to respond.</div></section>
    </div>
  `;

  root.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      root.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b === btn));
      activeFilter = btn.dataset.filter;
      renderTicketList();
    });
  });

  document.getElementById("staffProfileBtn").addEventListener("click", openStaffProfileDialog);
}

function renderTicketList() {
  const listEl = document.getElementById("ticketList");
  if (!listEl) return;

  const filtered = tickets.filter(t => {
    if (activeFilter === "open") return t.status === "open";
    if (activeFilter === "closed") return t.status === "closed";
    if (activeFilter === "mine") return t.assignedStaffId === currentUid;
    return true;
  });

  if (!filtered.length) {
    listEl.innerHTML = `<p class="state-message">Nothing here right now.</p>`;
    return;
  }

  listEl.innerHTML = filtered.map(t => `
    <button type="button" class="conversation-row ${t.id === activeId ? "active" : ""}" data-id="${t.id}">
      <div class="conversation-row-top">
        <span class="conversation-title">${escapeHtml(t.subject)}</span>
        <span class="status-badge status-${t.status}" style="font-size:9px">${t.status}</span>
      </div>
      <div class="conversation-preview">${escapeHtml(t.userName)} · ${escapeHtml(t.lastMessage || "No messages yet")}</div>
    </button>`).join("");

  listEl.querySelectorAll(".conversation-row").forEach(btn => {
    btn.addEventListener("click", () => openTicket(btn.dataset.id));
  });

  // Keep the open thread in sync with live ticket updates (status, claim).
  if (activeId && filtered.some(t => t.id === activeId)) openTicket(activeId, true);
}

function openTicket(id, silent) {
  activeId = id;
  if (!silent) {
    document.querySelectorAll("#ticketList .conversation-row").forEach(b => b.classList.toggle("active", b.dataset.id === id));
  }

  const ticket = tickets.find(t => t.id === id);
  const threadEl = document.getElementById("threadPanel");
  if (!ticket || !threadEl) return;

  const isMine = ticket.assignedStaffId === currentUid;

  threadEl.innerHTML = `
    <div class="thread-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div>
        <strong>${escapeHtml(ticket.subject)}</strong>
        <div class="listing-meta">From ${escapeHtml(ticket.userName)} · ${ticket.assignedStaffName ? `Assigned to ${escapeHtml(ticket.assignedStaffName)}` : "Unclaimed"}</div>
      </div>
      <div style="display:flex;gap:8px">
        ${!isMine ? `<button class="chip-btn" id="claimBtn">Claim ticket</button>` : ""}
        <button class="chip-btn" id="toggleStatusBtn">${ticket.status === "open" ? "Close" : "Reopen"}</button>
      </div>
    </div>
    <div class="thread-messages" id="threadMessages"><p class="state-message">Loading messages…</p></div>
    <form class="thread-composer" id="composerForm">
      <input id="composerInput" type="text" placeholder="Reply as ${escapeHtml(myStaffProfile?.displayName || 'Support')}…" autocomplete="off" maxlength="2000" required>
      <button class="primary-button" type="submit">Send</button>
    </form>`;

  document.getElementById("claimBtn")?.addEventListener("click", async () => {
    try { await claimTicket(id, currentUid, myStaffProfile?.displayName || "Support"); }
    catch (err) { console.error(err); }
  });

  document.getElementById("toggleStatusBtn").addEventListener("click", async () => {
    try { await setTicketStatus(id, ticket.status === "open" ? "closed" : "open"); }
    catch (err) { console.error(err); }
  });

  unsubMessages?.();
  unsubMessages = subscribeTicketMessages(id, renderMessages);

  document.getElementById("composerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!myStaffProfile) { openStaffProfileDialog(); return; }
    const input = document.getElementById("composerInput");
    const text = input.value;
    input.value = "";
    try {
      await sendTicketMessage(id, text, { isStaff: true, staffName: myStaffProfile.displayName });
    } catch (err) { console.error(err); }
  });
}

function renderMessages(messages) {
  const el = document.getElementById("threadMessages");
  if (!el) return;
  el.innerHTML = messages.map(m => `
    ${m.senderId !== currentUid ? `<div class="thread-sender-name">${escapeHtml(m.senderName)}${m.senderRole === "staff" ? " · Staff" : ""}</div>` : ""}
    <div class="thread-bubble ${m.senderId === currentUid ? "mine" : ""}">${escapeHtml(m.text)}</div>
  `).join("") || `<p class="state-message">No messages yet.</p>`;
  el.scrollTop = el.scrollHeight;
}

function openStaffProfileDialog() {
  const overlay = document.createElement("div");
  overlay.className = "review-overlay";
  overlay.innerHTML = `
    <div class="review-dialog">
      <h3 style="margin:0 0 4px">Your support identity</h3>
      <p class="muted" style="margin:0 0 18px">This name and photo show up to users chatting with you — separate from your personal Rentora profile.</p>
      <label style="font-weight:600;font-size:13px">Display name<input id="staffNameInput" type="text" maxlength="80" style="width:100%;border:1px solid #ddd;border-radius:11px;padding:12px;margin-top:6px" value="${escapeHtml(myStaffProfile?.displayName || "")}"></label>
      <label style="font-weight:600;font-size:13px;display:block;margin-top:14px">Photo URL<input id="staffPhotoInput" type="text" style="width:100%;border:1px solid #ddd;border-radius:11px;padding:12px;margin-top:6px" value="${escapeHtml(myStaffProfile?.photoURL || "")}"></label>
      <p id="staffProfileError" class="auth-error hidden"></p>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="primary-button" id="staffProfileSave" style="flex:1">Save</button>
        <button class="chip-btn" id="staffProfileCancel">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector("#staffProfileCancel").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector("#staffProfileSave").addEventListener("click", async () => {
    const errorBox = overlay.querySelector("#staffProfileError");
    const displayName = overlay.querySelector("#staffNameInput").value.trim();
    const photoURL = overlay.querySelector("#staffPhotoInput").value.trim();
    if (!displayName) { errorBox.textContent = "Pick a display name."; errorBox.classList.remove("hidden"); return; }
    try {
      await saveStaffProfile(currentUid, { displayName, photoURL });
      myStaffProfile = { displayName, photoURL };
      overlay.remove();
    } catch (err) {
      console.error(err);
      errorBox.textContent = "Couldn't save. Try again.";
      errorBox.classList.remove("hidden");
    }
  });
}
