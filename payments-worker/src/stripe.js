const STRIPE_API = "https://api.stripe.com/v1";

function authHeader(env) {
  return { Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":") };
}

// Stripe's API takes application/x-www-form-urlencoded bodies with
// bracket-nested keys for objects, e.g. metadata[listingId]=abc.
function formEncode(obj, prefix = "") {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) {
      parts.push(formEncode(v, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
    }
  }
  return parts.join("&");
}

async function stripeRequest(env, method, path, body) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: { ...authHeader(env), "Content-Type": "application/x-www-form-urlencoded" },
    body: body ? formEncode(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw { status: 502, message: data.error?.message || "Stripe request failed." };
  return data;
}

export function createPaymentIntent(env, { amountCents, currency = "usd", metadata }) {
  return stripeRequest(env, "POST", "/payment_intents", {
    amount: amountCents,
    currency,
    capture_method: "manual",
    metadata
  });
}

export function retrievePaymentIntent(env, id) {
  return stripeRequest(env, "GET", `/payment_intents/${id}`);
}

export function capturePaymentIntent(env, id, amountCents) {
  return stripeRequest(env, "POST", `/payment_intents/${id}/capture`, { amount_to_capture: amountCents });
}

export async function cancelPaymentIntent(env, id) {
  try {
    return await stripeRequest(env, "POST", `/payment_intents/${id}/cancel`, {});
  } catch (err) {
    // Already canceled (e.g. Stripe auto-expired the hold after ~7 days) is
    // fine — the caller just wants Firestore to end up in sync either way.
    if (/already/i.test(err.message || "")) return null;
    throw err;
  }
}
