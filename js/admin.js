import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  isStaffUser, fetchStaffProfile, saveStaffProfile,
  subscribeAllTickets, subscribeTicketMessages, sendTicketMessage,
  claimTicket, setTicketStatus
} from "./support.js";
import {
  listUsers, searchUsersByEmail, setAccountDisabled, forceSignOut,
  sendPasswordReset, deleteAccount, adminWorkerConfigured
} from "./admin-users.js";
import { fetchAllListingsForStaff, setListingAvailability, deleteListing } from "./listings.js";
import { fetchRequestsForListing } from "./rentals.js";

const root = document.getElementById("adminRoot");
let currentUid = null;
let myStaffProfile = null;
let activeSection = "tickets";

// Tickets section state
let tickets = [];
let activeTicketId = null;
let activeTicketFilter = "open";
let unsubMessages = null;

// Listings section state
let allListingsCache = [];
let activeListingId = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtEpochMs(ms) {
  if (!ms) return "—";
  return new Date(Number(ms)).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
async function logStaffAction(action, targetType, targetId, details) {
  try {
    await addDoc(collection(db, "adminAuditLog"), {
      staffId: currentUid, staffName: myStaffProfile?.displayName || "",
      action, targetType, targetId, details, createdAt: serverTimestamp()
    });
  } catch (err) { console.error("audit log write failed", err); }
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
  subscribeAllTickets(items => { tickets = items; if (activeSection === "tickets") renderTicketList(); });
});

function renderShell() {
  root.innerHTML = `
    <div class="dash-header">
      <div><p class="eyebrow">Staff Admin</p><h1 style="font:700 34px Manrope;letter-spacing:-1.2px;margin:0">Admin</h1></div>
      <button class="chip-btn" id="staffProfileBtn">My support identity</button>
    </div>

    <div class="tab-row" style="margin-top:24px">
      <button class="tab-btn active" data-section="tickets">🎫 Tickets</button>
      <button class="tab-btn" data-section="users">👥 Users</button>
      <button class="tab-btn" data-section="listings">🏷️ Listings</button>
    </div>

    <div id="sectionBody" style="margin-top:24px"></div>
  `;

  root.querySelectorAll(".tab-btn[data-section]").forEach(btn => {
    btn.addEventListener("click", () => {
      root.querySelectorAll(".tab-btn[data-section]").forEach(b => b.classList.toggle("active", b === btn));
      activeSection = btn.dataset.section;
      renderSection();
    });
  });

  document.getElementById("staffProfileBtn").addEventListener("click", openStaffProfileDialog);
  renderSection();
}

function renderSection() {
  unsubMessages?.();
  unsubMessages = null;
  const body = document.getElementById("sectionBody");
  if (activeSection === "tickets") renderTicketsSection(body);
  else if (activeSection === "users") renderUsersSection(body);
  else renderListingsSection(body);
}

// ================= Tickets =================

function renderTicketsSection(body) {
  body.innerHTML = `
    <div class="tab-row" style="margin:0 0 20px">
      <button class="tab-btn active" data-filter="open">Open</button>
      <button class="tab-btn" data-filter="mine">Assigned to me</button>
      <button class="tab-btn" data-filter="closed">Closed</button>
    </div>
    <div class="messages-layout">
      <aside class="conversation-list" id="ticketList"><p class="state-message">Loading tickets…</p></aside>
      <section class="thread-panel" id="threadPanel">
        <div class="empty-thread"><div class="empty-thread-icon">🎫</div><h3>No ticket selected</h3><p>Pick a ticket from the list to respond.</p></div>
      </section>
    </div>
  `;
  body.querySelectorAll(".tab-btn[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      body.querySelectorAll(".tab-btn[data-filter]").forEach(b => b.classList.toggle("active", b === btn));
      activeTicketFilter = btn.dataset.filter;
      renderTicketList();
    });
  });
  renderTicketList();
}

