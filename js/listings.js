import { db, auth } from "./firebase.js";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, Timestamp, serverTimestamp
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

// Every listing a given owner has published, available or not — used by
// the dashboard so someone can find and manage their own items.
export async function fetchListingsByOwner(uid) {
  const q = query(listingsRef, where("ownerId", "==", uid));
  const snap = await getDocs(q);
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  return items;
}

// A person's active (available) listings, for their public profile page.
export async function fetchPublicListingsByOwner(uid) {
  const items = await fetchListingsByOwner(uid);
  return items.filter(x => x.available);
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
    bookedRanges: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateListing(id, data) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be logged in to edit a listing.");
  return updateDoc(doc(db, "listings", id), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function setListingAvailability(id, available) {
  return updateListing(id, { available });
}

export async function deleteListing(id) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be logged in to delete a listing.");
  return deleteDoc(doc(db, "listings", id));
}

// --- Availability / booked-date tracking ---
//
// Accepted rental dates live on the listing itself (public, single-document
// read) rather than being derived by querying rentalRequests — that
// collection is private per-person by design (see firestore.rules), so a
// renter browsing a listing they don't own can't read other renters'
// requests for it. Recording the accepted range on the listing keeps
// availability checkable without exposing anyone's request details.
export async function addBookedRange(listingId, start, end) {
  const ref = doc(db, "listings", listingId);
  const snap = await getDoc(ref);
  const ranges = snap.exists() ? (snap.data().bookedRanges || []) : [];
  ranges.push({ start: Timestamp.fromDate(start), end: Timestamp.fromDate(end) });
  return updateDoc(ref, { bookedRanges: ranges, updatedAt: serverTimestamp() });
}

// Best-effort overlap check run from the browser before submitting a
// request. This is a UX convenience, not an ironclad guarantee — two
// people can still race each other between this check and the owner
// accepting one of them. True double-booking prevention needs a
// server-side transaction (a Cloud Function), which isn't part of this
// static-hosting setup. See README §4.
export async function hasDateConflict(listingId, start, end) {
  const listing = await fetchListingById(listingId);
  const ranges = listing?.bookedRanges || [];
  const startMs = start.getTime(), endMs = end.getTime();
  return ranges.some(r => {
    const rStart = r.start?.toMillis?.() ?? 0;
    const rEnd = r.end?.toMillis?.() ?? 0;
    return startMs < rEnd && endMs > rStart;
  });
}
