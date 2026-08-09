import { fetchListingById } from "./listings.js";
import { auth, db } from "./firebase.js";
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

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
  content.innerHTML = `
  <div class="product-layout">
   <div class="product-gallery"><img src="${img}" alt="${x.title}"></div>
   <div class="product-info">
    <p class="eyebrow">${x.category} / ${x.subcategory}</p>
    <h1>${x.title}</h1><div class="rating">★ ${(x.rating || 0).toFixed(1)} · ${x.locationText || ""}</div>
    <p class="product-location">Available for local pickup. Exact address is shared after a confirmed rental.</p>
    <div class="owner"><strong>Listed by ${x.ownerName || "Rentora member"}</strong><span class="listing-meta">Rentora member</span></div>
    <p class="product-description">${x.description || ""}</p>
    <div class="booking-card">
     <div class="listing-price">$${x.pricePerDay}<small> / day</small></div>
     <div class="booking-row"><label>Start<input id="startDate" type="date"></label><label>End<input id="endDate" type="date"></label></div>
     <button class="primary-button" id="requestButton">Request to rent</button>
     <p class="demo-note" id="requestNote"></p>
    </div>
   </div>
  </div>`;

  document.getElementById("requestButton").addEventListener("click", async () => {
    const note = document.getElementById("requestNote");
    if (!auth.currentUser) { location.href = "login.html"; return; }
    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;
    if (!startDate || !endDate) { note.textContent = "Pick a start and end date."; return; }
    if (new Date(endDate) <= new Date(startDate)) { note.textContent = "End date must be after the start date."; return; }

    const days = Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / 86400000));
    try {
      await addDoc(collection(db, "rentalRequests"), {
        listingId: x.id,
        ownerId: x.ownerId,
        renterId: auth.currentUser.uid,
        startDate,
        endDate,
        totalPrice: days * x.pricePerDay,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      note.textContent = "Request sent to the owner.";
    } catch (err) {
      console.error(err);
      note.textContent = "Couldn't send the request. Try again.";
    }
  });
});