function renderTicketList() {
  const listEl = document.getElementById("ticketList");
  if (!listEl) return;

  const filtered = tickets.filter(t => {
    if (activeTicketFilter === "open") return t.status === "open";
    if (activeTicketFilter === "closed") return t.status === "closed";
    if (activeTicketFilter === "mine") return t.assignedStaffId === currentUid;
    return true;
  });

  if (!filtered.length) {
    listEl.innerHTML = `<p class="state-message">Nothing here right now.</p>`;
    return;
  }

  listEl.innerHTML = filtered.map(t => `
    <button type="button" class="conversation-row ${t.id === activeTicketId ? "active" : ""}" data-id="${t.id}">
      <div class="conversation-row-top">
        <span class="conversation-title">${escapeHtml(t.subject)}</span>
        <span class="status-badge status-${t.status}" style="font-size:9px">${t.status}</span>
      </div>
      <div class="conversation-preview">${escapeHtml(t.userName)} · ${escapeHtml(t.lastMessage || "No messages yet")}</div>
    </button>`).join("");

  listEl.querySelectorAll(".conversation-row").forEach(btn => {
    btn.addEventListener("click", () => openTicket(btn.dataset.id));
  });

  if (activeTicketId && filtered.some(t => t.id === activeTicketId)) openTicket(activeTicketId, true);
}

function openTicket(id, silent) {
  activeTicketId = id;
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
    try {
      await claimTicket(id, currentUid, myStaffProfile?.displayName || "Support");
      await logStaffAction("claim_ticket", "ticket", id, ticket.subject);
    } catch (err) { console.error(err); }
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

// ================= Users =================

function renderUsersSection(body) {
  body.innerHTML = `
    ${!adminWorkerConfigured() ? `<p class="demo-note" style="margin-bottom:16px">The admin Worker isn't configured yet (js/admin-config.js) — user management is unavailable until it's deployed. See README §11.</p>` : ""}
    <div class="search-field" style="border:1px solid #ddd;border-radius:14px;padding:4px 18px;max-width:420px;margin-bottom:20px">
      <span>⌕</span>
      <input id="userSearchInput" type="search" placeholder="Search by email…" autocomplete="off">
    </div>
    <div id="userListBody"><p class="state-message">Loading users…</p></div>
  `;
  const searchInput = document.getElementById("userSearchInput");
  let debounceTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => loadUsers(searchInput.value.trim()), 300);
  });
  loadUsers("");
}

async function loadUsers(search) {
  const listBody = document.getElementById("userListBody");
  if (!listBody) return;
  if (!adminWorkerConfigured()) { listBody.innerHTML = ""; return; }

  listBody.innerHTML = `<p class="state-message">Loading users…</p>`;
  try {
    const { users } = search ? await searchUsersByEmail(search) : await listUsers();
    if (!users.length) { listBody.innerHTML = `<p class="state-message">No users found.</p>`; return; }
    listBody.innerHTML = `<div class="manage-list">${users.map(userRow).join("")}</div>`;
    users.forEach(wireUserActions);
  } catch (err) {
    console.error(err);
    listBody.innerHTML = `<p class="state-message">Couldn't load users: ${escapeHtml(err.message)}</p>`;
  }
}

function userRow(u) {
  return `<div class="manage-row" style="flex-wrap:wrap">
    <div class="manage-info">
      <h3>${escapeHtml(u.displayName || "(no name)")} ${u.disabled ? '<span class="status-badge status-declined">disabled</span>' : ""}</h3>
      <div class="manage-meta">${escapeHtml(u.email)} · ${u.providerIds.length ? u.providerIds.join(", ") : "email/password"} · joined ${fmtEpochMs(u.createdAt)}</div>
    </div>
    <div class="manage-actions">
      <a class="chip-btn" href="profile.html?uid=${u.uid}" target="_blank">View profile</a>
      <button class="chip-btn" id="reset-${u.uid}">Send password reset</button>
      <button class="chip-btn" id="signout-${u.uid}">Force sign-out</button>
      <button class="chip-btn ${u.disabled ? "" : "danger"}" id="toggle-disabled-${u.uid}">${u.disabled ? "Enable account" : "Disable account"}</button>
      <button class="chip-btn danger" id="delete-user-${u.uid}">Delete account</button>
    </div>
  </div>`;
}

