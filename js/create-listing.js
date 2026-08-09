import { RENTORA_CATEGORIES } from "./categories.js";
import { createListing } from "./listings.js";
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

const catSelect = document.getElementById("category");
const subSelect = document.getElementById("subcategory");

RENTORA_CATEGORIES.forEach(c => catSelect.add(new Option(c.name, c.name)));
function updateSubs() {
  subSelect.innerHTML = "";
  const c = RENTORA_CATEGORIES.find(x => x.name === catSelect.value);
  (c?.subs || []).forEach(s => subSelect.add(new Option(s, s)));
}
catSelect.addEventListener("change", updateSubs);
updateSubs();

// Bounce signed-out visitors to login rather than letting them hit a
// permission-denied error from Firestore rules.
onAuthStateChanged(auth, (user) => {
  if (!user) location.href = "login.html";
});

document.getElementById("listingForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById("listingError");
  const submitBtn = document.getElementById("listingSubmit");
  errorBox.classList.add("hidden");
  submitBtn.disabled = true;

  const imageUrls = document.getElementById("imageUrls").value
    .split(",").map(s => s.trim()).filter(Boolean);

  try {
    const ref = await createListing({
      title: document.getElementById("title").value.trim(),
      description: document.getElementById("description").value.trim(),
      category: catSelect.value,
      subcategory: subSelect.value,
      pricePerDay: Number(document.getElementById("price").value),
      locationText: document.getElementById("location").value.trim(),
      imageUrls
    });
    location.href = `product.html?id=${ref.id}`;
  } catch (err) {
    console.error(err);
    errorBox.textContent = err.message || "Couldn't create the listing. Try again.";
    errorBox.classList.remove("hidden");
    submitBtn.disabled = false;
  }
});
