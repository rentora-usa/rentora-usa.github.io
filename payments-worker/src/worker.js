import { corsHeaders, json } from "./cors.js";
import { verifyIdToken } from "./firebaseAuth.js";
import { getDoc, createDoc, patchDoc } from "./firestore.js";
import * as stripe from "./stripe.js";

const RETURN_GRACE_HOURS = 48; // keep in sync with js/rentals.js on the frontend

const toCents = dollars => Math.round(Number(dollars) * 100);
const toDollars = cents => cents / 100;

async function requireUser(request, env) {
  const body = await request.json().catch(() => ({}));
  if (!body.idToken) throw { status: 401, message: "Missing idToken." };
  const user = await verifyIdToken(body.idToken, env.FIREBASE_API_KEY);
  return { body, user };
}

async function requireRentalRequestAccess(env, user, rentalRequestId, role) {
  const r = await getDoc(env, `rentalRequests/${rentalRequestId}`);
  if (!r) throw { status: 404, message: "Rental request not found." };
  if (role === "owner" && r.ownerId !== user.uid) {
    throw { status: 403, message: "Only the listing owner can do this." };
  }
  if (role === "either" && r.ownerId !== user.uid && !(r.renterId === user.uid && r.status === "pending")) {
    throw { status: 403, message: "Not allowed." };
  }
  return r;
}

// ---------- POST /create-deposit-intent ----------
// Called from product.js right before the renter enters their card. Creates
// an uncaptured (manual capture) Stripe hold for the listing's exact
// deposit amount. Nothing is charged — this just authorizes the hold.
async function handleCreateDepositIntent(request, env) {
  const { body, user } = await requireUser(request, env);
  const { listingId, amount } = body;

  const listing = await getDoc(env, `listings/${listingId}`);
  if (!listing) throw { status: 404, message: "Listing not found." };
  if (listing.ownerId === user.uid) throw { status: 400, message: "You can't book your own listing." };
  if (Math.round(Number(amount)) !== Math.round(Number(listing.depositAmount || 0))) {
    throw { status: 400, message: "Deposit amount doesn't match this listing." };
  }

  const pi = await stripe.createPaymentIntent(env, {
    amountCents: toCents(listing.depositAmount),
    metadata: { listingId, renterId: user.uid, ownerId: listing.ownerId }
  });
  return { clientSecret: pi.client_secret, paymentIntentId: pi.id };
}

