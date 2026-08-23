import { db } from "./firebase.js";
import {
  collection, doc, getDocs, addDoc, updateDoc, onSnapshot,
  query, where, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const requestsRef = collection(db, "rentalRequests");

// How long after the rental's end date an owner has to confirm the item
// came back before the automatic "not returned" deposit rule kicks in.
export const RETURN_GRACE_HOURS = 48;

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

// depositAmount is snapshotted from the listing at booking time — if the
// owner changes the listing's deposit later, requests already in flight
// keep the amount the renter actually agreed to.
//
// NOTE: no money actually moves here. Rentora doesn't have a payment
// backend connected yet (see README §9), so depositAmount/depositStatus
// are a *ledger* — a record of what should be held/released/claimed —
// ready to plug into real Stripe holds and captures once that exists.
export async function createRentalRequest({ listingId, ownerId, renterId, start, end, totalPrice, depositAmount = 0 }) {
  const returnDeadline = new Date(end.getTime() + RETURN_GRACE_HOURS * 3600 * 1000);
  return addDoc(requestsRef, {
    listingId,
    ownerId,
    renterId,
    startDate: Timestamp.fromDate(start),
    endDate: Timestamp.fromDate(end),
    totalPrice,
    status: "pending",
    depositAmount,
    returnDeadline: Timestamp.fromDate(returnDeadline),
    returnedAt: null,
    depositStatus: depositAmount > 0 ? "pending" : "n/a",
    claimedAmount: 0,
    claimReason: "",
    claimPhotoUrls: [],
    claimedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateRequestStatus(id, status) {
  return updateDoc(doc(db, "rentalRequests", id), { status, updatedAt: serverTimestamp() });
}

// ---------- Deposit resolution (owner-only, see firestore.rules) ----------

// Owner confirms the item came back on time and in good shape — the full
// deposit is released to the renter (i.e. nothing gets claimed against it).
export async function confirmCleanReturn(id) {
  return updateDoc(doc(db, "rentalRequests", id), {
    returnedAt: serverTimestamp(),
    depositStatus: "released",
    updatedAt: serverTimestamp()
  });
}

// Owner reports damage (or a late/no return they're handling manually) and
// claims some or all of the deposit. Per your call: this is applied
// automatically as submitted — there's no staff review step — so the claim
// amount is capped at the deposit itself, and photo evidence is required
// so there's at least a record backing it up.
export async function reportDamageClaim(id, { amount, note, photoUrls }) {
  return updateDoc(doc(db, "rentalRequests", id), {
    returnedAt: serverTimestamp(),
    depositStatus: "claimed",
    claimedAmount: amount,
    claimReason: note || "Item returned damaged",
    claimPhotoUrls: photoUrls || [],
    claimedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

// The automatic "never came back" rule. Client-triggered (see the note in
// createRentalRequest and README §9) — it runs whenever the *owner's*
// dashboard loads and checks their own accepted rentals, since there's no
// scheduled Cloud Function yet to run this in the background regardless of
// whether anyone has the app open.
export async function applyOverdueDepositRule(requests) {
  const now = Date.now();
  const overdue = requests.filter(r =>
    r.status === "accepted" &&
    r.depositStatus === "pending" &&
    !r.returnedAt &&
    r.returnDeadline?.toMillis?.() < now
  );
  for (const r of overdue) {
    try {
      await updateDoc(doc(db, "rentalRequests", r.id), {
        depositStatus: "claimed",
        claimedAmount: r.depositAmount,
        claimReason: `Not marked returned within ${RETURN_GRACE_HOURS}h of the rental's end date (automatic rule).`,
        claimedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("applyOverdueDepositRule", r.id, err);
    }
  }
}
