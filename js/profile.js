import { db } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { fetchReviewsForUser, averageRating } from "./reviews.js";
import { fetchPublicListingsByOwner } from "./listings.js";

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function starDisplay(rating) {
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

function listingCard(x) {
  const img = (x.imageUrls && x.imageUrls[0]) || "https://placehold.co/600x400?text=No+photo";
  return `<article class="listing-card"><a href="product.html?id=${encodeURIComponent(x.id)}"><div class="listing-image"><img src="${img}" alt="${x.title}" loading="lazy"></div><div class="listing-info"><div class="listing-title">${x.title}</div><div class="listing-meta">$${x.pricePerDay}/day · ${x.locationText || ""}</div></div></a></article>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const uid = new URLSearchParams(location.search).get("uid");
  const root = document.getElementById("profileContent");
  if (!uid) { root.innerHTML = `<p class="state-message">No profile specified.</p>`; return; }

  try {
    const [userSnap, reviews, listings] = await Promise.all([
      getDoc(doc(db, "users", uid)),
      fetchReviewsForUser(uid),
      fetchPublicListingsByOwner(uid)
    ]);

    if (!userSnap.exists()) { root.innerHTML = `<p class="state-message">That profile doesn't exist.</p>`; return; }
    const u = userSnap.data();
    const avg = averageRating(reviews);
    const memberSince = u.createdAt?.toDate
      ? u.createdAt.toDate().toLocaleDateString(undefined, { year: "numeric", month: "long" })
      : "";

    document.title = `${u.displayName || "Rentora member"} | Rentora`;

    root.innerHTML = `
      <div class="profile-header">
        ${u.photoURL
          ? `<img class="profile-avatar" src="${u.photoURL}" alt="${escapeHtml(u.displayName || "")}">`
          : `<div class="profile-avatar">${(u.displayName || "R").charAt(0).toUpperCase()}</div>`}
        <div>
          <h1 class="profile-name">${escapeHtml(u.displayName || "Rentora member")}</h1>
          <div class="profile-meta">
            ${reviews.length
              ? `<span class="star-display">${starDisplay(avg)}</span> ${avg.toFixed(1)} · ${reviews.length} review${reviews.length === 1 ? "" : "s"}`
              : "No reviews yet"}
            ${u.location ? ` · ${escapeHtml(u.location)}` : ""}${memberSince ? ` · Member since ${memberSince}` : ""}
          </div>
          ${u.bio ? `<p class="muted" style="margin-top:14px;max-width:520px">${escapeHtml(u.bio)}</p>` : ""}
        </div>
      </div>

      ${listings.length ? `
        <h2 style="font:700 22px Manrope;margin:44px 0 20px">Listings</h2>
        <div class="listing-grid">${listings.map(listingCard).join("")}</div>
      ` : ""}

      <h2 style="font:700 22px Manrope;margin:44px 0 4px">Reviews</h2>
      <div id="reviewsList">
        ${reviews.length
          ? reviews.map(r => `
            <div class="review-row">
              <div class="review-row-top">
                <span class="star-display">${starDisplay(r.rating)}</span>
                <span class="review-date">${r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString() : ""}</span>
              </div>
              ${r.text ? `<p class="review-text">${escapeHtml(r.text)}</p>` : ""}
            </div>`).join("")
          : `<p class="state-message">No reviews yet — they show up after a completed rental.</p>`}
      </div>
    `;
  } catch (err) {
    console.error(err);
    root.innerHTML = `<p class="state-message">Couldn't load this profile. Open the browser console for the exact error — a "permission-denied" here usually means firestore.rules hasn't been redeployed since the reviews feature was added.</p>`;
  }
});
