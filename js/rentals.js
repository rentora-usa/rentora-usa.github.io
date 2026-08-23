import { db } from "./firebase.js";
import {
  collection, doc, getDocs, addDoc, updateDoc, onSnapshot,
  query, where, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const requestsRef = collection(db, "rentalRequests");

function sorted(items) {
  return items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

export async function fetchRequestsAsRenter(uid) {
  const snap = await getDocs(query(requestsRef, where("renterId", "==", uid)));
  return sorted(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

export async function fetchRequestsAsOwner(uid) {
  const snap = await getDocs(query(requestsRef, where("ownerId", "==", uid)));
  return sorted(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

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

export async function updateRequestStatus(id, status) {
  return updateDoc(doc(db, "rentalRequests", id), { status, updatedAt: serverTimestamp() });
}