function wireUserActions(u) {
  document.getElementById(`reset-${u.uid}`)?.addEventListener("click", async (e) => {
    e.target.disabled = true; e.target.textContent = "Sending…";
    try {
      await sendPasswordReset(u.uid, u.email);
      await logStaffAction("send_password_reset", "user", u.uid, u.email);
      e.target.textContent = "Sent";
    } catch (err) { console.error(err); alert(err.message); e.target.disabled = false; e.target.textContent = "Send password reset"; }
  });

  document.getElementById(`signout-${u.uid}`)?.addEventListener("click", async (e) => {
    e.target.disabled = true; e.target.textContent = "Signing out…";
    try {
      await forceSignOut(u.uid);
      await logStaffAction("force_sign_out", "user", u.uid, u.email);
      e.target.textContent = "Signed out everywhere";
    } catch (err) { console.error(err); alert(err.message); e.target.disabled = false; e.target.textContent = "Force sign-out"; }
  });

  document.getElementById(`toggle-disabled-${u.uid}`)?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await setAccountDisabled(u.uid, !u.disabled);
      await logStaffAction(u.disabled ? "enable_account" : "disable_account", "user", u.uid, u.email);
      loadUsers(document.getElementById("userSearchInput")?.value.trim() || "");
    } catch (err) { console.error(err); alert(err.message); e.target.disabled = false; }
  });

  document.getElementById(`delete-user-${u.uid}`)?.addEventListener("click", async (e) => {
    const typed = prompt(`This permanently deletes ${u.email}'s login. Their listings/reviews/messages are NOT automatically removed. Type their email to confirm:`);
    if (typed !== u.email) return;
    e.target.disabled = true; e.target.textContent = "Deleting…";
    try {
      await deleteAccount(u.uid);
      await logStaffAction("delete_account", "user", u.uid, u.email);
      loadUsers(document.getElementById("userSearchInput")?.value.trim() || "");
    } catch (err) { console.error(err); alert(err.message); e.target.disabled = false; e.target.textContent = "Delete account"; }
  });
}

// ================= Listings =================

function renderListingsSection(body) {
  body.innerHTML = `
    <div class="search-field" style="border:1px solid #ddd;border-radius:14px;padding:4px 18px;max-width:420px;margin-bottom:20px">
      <span>⌕</span>
      <input id="listingSearchInput" type="search" placeholder="Search by title or owner…" autocomplete="off">
    </div>
    <div class="messages-layout">
      <aside class="conversation-list" id="listingList"><p class="state-message">Loading listings…</p></aside>
      <section class="thread-panel" id="listingDetail">
        <div class="empty-thread"><div class="empty-thread-icon">🏷️</div><h3>No listing selected</h3><p>Pick one to see its details and rental history.</p></div>
      </section>
    </div>
  `;
  document.getElementById("listingSearchInput").addEventListener("input", (e) => renderListingList(e.target.value.trim().toLowerCase()));
  loadListings();
}

async function loadListings() {
  try {
    allListingsCache = await fetchAllListingsForStaff();
    renderListingList("");
  } catch (err) {
    console.error(err);
    const el = document.getElementById("listingList");
    if (el) el.innerHTML = `<p class="state-message">Couldn't load listings.</p>`;
  }
}

function renderListingList(query) {
  const el = document.getElementById("listingList");
  if (!el) return;
  const filtered = query
    ? allListingsCache.filter(l => `${l.title} ${l.ownerName}`.toLowerCase().includes(query))
    : allListingsCache;

  if (!filtered.length) { el.innerHTML = `<p class="state-message">No listings found.</p>`; return; }

  el.innerHTML = filtered.map(l => `
    <button type="button" class="conversation-row ${l.id === activeListingId ? "active" : ""}" data-id="${l.id}">
      <div class="conversation-row-top">
        <span class="conversation-title">${escapeHtml(l.title)}</span>
        <span class="status-badge status-${l.available ? "accepted" : "declined"}" style="font-size:9px">${l.available ? "live" : "hidden"}</span>
      </div>
      <div class="conversation-preview">${escapeHtml(l.ownerName || "")} · $${l.pricePerDay}/day</div>
    </button>`).join("");

  el.querySelectorAll(".conversation-row").forEach(btn => {
    btn.addEventListener("click", () => openListingDetail(btn.dataset.id));
  });
}

