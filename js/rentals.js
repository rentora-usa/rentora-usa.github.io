import { db } from "./firebase.js";
import {
  collection, doc, getDocs, addDoc, updateDoc, onSnapshot,
  query, where, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const requestsRef = collection(db, "rentalRequests");

function sorted(items) {
  return items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

// Requests this person has sent as a renter.
export async function fetchRequestsAsRenter(uid) {
  const snap = await getDocs(query(requestsRef, where("renterId", "==", uid)));
  return sorted(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

// Requests other people have sent for this person's listings.
export async function fetchRequestsAsOwner(uid) {
  const snap = await getDocs(query(requestsRef, where("ownerId", "==", uid)));
  return sorted(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

// Live versions of the two queries above, for the dashboard — accept/decline/
// cancel (from this tab, another tab, or another device) reflects immediately
// without a manual reload. Returns the unsubscribe function.
export function subscribeRequestsAsRenter(uid, callback) {
  return onSnapshot(query(requestsRef, where("renterId", "==", uid)), snap => {
    callback(sorted(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  });
}
export function subscribeRequestsAsOwner(uid, callback) {
  return onSnapshot(query(requestsRef, where("ownerId", "==", uid)), snap => {
    callback(sorted(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  });
}

export async function createRentalRequest({ listingId, ownerId, renterId, start, end, totalPrice }) {
  return addDoc(requestsRef, {
    listingId,
    ownerId,
    renterId,
    startDate: Timestamp.fromDate(start),
    endDate: Timestamp.fromDate(end),
    totalPrice,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

// Firestore rules only allow the owner to move a request to
// accepted/declined/completed, and only the renter to cancel a pending one —
// this is a thin wrapper, the real enforcement lives in firestore.rules.
// When an owner accepts, the caller (dashboard.js) also records the date
// range on the listing itself via listings.js#addBookedRange, so future
// renters can see it's taken without anyone needing to read other people's
// private rental requests.
export async function updateRequestStatus(id, status) {
  return updateDoc(doc(db, "rentalRequests", id), { status, updatedAt: serverTimestamp() });
}
