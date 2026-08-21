import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { fetchListingsByOwner, setListingAvailability, deleteListing } from "./listings.js";
import { fetchRequestsAsRenter, fetchRequestsAsOwner, updateRequestStatus } from "./rentals.js";

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

onAuthStateChanged(auth, async (user) => {
  if (!user) return; // header-auth.js redirects signed-out visitors

  loadListings(user.uid);
  loadRenting(user.uid);
  loadOwnerRequests(user.uid);
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
        try {
          await setListingAvailability(x.id, !x.available);
          loadListings(uid);
        } catch (err) {
          console.error(err);
          e.target.disabled = false;
        }
      });
      document.getElementById(`delete-${x.id}`)?.addEventListener("click", async (e) => {
        if (!confirm(`Remove "${x.title}" from Rentora? This can't be undone.`)) return;
        e.target.disabled = true;
        try {
          await deleteListing(x.id);
          loadListings(uid);
        } catch (err) {
          console.error(err);
          e.target.disabled = false;
        }
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

async function loadRenting(uid) {
  const el = document.getElementById("rentingList");
  try {
    const items = await fetchRequestsAsRenter(uid);
    if (!items.length) {
      el.innerHTML = `<p class="state-message">No rental requests yet. <a href="search.html">Browse listings</a> to find something.</p>`;
      return;
    }
    el.innerHTML = items.map(r => requestRow(r, "renter")).join("");
    items.filter(r => r.status === "pending").forEach(r => {
      document.getElementById(`cancel-${r.id}`)?.addEventListener("click", async (e) => {
        e.target.disabled = true;
        try { await updateRequestStatus(r.id, "cancelled"); loadRenting(uid); }
        catch (err) { console.error(err); e.target.disabled = false; }
      });
    });
  } catch (err) {
    console.error(err);
    el.innerHTML = `<p class="state-message">Couldn't load your rental requests.</p>`;
  }
}

async function loadOwnerRequests(uid) {
  const el = document.getElementById("ownerList");
  try {
    const items = await fetchRequestsAsOwner(uid);
    if (!items.length) {
      el.innerHTML = `<p class="state-message">No one has requested to rent your items yet.</p>`;
      return;
    }
    el.innerHTML = items.map(r => requestRow(r, "owner")).join("");
    items.filter(r => r.status === "pending").forEach(r => {
      document.getElementById(`accept-${r.id}`)?.addEventListener("click", async (e) => {
        e.target.disabled = true;
        try { await updateRequestStatus(r.id, "accepted"); loadOwnerRequests(uid); }
        catch (err) { console.error(err); e.target.disabled = false; }
      });
      document.getElementById(`decline-${r.id}`)?.addEventListener("click", async (e) => {
        e.target.disabled = true;
        try { await updateRequestStatus(r.id, "declined"); loadOwnerRequests(uid); }
        catch (err) { console.error(err); e.target.disabled = false; }
      });
    });
  } catch (err) {
    console.error(err);
    el.innerHTML = `<p class="state-message">Couldn't load requests for your listings.</p>`;
  }
}

function requestRow(r, viewerRole) {
  const actions = [];
  if (viewerRole === "renter" && r.status === "pending") {
    actions.push(`<button class="chip-btn danger" id="cancel-${r.id}">Cancel request</button>`);
  }
  if (viewerRole === "owner" && r.status === "pending") {
    actions.push(`<button class="chip-btn" id="accept-${r.id}">Accept</button>`);
    actions.push(`<button class="chip-btn danger" id="decline-${r.id}">Decline</button>`);
  }
  return `<div class="manage-row">
    <div class="manage-info">
      <h3><a href="product.html?id=${r.listingId}">View listing</a></h3>
      <div class="manage-meta">${r.startDate} → ${r.endDate} · $${r.totalPrice} total</div>
    </div>
    <span class="status-badge status-${r.status}">${r.status}</span>
    <div class="manage-actions">${actions.join("")}</div>
  </div>`;
}
