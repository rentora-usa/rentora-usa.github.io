import { fetchListings } from "./listings.js";
import { RENTORA_CATEGORIES } from "./categories.js";

let allListings = [];

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(location.search);
  const query = document.getElementById("query"), loc = document.getElementById("location");
  const cat = document.getElementById("categoryFilter"), sub = document.getElementById("subcategoryFilter"),
        price = document.getElementById("priceFilter"), sort = document.getElementById("sortFilter");

  RENTORA_CATEGORIES.forEach(c => cat.add(new Option(c.name, c.name)));
  query.value = params.get("query") || "";
  loc.value = params.get("location") || "";
  cat.value = params.get("category") || "";
  updateSubs();
  sub.value = params.get("subcategory") || "";

  document.getElementById("resultsGrid").innerHTML = `<p class="demo-note">Loading listings…</p>`;
  try {
    allListings = await fetchListings();
  } catch (err) {
    console.error(err);
    document.getElementById("resultsGrid").innerHTML = `<p class="demo-note">Couldn't load listings — check your Firebase setup and Firestore rules.</p>`;
  }
  render();

  cat.addEventListener("change", () => { updateSubs(); render(); });
  [query, loc, price, sub, sort].forEach(el =>
    el.addEventListener(el === query || el === loc ? "input" : "change", render)
  );
  document.getElementById("searchForm").addEventListener("submit", e => { e.preventDefault(); render(); });
  document.getElementById("clearFilters").addEventListener("click", () => {
    query.value = ""; loc.value = ""; cat.value = ""; price.value = ""; sort.value = "featured";
    updateSubs(); render();
  });

  function updateSubs() {
    sub.innerHTML = '<option value="">All subcategories</option>';
    const c = RENTORA_CATEGORIES.find(x => x.name === cat.value);
    (c?.subs || []).forEach(s => sub.add(new Option(s, s)));
  }

  function render() {
    let data = [...allListings], q = query.value.toLowerCase().trim(), l = loc.value.toLowerCase().trim();
    if (q) data = data.filter(x => `${x.title} ${x.category} ${x.subcategory} ${x.description}`.toLowerCase().includes(q));
    if (l) data = data.filter(x => (x.locationText || "").toLowerCase().includes(l));
    if (cat.value) data = data.filter(x => x.category === cat.value);
    if (sub.value) data = data.filter(x => x.subcategory === sub.value);
    if (price.value) data = data.filter(x => x.pricePerDay <= Number(price.value));
    if (sort.value === "priceLow") data.sort((a, b) => a.pricePerDay - b.pricePerDay);
    if (sort.value === "priceHigh") data.sort((a, b) => b.pricePerDay - a.pricePerDay);
    if (sort.value === "rating") data.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    document.getElementById("resultsGrid").innerHTML = data.map(listingCard).join("");
    document.getElementById("resultCount").textContent = `${data.length} item${data.length === 1 ? "" : "s"}`;
    document.getElementById("activeSearch").textContent = q ? `Results for "${query.value}"` : "";
    document.getElementById("emptyState").classList.toggle("hidden", data.length !== 0);
  }
});

function listingCard(x) {
  const img = (x.imageUrls && x.imageUrls[0]) || "https://placehold.co/600x400?text=No+photo";
  return `<article class="listing-card"><a href="product.html?id=${encodeURIComponent(x.id)}"><div class="listing-image"><img src="${img}" alt="${x.title}" loading="lazy"></div><div class="listing-info"><div class="listing-title">${x.title}</div><div class="listing-meta">★ ${(x.rating || 0).toFixed(1)} · ${x.locationText || ""}</div><div class="listing-price">$${x.pricePerDay}<small> / day</small></div></div></a></article>`;
}
