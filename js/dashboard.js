import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  fetchListingsByOwner, setListingAvailability, deleteListing,
  fetchListingById, addBookedRange
} from "./listings.js";
import { subscribeRequestsAsRenter, subscribeRequestsAsOwner, updateRequestStatus } from "./rentals.js";
import { submitReview, fetchMyReviewFor } from "./reviews.js";
import { startOrOpenConversation } from "./messages.js";

const tabs = document.querySelectorAll(".tab-btn");
const panels = {
  listings: document.getElementById("panel-listings"),
  renting: document.getElementById("panel-renting"),
  owner: document.getElementById("panel-owner")
};

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.toggle("active", t === tab));
    Object.entries(panels).forEach(([key, el]) => el.classList.toggle("hidden", key !== tab.dataset.tab));
  });
});

const listingTitleCache = new Map();
async function listingTitle(listingId) {
  if (listingTitleCache.has(listingId)) return listingTitleCache.get(listingId);
  const listing = await fetchListingById(listingId).catch(() => null);
  const title = listing?.title || "Listing";
  listingTitleCache.set(listingId, title);
  return title;
}

function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let currentUid = null;

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  currentUid = user.uid;
  loadListings(user.uid);
  subscribeRequestsAsRenter(user.uid, items => renderRequests("rentingList", items, "renter"));
  subscribeRequestsAsOwner(user.uid, items => renderRequests("ownerList", items, "owner"));
});

async function loadListings(uid) {
  const el = document.getElementById("listingsList");
  try {
    const items = await fetchListingsByOwner(uid);
    if (!items.length) {
      el.innerHTML = `<p class="state-message">You haven't listed anything yet. <a href="create-listing.html">List your first item</a>.</p>`;
      return;
    }
    el.innerHTML = items.map(listingRow).join("");
    items.forEach(x => {
      document.getElementById(`avail-${x.id}`)?.addEventListener("click", async (e) => {
        e.target.disabled = true;
        try { await setListingAvailability(x.id, !x.available); loadListings(uid); }
        catch (err) { console.error(err); e.target.disabled = false; }
      });
      document.getElementById(`delete-${x.id}`)?.addEventListener("click", async (e) => {
        if (!confirm(`Remove "${x.title}" from Rentora? This can't be undone.`)) return;
        e.target.disabled = true;
        try { await deleteListing(x.id); loadListings(uid); }
        catch (err) { console.error(err); e.target.disabled = false; }
      });
    });
  } catch (err) {
    console.error(err);
    el.innerHTML = `<p class="state-message">Couldn't load your listings.</p>`;
  }
}

function listingRow(x) {
  const img = (x.imageUrls && x.imageUrls[0]) || "https://placehold.co/200x200?text=No+photo";
  return `<div class="manage-row">
    <img src="${img}" alt="${x.title}">
    <div class="manage-info">
      <h3>${x.title}</h3>
      <div class="manage-meta">$${x.pricePerDay}/day · ${x.locationText || ""} · ${x.available ? "Listed" : "Hidden"}</div>
    </div>
    <div class="manage-actions">
      <a class="chip-btn" href="product.html?id=${x.id}">View</a>
      <a class="chip-btn" href="create-listing.html?id=${x.id}">Edit</a>
      <button class="chip-btn" id="avail-${x.id}">${x.available ? "Hide" : "Show"}</button>
      <button class="chip-btn danger" id="delete-${x.id}">Delete</button>
    </div>
  </div>`;
}

async function renderRequests(elId, items, viewerRole) {
  const el = document.getElementById(elId);
  if (!items.length) {
    el.innerHTML = viewerRole === "renter"
      ? `<p class="state-message">No rental requests yet. <a href="search.html">Browse listings</a> to find something.</p>`
      : `<p class="state-message">No one has requested to rent your items yet.</p>`;
    return;
  }

  const rows = await Promise.all(items.map(r => requestRow(r, viewerRole)));
  el.innerHTML = rows.join("");

  items.forEach(r => {
    if (viewerRole === "renter" && r.status === "pending") {
      document.getElementById(`cancel-${r.id}`)?.addEventListener("click", async (e) => {
        e.target.disabled = true;
        try { await updateRequestStatus(r.id, "cancelled"); }
        catch (err) { console.error(err); e.target.disabled = false; }
      });
    }
    if (viewerRole === "owner" && r.status === "pending") {
      document.getElementById(`accept-${r.id}`)?.addEventListener("click", async (e) => {
        e.target.disabled = true;
        try {
          await updateRequestStatus(r.id, "accepted");
          const start = r.startDate?.toDate ? r.startDate.toDate() : new Date(r.startDate);
          const end = r.endDate?.toDate ? r.endDate.toDate() : new Date(r.endDate);
          await addBookedRange(r.listingId, start, end);
        } catch (err) { console.error(err); e.target.disabled = false; }
      });
      document.getElementById(`decline-${r.id}`)?.addEventListener("click", async (e) => {
        e.target.disabled = true;
        try { await updateRequestStatus(r.id, "declined"); }
        catch (err) { console.error(err); e.target.disabled = false; }
      });
    }
    if (r.status === "accepted") {
      document.getElementById(`complete-${r.id}`)?.addEventListener("click", async (e) => {
        e.target.disabled = true;
        try { await updateRequestStatus(r.id, "completed"); }
        catch (err) { console.error(err); e.target.disabled = false; }
      });
    }
    document.getElementById(`message-${r.id}`)?.addEventListener("click", async () => {
      try {
        const title = await listingTitle(r.listingId);
        const convId = await startOrOpenConversation({
          listingId: r.listingId, listingTitle: title, ownerId: r.ownerId, renterId: r.renterId
        });
        location.href = `messages.html?c=${convId}`;
      } catch (err) { console.error(err); }
    });
    if (r.status === "completed") {
      wireReviewButton(r, viewerRole);
    }
  });
}

