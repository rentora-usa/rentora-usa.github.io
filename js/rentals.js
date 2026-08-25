import { db } from "./firebase.js";
import {
  collection, doc, getDocs, addDoc, updateDoc, onSnapshot,
  query, where, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { releaseDeposit as releaseDepositViaWorker, captureDeposit as captureDepositViaWorker } from "./payments.js";

const requestsRef = collection(db, "rentalRequests");

// How long after the rental's end date an owner has to confirm the item
// came back before the automatic "not returned" deposit rule kicks in.
// Kept in sync with payments-worker/src/worker.js's own copy of this
// constant (used there when a real Stripe hold exists).
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

// Ledger-only booking path (no real Stripe hold) — used when the listing
// has no deposit, or when the payments Worker isn't configured/reachable.
// depositStatus starts at "pending" (deposit>0) or "n/a" (deposit=0).
//
// When a real hold IS placed, the rentalRequest is instead created by the
// payments Worker itself (js/payments.js#confirmRentalRequestWithDeposit),
// with depositStatus starting at "authorized" — firestore.rules only lets
// a plain client write use "n/a"/"pending" here, on purpose: there's no way
// for a security rule to verify a real Stripe hold actually exists, so
// that verification (and the resulting privileged write) has to happen
// server-side. See README §10 and payments-worker/src/worker.js.
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
    depositPaymentIntentId: "",
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

// ---------- Deposit resolution ----------
// Every function below takes the full request object (not just an id) so
// it can check whether a real Stripe hold exists (depositPaymentIntentId)
// and route accordingly:
//   - real hold  -> go through the payments Worker (actually touches Stripe,
//                   Worker itself writes the Firestore update afterward)
//   - no hold    -> the old ledger-only path, a plain client Firestore write
// Either way the caller (dashboard.js) doesn't need to know which mode
// it's in — same function, same result shape.

export async function confirmCleanReturn(request) {
  if (request.depositPaymentIntentId) {
    return releaseDepositViaWorker(request.id);
  }
  return updateDoc(doc(db, "rentalRequests", request.id), {
    returnedAt: serverTimestamp(),
    depositStatus: "released",
    updatedAt: serverTimestamp()
  });
}

// Per your call: applied automatically as submitted, no staff review step.
// The claim amount is capped at the deposit (enforced both client-side and,
// for real holds, by the Worker/Stripe itself) so an owner can never claim
// more than what was actually held.
export async function reportDamageClaim(request, { amount, note, photoUrls }) {
  if (request.depositPaymentIntentId) {
    return captureDepositViaWorker(request.id, amount, note, photoUrls);
  }
  return updateDoc(doc(db, "rentalRequests", request.id), {
    returnedAt: serverTimestamp(),
    depositStatus: "claimed",
    claimedAmount: amount,
    claimReason: note || "Item returned damaged",
    claimPhotoUrls: photoUrls || [],
    claimedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

// The automatic "never came back" rule. Client-triggered — runs whenever
// the *owner's* dashboard loads and checks their own accepted rentals,
// since there's no scheduled Cloud Function yet to run this in the
// background regardless of whether anyone has the app open. See README §9.
export async function applyOverdueDepositRule(requests) {
  const now = Date.now();
  const overdue = requests.filter(r =>
    r.status === "accepted" &&
    (r.depositStatus === "pending" || r.depositStatus === "authorized") &&
    !r.returnedAt &&
    r.returnDeadline?.toMillis?.() < now
  );
  const reason = `Not marked returned within ${RETURN_GRACE_HOURS}h of the rental's end date (automatic rule).`;

  for (const r of overdue) {
    try {
      if (r.depositPaymentIntentId) {
        await captureDepositViaWorker(r.id, r.depositAmount, reason, []);
      } else {
        await updateDoc(doc(db, "rentalRequests", r.id), {
          depositStatus: "claimed",
          claimedAmount: r.depositAmount,
          claimReason: reason,
          claimedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    } catch (err) {
      console.error("applyOverdueDepositRule", r.id, err);
    }
  }
}
