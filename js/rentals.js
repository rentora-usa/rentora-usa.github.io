import { db } from "./firebase.js";
import {
  collection, doc, getDocs, updateDoc, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const requestsRef = collection(db, "rentalRequests");

async function runAndSort(q) {
  const snap = await getDocs(q);
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  return items;
}

// Requests this person has sent as a renter.
export async function fetchRequestsAsRenter(uid) {
  return runAndSort(query(requestsRef, where("renterId", "==", uid)));
}

// Requests other people have sent for this person's listings.
export async function fetchRequestsAsOwner(uid) {
  return runAndSort(query(requestsRef, where("ownerId", "==", uid)));
}

// Firestore rules only allow the owner to move a request to
// accepted/declined/completed, and only the renter to cancel a pending one —
// this is a thin wrapper, the real enforcement lives in firestore.rules.
export async function updateRequestStatus(id, status) {
  return updateDoc(doc(db, "rentalRequests", id), { status, updatedAt: serverTimestamp() });
}
