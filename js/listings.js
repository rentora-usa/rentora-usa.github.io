import { db, auth } from "./firebase.js";
import {
  collection, doc, getDoc, getDocs, addDoc, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const listingsRef = collection(db, "listings");

// Kept deliberately simple: a single equality filter (available == true) needs
// no composite index. Category filtering and sorting happen client-side.
// As the catalog grows, move category/price filtering server-side with
// where()/orderBy() and let Firestore's console prompt you to create the
// composite indexes those combined queries need.
export async function fetchListings({ category, take } = {}) {
  const q = query(listingsRef, where("available", "==", true));
  const snap = await getDocs(q);
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  if (category) items = items.filter(x => x.category === category);
  if (take) items = items.slice(0, take);
  return items;
}

export async function fetchListingById(id) {
  const snap = await getDoc(doc(db, "listings", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Writing here is what actually creates the "listings" collection the very
// first time anyone lists an item — nothing needs to be pre-created in
// the Firebase console.
export async function createListing(data) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be logged in to list an item.");
  return addDoc(listingsRef, {
    title: data.title,
    description: data.description,
    category: data.category,
    subcategory: data.subcategory,
    pricePerDay: data.pricePerDay,
    locationText: data.locationText,
    imageUrls: data.imageUrls || [],
    ownerId: user.uid,
    ownerName: user.displayName || (user.email ? user.email.split("@")[0] : "Rentora member"),
    rating: 0,
    reviewCount: 0,
    available: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}
