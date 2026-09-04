import { RENTORA_CATEGORIES } from "./categories.js";
import { createListing, updateListing, fetchListingById } from "./listings.js";
import { uploadListingPhotos } from "./cloudinary-upload.js";
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

const catSelect = document.getElementById("category");
const subSelect = document.getElementById("subcategory");
const editId = new URLSearchParams(location.search).get("id");
const photoFilesInput = document.getElementById("photoFiles");
const photoPreview = document.getElementById("photoPreview");
const uploadStatus = document.getElementById("uploadStatus");
let existingImageUrls = [];

RENTORA_CATEGORIES.forEach(c => catSelect.add(new Option(c.name, c.name)));
function updateSubs(selected) {
  subSelect.innerHTML = "";
  const c = RENTORA_CATEGORIES.find(x => x.name === catSelect.value);
  (c?.subs || []).forEach(s => subSelect.add(new Option(s, s)));
  if (selected) subSelect.value = selected;
}
catSelect.addEventListener("change", () => updateSubs());
updateSubs();

// Instant local preview thumbnails — these are just object URLs of the
// picked files, nothing uploaded yet. The real upload happens on submit.
photoFilesInput.addEventListener("change", () => {
  photoPreview.innerHTML = "";
  Array.from(photoFilesInput.files).forEach(file => {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.alt = file.name;
    photoPreview.appendChild(img);
  });
});

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
  document.getElementById("depositAmount").value = x.depositAmount || "";
  document.getElementById("location").value = x.locationText || "";

  // Existing photos show as thumbnails (already uploaded, nothing to
  // re-upload) so editing a listing doesn't require re-picking every file.
  (x.imageUrls || []).forEach(url => {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "Existing photo";
    photoPreview.appendChild(img);
  });
  existingImageUrls = x.imageUrls || [];
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  if (editId) loadForEdit(user);
});

document.getElementById("listingForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById("listingError");
  const submitBtn = document.getElementById("listingSubmit");
  errorBox.classList.add("hidden");
  uploadStatus.classList.add("hidden");
  submitBtn.disabled = true;

  const pastedUrls = document.getElementById("imageUrls").value
    .split(",").map(s => s.trim()).filter(Boolean);
  const files = photoFilesInput.files;

  try {
    let uploadedUrls = [];
    if (files && files.length) {
      uploadStatus.classList.remove("hidden");
      uploadedUrls = await uploadListingPhotos(files, (i, total) => {
        uploadStatus.textContent = `Uploading photo ${i} of ${total}…`;
      });
    }
    uploadStatus.textContent = editId ? "Saving changes…" : "Publishing listing…";

    const existing = editId ? existingImageUrls : [];
    const imageUrls = [...existing, ...uploadedUrls, ...pastedUrls];

    const data = {
      title: document.getElementById("title").value.trim(),
      description: document.getElementById("description").value.trim(),
      category: catSelect.value,
      subcategory: subSelect.value,
      pricePerDay: Number(document.getElementById("price").value),
      depositAmount: Number(document.getElementById("depositAmount").value) || 0,
      locationText: document.getElementById("location").value.trim(),
      imageUrls
    };

    if (editId) {
      await updateListing(editId, data);
      location.href = `product.html?id=${editId}`;
    } else {
      const ref = await createListing(data);
      location.href = `product.html?id=${ref.id}`;
    }
  } catch (err) {
    console.error(err);
    uploadStatus.classList.add("hidden");
    errorBox.textContent = err.message || "Couldn't save the listing. Try again.";
    errorBox.classList.remove("hidden");
    submitBtn.disabled = false;
  }
});