async function openListingDetail(id) {
  activeListingId = id;
  document.querySelectorAll("#listingList .conversation-row").forEach(b => b.classList.toggle("active", b.dataset.id === id));
  const panel = document.getElementById("listingDetail");
  const listing = allListingsCache.find(l => l.id === id);
  if (!panel || !listing) return;

  panel.innerHTML = `<p class="state-message">Loading rental history…</p>`;
  let history = [];
  try { history = await fetchRequestsForListing(id); } catch (err) { console.error(err); }

  const img = (listing.imageUrls && listing.imageUrls[0]) || "https://placehold.co/300x200?text=No+photo";
  panel.innerHTML = `
    <div style="padding:22px;overflow-y:auto;height:100%">
      <div style="display:flex;gap:16px;align-items:flex-start">
        <img src="${img}" alt="" style="width:96px;height:96px;border-radius:12px;object-fit:cover;flex-shrink:0">
        <div style="flex:1;min-width:0">
          <h3 style="margin:0 0 4px">${escapeHtml(listing.title)}</h3>
          <div class="listing-meta">${escapeHtml(listing.ownerName || "")} · $${listing.pricePerDay}/day${listing.depositAmount ? ` · $${listing.depositAmount} deposit` : ""}</div>
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
            <a class="chip-btn" href="product.html?id=${id}" target="_blank">View listing</a>
            <a class="chip-btn" href="profile.html?uid=${listing.ownerId}" target="_blank">View owner</a>
            <button class="chip-btn" id="toggle-listing-${id}">${listing.available ? "Hide" : "Show"}</button>
            <button class="chip-btn danger" id="delete-listing-${id}">Delete</button>
          </div>
        </div>
      </div>
      <h4 style="margin:26px 0 12px;font-size:14px">Rental history (${history.length})</h4>
      ${history.length ? history.map(rentalHistoryRow).join("") : `<p class="state-message">No rentals yet.</p>`}
    </div>
  `;

  document.getElementById(`toggle-listing-${id}`)?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await setListingAvailability(id, !listing.available);
      await logStaffAction("toggle_listing_visibility", "listing", id, listing.available ? "hidden" : "shown");
      await loadListings();
      openListingDetail(id);
    } catch (err) { console.error(err); e.target.disabled = false; }
  });

  document.getElementById(`delete-listing-${id}`)?.addEventListener("click", async (e) => {
    if (!confirm(`Permanently delete "${listing.title}"? This can't be undone.`)) return;
    e.target.disabled = true;
    try {
      await deleteListing(id);
      await logStaffAction("delete_listing", "listing", id, listing.title);
      allListingsCache = allListingsCache.filter(l => l.id !== id);
      renderListingList(document.getElementById("listingSearchInput")?.value.trim().toLowerCase() || "");
      panel.innerHTML = `<div class="empty-thread"><div class="empty-thread-icon">🏷️</div><h3>Listing deleted</h3></div>`;
    } catch (err) { console.error(err); e.target.disabled = false; }
  });
}

function rentalHistoryRow(r) {
  const photos = [
    ...(r.pickupPhotoUrls || []).map(u => ({ u, label: "Pickup" })),
    ...(r.returnPhotoUrls || []).map(u => ({ u, label: "Return" })),
    ...(r.claimPhotoUrls || []).map(u => ({ u, label: "Damage claim" }))
  ];
  return `<div class="manage-row" style="flex-wrap:wrap;margin-bottom:10px">
    <div class="manage-info">
      <div class="manage-meta">${fmtDate(r.startDate)} → ${fmtDate(r.endDate)} · $${r.totalPrice}</div>
      ${r.depositAmount ? `<div class="manage-meta">Deposit: $${r.depositAmount} — ${escapeHtml(r.depositStatus)}${r.claimedAmount ? ` ($${r.claimedAmount} claimed: ${escapeHtml(r.claimReason || "")})` : ""}</div>` : ""}
      ${photos.length ? `<div class="manage-meta">${photos.map(p => `<a href="${p.u}" target="_blank" rel="noopener" class="text-link">${p.label}</a>`).join(" · ")}</div>` : ""}
    </div>
    <span class="status-badge status-${r.status}">${r.status}</span>
  </div>`;
}

// ================= Staff support identity dialog =================

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
