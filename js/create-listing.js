import { RENTORA_CATEGORIES } from "./categories.js";
import { createListing, updateListing, fetchListingById } from "./listings.js";
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

const catSelect = document.getElementById("category");
const subSelect = document.getElementById("subcategory");
const editId = new URLSearchParams(location.search).get("id");

RENTORA_CATEGORIES.forEach(c => catSelect.add(new Option(c.name, c.name)));
function updateSubs(selected) {
  subSelect.innerHTML = "";
  const c = RENTORA_CATEGORIES.find(x => x.name === catSelect.value);
  (c?.subs || []).forEach(s => subSelect.add(new Option(s, s)));
  if (selected) subSelect.value = selected;
}
catSelect.addEventListener("change", () => updateSubs());
updateSubs();

async function loadForEdit(user) {
  const x = await fetchListingById(editId);
  if (!x) { document.getElementById("listingError").textContent = "That listing no longer exists."; document.getElementById("listingError").classList.remove("hidden"); return; }
  if (x.ownerId !== user.uid) { location.href = "dashboard.html"; return; }

  document.getElementById("pageTitle").textContent = "Edit listing";
  document.getElementById("pageSubtitle").textContent = "Update the details renters see.";
  document.getElementById("listingSubmit").textContent = "Save changes";
  document.getElementById("title").value = x.title || "";
  document.getElementById("description").value = x.description || "";
  catSelect.value = x.category || "";
  updateSubs(x.subcategory);
  document.getElementById("price").value = x.pricePerDay || "";
  document.getElementById("location").value = x.locationText || "";
  document.getElementById("imageUrls").value = (x.imageUrls || []).join(", ");
}

onAuthStateChanged(auth, (user) => {
  if (!user) return; // header-auth.js already redirects signed-out visitors
  if (editId) loadForEdit(user);
});

document.getElementById("listingForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById("listingError");
  const submitBtn = document.getElementById("listingSubmit");
  errorBox.classList.add("hidden");
  submitBtn.disabled = true;

  const imageUrls = document.getElementById("imageUrls").value
    .split(",").map(s => s.trim()).filter(Boolean);

  const data = {
    title: document.getElementById("title").value.trim(),
    description: document.getElementById("description").value.trim(),
    category: catSelect.value,
    subcategory: subSelect.value,
    pricePerDay: Number(document.getElementById("price").value),
    locationText: document.getElementById("location").value.trim(),
    imageUrls
  };

  try {
    if (editId) {
      await updateListing(editId, data);
      location.href = `product.html?id=${editId}`;
    } else {
      const ref = await createListing(data);
      location.href = `product.html?id=${ref.id}`;
    }
  } catch (err) {
    console.error(err);
    errorBox.textContent = err.message || "Couldn't save the listing. Try again.";
    errorBox.classList.remove("hidden");
    submitBtn.disabled = false;
  }
});