async function requestRow(r, viewerRole) {
  const title = await listingTitle(r.listingId);
  const canAccept = viewerRole === "owner" && r.status === "pending";
  const canCancel = viewerRole === "renter" && r.status === "pending";
  const canComplete = viewerRole === "owner" && r.status === "accepted";

  const actions = [`<button class="chip-btn" id="message-${r.id}">Message</button>`];
  if (canAccept) actions.push(`<button class="chip-btn" id="accept-${r.id}">Accept</button>`, `<button class="chip-btn danger" id="decline-${r.id}">Decline</button>`);
  if (canCancel) actions.push(`<button class="chip-btn danger" id="cancel-${r.id}">Cancel request</button>`);
  if (canComplete) actions.push(`<button class="chip-btn" id="complete-${r.id}">Mark completed</button>`);
  if (r.status === "completed") actions.push(`<span id="review-slot-${r.id}"></span>`);

  return `<div class="manage-row" style="flex-wrap:wrap">
    <div class="manage-info">
      <h3><a href="product.html?id=${r.listingId}">${escapeHtml(title)}</a></h3>
      <div class="manage-meta">${fmtDate(r.startDate)} → ${fmtDate(r.endDate)} · $${r.totalPrice} total</div>
    </div>
    <span class="status-badge status-${r.status}">${r.status}</span>
    <div class="manage-actions">${actions.join("")}</div>
  </div>`;
}

async function wireReviewButton(r, viewerRole) {
  const slot = document.getElementById(`review-slot-${r.id}`);
  if (!slot) return;
  const targetUserId = viewerRole === "owner" ? r.renterId : r.ownerId;
  const targetLabel = viewerRole === "owner" ? "renter" : "owner";

  const existing = await fetchMyReviewFor(r.id).catch(() => null);
  slot.innerHTML = `<button class="chip-btn" id="review-btn-${r.id}">${existing ? "Edit review" : `Review ${targetLabel}`}</button>`;

  document.getElementById(`review-btn-${r.id}`).addEventListener("click", () => {
    openReviewDialog(r, targetUserId, existing);
  });
}

function openReviewDialog(r, targetUserId, existing) {
  const overlay = document.createElement("div");
  overlay.className = "review-overlay";
  overlay.innerHTML = `
    <div class="review-dialog">
      <h3 style="margin:0 0 4px">Leave a review</h3>
      <p class="muted" style="margin:0 0 18px">How was this rental?</p>
      <div class="star-picker" id="starPicker">${[1,2,3,4,5].map(n => `<span class="star" data-n="${n}">★</span>`).join("")}</div>
      <textarea id="reviewText" rows="4" maxlength="1000" placeholder="Optional — anything worth mentioning?" style="width:100%;margin-top:16px;border:1px solid #ddd;border-radius:11px;padding:12px;font-family:inherit"></textarea>
      <p id="reviewDialogError" class="auth-error hidden"></p>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="primary-button" id="reviewSubmit" style="flex:1">Submit</button>
        <button class="chip-btn" id="reviewCancel">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  let rating = existing?.rating || 0;
  const stars = overlay.querySelectorAll(".star-picker .star");
  function paintStars() { stars.forEach(s => s.classList.toggle("on", Number(s.dataset.n) <= rating)); }
  stars.forEach(s => s.addEventListener("click", () => { rating = Number(s.dataset.n); paintStars(); }));
  paintStars();
  if (existing?.text) overlay.querySelector("#reviewText").value = existing.text;

  overlay.querySelector("#reviewCancel").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector("#reviewSubmit").addEventListener("click", async () => {
    const errorBox = overlay.querySelector("#reviewDialogError");
    if (!rating) { errorBox.textContent = "Pick a star rating first."; errorBox.classList.remove("hidden"); return; }
    try {
      await submitReview({
        rentalRequestId: r.id,
        listingId: r.listingId,
        targetUserId,
        rating,
        text: overlay.querySelector("#reviewText").value.trim()
      });
      overlay.remove();
      wireReviewButton(r, targetUserId === r.renterId ? "owner" : "renter");
    } catch (err) {
      console.error(err);
      errorBox.textContent = "Couldn't save your review — open the browser console for the exact error. If it says permission-denied, firestore.rules likely needs to be redeployed (see README §8).";
      errorBox.classList.remove("hidden");
    }
  });
}
