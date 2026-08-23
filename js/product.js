import { fetchListingById, hasDateConflict } from "./listings.js";
import { auth } from "./firebase.js";
import { createRentalRequest } from "./rentals.js";
import { startOrOpenConversation } from "./messages.js";
import { fetchReviewsForUser, averageRating } from "./reviews.js";

document.addEventListener("DOMContentLoaded", async () => {
  const id = new URLSearchParams(location.search).get("id");
  const content = document.getElementById("productContent");
  if (!id) { content.innerHTML = `<p class="demo-note">No listing specified.</p>`; return; }

  content.innerHTML = `<p class="demo-note">Loading listing…</p>`;
  let x;
  try {
    x = await fetchListingById(id);
  } catch (err) {
    console.error(err);
    content.innerHTML = `<p class="demo-note">Couldn't load this listing — check your Firebase setup.</p>`;
    return;
  }
  if (!x) { content.innerHTML = `<p class="demo-note">Listing not found.</p>`; return; }

  document.title = `${x.title} | Rentora`;
  const img = (x.imageUrls && x.imageUrls[0]) || "https://placehold.co/900x600?text=No+photo";
  const isOwnListing = auth.currentUser?.uid === x.ownerId;

  // The owner's star rating (from other people's completed rentals with
  // them) is what shows here now, not a fake per-listing number.
  let ratingHtml = "";
  try {
    const reviews = await fetchReviewsForUser(x.ownerId);
    ratingHtml = reviews.length
      ? `<span class="star-display">★ ${averageRating(reviews).toFixed(1)}</span> (${reviews.length} review${reviews.length === 1 ? "" : "s"} of owner)`
      : `New host`;
  } catch (err) {
    console.error(err);
  }

  content.innerHTML = `
  <div class="product-layout">
   <div class="product-gallery"><img src="${img}" alt="${x.title}"></div>
   <div class="product-info">
    <p class="eyebrow">${x.category} / ${x.subcategory}</p>
    <h1>${x.title}</h1><div class="rating">${ratingHtml} · ${x.locationText || ""}</div>
    <p class="product-location">Available for local pickup. Exact address is shared after a confirmed rental.</p>
    <div class="owner">
      <strong><a href="profile.html?uid=${x.ownerId}">${x.ownerName || "Rentora member"}</a></strong>
      <span class="listing-meta">Rentora member · <a href="profile.html?uid=${x.ownerId}" class="text-link">View profile</a></span>
    </div>
    <p class="product-description">${x.description || ""}</p>
    <div class="booking-card">
     <div class="listing-price">$${x.pricePerDay}<small> / day</small></div>
     ${isOwnListing ? `<p class="demo-note">This is your own listing.</p>` : `
     <div class="booking-row"><label>Start<input id="startDate" type="date"></label><label>End<input id="endDate" type="date"></label></div>
     <button class="primary-button" id="requestButton">Request to rent</button>
     <button class="chip-btn full" id="messageButton" style="margin-top:10px;width:100%">Message owner</button>
     <p class="demo-note" id="requestNote"></p>
     `}
    </div>
   </div>
  </div>`;

  if (isOwnListing) return;

  document.getElementById("messageButton").addEventListener("click", async () => {
    if (!auth.currentUser) { location.href = `login.html?next=${encodeURIComponent(location.pathname.split("/").pop() + location.search)}`; return; }
    try {
      const conversationId = await startOrOpenConversation({
        listingId: x.id, listingTitle: x.title, ownerId: x.ownerId
      });
      location.href = `messages.html?c=${conversationId}`;
    } catch (err) {
      console.error(err);
    }
  });

  document.getElementById("requestButton").addEventListener("click", async () => {
    const note = document.getElementById("requestNote");
    if (!auth.currentUser) { location.href = `login.html?next=${encodeURIComponent(location.pathname.split("/").pop() + location.search)}`; return; }

    const startVal = document.getElementById("startDate").value;
    const endVal = document.getElementById("endDate").value;
    if (!startVal || !endVal) { note.textContent = "Pick a start and end date."; return; }

    const start = new Date(startVal), end = new Date(endVal);
    if (end <= start) { note.textContent = "End date must be after the start date."; return; }
    if (start < new Date(new Date().toDateString())) { note.textContent = "Start date can't be in the past."; return; }

    note.textContent = "Checking availability…";
    try {
      if (await hasDateConflict(x.id, start, end)) {
        note.textContent = "Those dates overlap an existing booking. Try a different range.";
        return;
      }
    } catch (err) {
      console.error(err);
    }

    const days = Math.max(1, Math.round((end - start) / 86400000));
    try {
      await createRentalRequest({
        listingId: x.id,
        ownerId: x.ownerId,
        renterId: auth.currentUser.uid,
        start, end,
        totalPrice: days * x.pricePerDay
      });
      note.textContent = "Request sent to the owner.";
    } catch (err) {
      console.error(err);
      note.textContent = "Couldn't send the request. Try again.";
    }
  });
});
