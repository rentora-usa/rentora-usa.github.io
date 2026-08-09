import { fetchListings } from "./listings.js";
import { RENTORA_CATEGORIES } from "./categories.js";

document.addEventListener("DOMContentLoaded", async () => {
  const cats = document.getElementById("categoryGrid");
  const listings = document.getElementById("featuredListings");

  if (cats) {
    cats.innerHTML = RENTORA_CATEGORIES.map(c =>
      `<a class="category-card" href="search.html?category=${encodeURIComponent(c.name)}"><div class="category-icon">${c.icon}</div><h3>${c.name}</h3></a>`
    ).join("");
  }

  if (listings) {
    listings.innerHTML = `<p class="demo-note">Loading listings…</p>`;
    try {
      const data = await fetchListings({ take: 8 });
      listings.innerHTML = data.length
        ? data.map(listingCard).join("")
        : `<p class="demo-note">No listings yet. <a href="create-listing.html">Be the first to list something.</a></p>`;
    } catch (err) {
      console.error(err);
      listings.innerHTML = `<p class="demo-note">Couldn't load listings — check your Firebase setup and Firestore rules.</p>`;
    }
  }

  const form = document.getElementById("homeSearch");
  form?.addEventListener("submit", e => {
    e.preventDefault();
    const q = document.getElementById("searchInput").value.trim();
    location.href = `search.html?query=${encodeURIComponent(q)}`;
  });
});

function listingCard(x) {
  const img = (x.imageUrls && x.imageUrls[0]) || "https://placehold.co/600x400?text=No+photo";
  return `<article class="listing-card"><a href="product.html?id=${encodeURIComponent(x.id)}"><div class="listing-image"><img src="${img}" alt="${x.title}" loading="lazy"></div><div class="listing-info"><div class="listing-title">${x.title}</div><div class="listing-meta">★ ${(x.rating || 0).toFixed(1)} · ${x.locationText || ""}</div><div class="listing-price">$${x.pricePerDay}<small> / day</small></div></div></a></article>`;
}
