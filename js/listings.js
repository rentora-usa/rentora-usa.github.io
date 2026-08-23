import { db, auth } from "./firebase.js";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const listingsRef = collection(db, "listings");

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

export async function fetchListingsByOwner(uid) {
  const q = query(listingsRef, where("ownerId", "==", uid));
  const snap = await getDocs(q);
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  return items;
}

export async function fetchPublicListingsByOwner(uid) {
  const items = await fetchListingsByOwner(uid);
  return items.filter(x => x.available);
}

export async function createListing(data) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be logged in to list an item.");
  return addDoc(listingsRef, {
    title: data.title,
    description: data.description,
    category: data.category,
    subcategory: data.subcategory,
    pricePerDay: data.pricePerDay,
    depositAmount: data.depositAmount || 0,
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

export async function addBookedRange(listingId, start, end) {
  const ref = doc(db, "listings", listingId);
  const snap = await getDoc(ref);
  const ranges = snap.exists() ? (snap.data().bookedRanges || []) : [];
  ranges.push({ start: Timestamp.fromDate(start), end: Timestamp.fromDate(end) });
  return updateDoc(ref, { bookedRanges: ranges, updatedAt: serverTimestamp() });
}

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
