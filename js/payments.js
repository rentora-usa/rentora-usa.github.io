import { auth } from "./firebase.js";
import { PAYMENTS_WORKER_URL } from "./payments-config.js";

export function paymentsConfigured() {
  return !!PAYMENTS_WORKER_URL;
}

async function callWorker(path, body) {
  if (!PAYMENTS_WORKER_URL) {
    throw new Error("Payments backend isn't configured yet — set PAYMENTS_WORKER_URL in js/payments-config.js after deploying payments-worker/.");
  }
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch(PAYMENTS_WORKER_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, idToken })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Payments request failed (${res.status}).`);
  return data;
}

// Step 1 of booking with a deposit: get an uncaptured Stripe hold ready for
// the card the renter is about to enter.
export function createDepositIntent({ listingId, amount }) {
  return callWorker("/create-deposit-intent", { listingId, amount });
}

// Step 2: after Stripe.js confirms the card and the hold is authorized,
// this is what actually creates the rentalRequest document (server-side,
// after re-checking the hold with Stripe directly).
export function confirmRentalRequestWithDeposit({ paymentIntentId, listingId, startDate, endDate }) {
  return callWorker("/confirm-rental-request", { paymentIntentId, listingId, startDate, endDate });
}

export function releaseDeposit(rentalRequestId) {
  return callWorker("/release-deposit", { rentalRequestId });
}

export function captureDeposit(rentalRequestId, amount, reason, photoUrls) {
  return callWorker("/capture-deposit", { rentalRequestId, amount, reason, photoUrls });
}