// ---------- POST /confirm-rental-request ----------
// Called after Stripe.js confirms the card and the hold is authorized. This
// is the ONLY place a rentalRequest with depositStatus "authorized" gets
// created — a plain client Firestore write can't do this (firestore.rules
// only allows a client to create one with "n/a" or "pending"), because
// there'd be no way for a security rule to verify a real Stripe hold
// actually exists. Here we ask Stripe directly before writing anything.
async function handleConfirmRentalRequest(request, env) {
  const { body, user } = await requireUser(request, env);
  const { paymentIntentId, listingId, startDate, endDate } = body;

  const listing = await getDoc(env, `listings/${listingId}`);
  if (!listing) throw { status: 404, message: "Listing not found." };
  if (!listing.available) throw { status: 400, message: "This listing isn't available anymore." };

  const pi = await stripe.retrievePaymentIntent(env, paymentIntentId);
  if (pi.status !== "requires_capture") {
    throw { status: 400, message: `The deposit hold isn't ready yet (status: ${pi.status}).` };
  }
  if (pi.metadata.listingId !== listingId || pi.metadata.renterId !== user.uid) {
    throw { status: 400, message: "That deposit hold doesn't match this request." };
  }
  if (toCents(listing.depositAmount) !== pi.amount) {
    throw { status: 400, message: "Deposit amount mismatch." };
  }

  const start = new Date(startDate), end = new Date(endDate);
  if (!(end > start)) throw { status: 400, message: "End date must be after the start date." };

  // Defense-in-depth overlap check against the listing's known booked
  // ranges. Still not a true atomic transaction — two people could still
  // race each other between this check and one of them being accepted.
  // Closing that fully needs a Firestore transaction here; noted as a
  // follow-up rather than built now. See README §10.
  const ranges = listing.bookedRanges || [];
  const overlaps = ranges.some(r => start.getTime() < new Date(r.end).getTime() && end.getTime() > new Date(r.start).getTime());
  if (overlaps) throw { status: 409, message: "Those dates were just booked by someone else — try different dates." };

  const days = Math.max(1, Math.round((end - start) / 86400000));
  const totalPrice = days * listing.pricePerDay;
  const returnDeadline = new Date(end.getTime() + RETURN_GRACE_HOURS * 3600 * 1000);

  const id = await createDoc(env, "rentalRequests", {
    listingId,
    ownerId: listing.ownerId,
    renterId: user.uid,
    startDate: start,
    endDate: end,
    totalPrice,
    status: "pending",
    depositAmount: listing.depositAmount,
    depositPaymentIntentId: paymentIntentId,
    returnDeadline,
    returnedAt: null,
    depositStatus: "authorized",
    claimedAmount: 0,
    claimReason: "",
    claimPhotoUrls: [],
    claimedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return { id };
}

// ---------- POST /release-deposit ----------
// Owner (any time) or renter (only while still pending) can release a hold
// — cancels it on Stripe's side and marks it released in Firestore.
async function handleReleaseDeposit(request, env) {
  const { body, user } = await requireUser(request, env);
  const r = await requireRentalRequestAccess(env, user, body.rentalRequestId, "either");
  if (r.depositStatus !== "authorized") throw { status: 400, message: "There's no active hold to release." };

  if (r.depositPaymentIntentId) {
    await stripe.cancelPaymentIntent(env, r.depositPaymentIntentId);
  }
  await patchDoc(env, `rentalRequests/${r.id}`, {
    depositStatus: "released",
    returnedAt: r.returnedAt || new Date(),
    updatedAt: new Date()
  });
  return { ok: true };
}

// ---------- POST /capture-deposit ----------
// Owner only. Captures some or all of an authorized hold — either a manual
// damage claim (with a reason/photos) or the automatic overdue rule calling
// in with the full amount. One-shot: depositStatus has to still be
// "authorized" going in, so this can't be run twice on the same request.
async function handleCaptureDeposit(request, env) {
  const { body, user } = await requireUser(request, env);
  const r = await requireRentalRequestAccess(env, user, body.rentalRequestId, "owner");
  if (r.depositStatus !== "authorized") throw { status: 400, message: "There's no active hold to capture." };

  const amount = Number(body.amount);
  if (!(amount > 0) || amount > r.depositAmount) {
    throw { status: 400, message: `Amount must be between $0 and $${r.depositAmount}.` };
  }

  await stripe.capturePaymentIntent(env, r.depositPaymentIntentId, toCents(amount));
  await patchDoc(env, `rentalRequests/${r.id}`, {
    depositStatus: "captured",
    claimedAmount: amount,
    claimReason: body.reason || "Deposit claimed",
    claimPhotoUrls: body.photoUrls || [],
    claimedAt: new Date(),
    returnedAt: r.returnedAt || new Date(),
    updatedAt: new Date()
  });
  return { ok: true };
}

const ROUTES = {
  "/create-deposit-intent": handleCreateDepositIntent,
  "/confirm-rental-request": handleConfirmRentalRequest,
  "/release-deposit": handleReleaseDeposit,
  "/capture-deposit": handleCaptureDeposit
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request, env) });
    }
    const url = new URL(request.url);
    const handler = ROUTES[url.pathname];
    if (!handler || request.method !== "POST") {
      return json({ error: "Not found" }, 404, request, env);
    }
    try {
      const result = await handler(request, env);
      return json(result, 200, request, env);
    } catch (err) {
      console.error(err);
      return json({ error: err.message || "Internal error" }, err.status || 500, request, env);
    }
  }
};
