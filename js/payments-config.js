// Fill these in once you've deployed payments-worker/ (see README §10) and
// created a Stripe account. Leave PAYMENTS_WORKER_URL blank and the site
// keeps working exactly as before — deposits stay in ledger-only mode
// (tracked, but no real card hold), no code changes needed either way.

// Your deployed Cloudflare Worker's URL, e.g.
// "https://rentora-payments.yourname.workers.dev"
export const PAYMENTS_WORKER_URL = "";

// Your Stripe TEST publishable key (starts with pk_test_). This one is
// safe to expose client-side — it's not a secret, unlike the key that
// lives in the Worker.
export const STRIPE_PUBLISHABLE_KEY = "";
