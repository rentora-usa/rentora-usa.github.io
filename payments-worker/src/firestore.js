// Talks to Firestore's REST API authenticated as a service account (via the
// OAuth2 JWT-bearer flow), signed with the Web Crypto API since Workers
// don't have Node's `crypto` or the `google-auth-library` package. This is
// the trusted-server access Firestore security rules were always meant to
// hand privileged operations off to — requests made this way are NOT
// subject to firestore.rules (same as the Admin SDK), which is exactly why
// deposit captures/releases have to go through here rather than a plain
// client-side Firestore write.

let cachedToken = null; // { token, expiresAt }

function base64url(bytes) {
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem) {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function getAccessToken(env) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.token;

  let sa;
  try {
    sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw { status: 500, message: "FIREBASE_SERVICE_ACCOUNT_JSON isn't valid JSON — check the Worker secret." };
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  const enc = obj => base64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${enc(header)}.${enc(claims)}`;

  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${base64url(new Uint8Array(signature))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  if (!res.ok) throw { status: 500, message: "Couldn't authenticate with Firebase — check FIREBASE_SERVICE_ACCOUNT_JSON." };
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

// ---- Firestore <-> plain JS value conversion (just the types we use) ----
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "object") return { mapValue: { fields: toFields(v) } };
  throw new Error("Unsupported Firestore value type: " + typeof v);
}
function fromValue(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return parseInt(v.integerValue, 10);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return new Date(v.timestampValue);
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  return null;
}
function toFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toValue(v);
  return fields;
}
function fromFields(fields) {
  const obj = {};
  for (const [k, v] of Object.entries(fields)) obj[k] = fromValue(v);
  return obj;
}

const baseUrl = env => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

export async function getDoc(env, path) {
  const token = await getAccessToken(env);
  const res = await fetch(`${baseUrl(env)}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw { status: 500, message: `Firestore read failed (${res.status}).` };
  const data = await res.json();
  return { id: path.split("/").pop(), ...fromFields(data.fields || {}) };
}

export async function createDoc(env, collectionPath, fields) {
  const token = await getAccessToken(env);
  const res = await fetch(`${baseUrl(env)}/${collectionPath}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFields(fields) })
  });
  if (!res.ok) throw { status: 500, message: `Firestore create failed (${res.status}): ${await res.text()}` };
  const data = await res.json();
  return data.name.split("/").pop();
}

export async function patchDoc(env, path, fields) {
  const token = await getAccessToken(env);
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const res = await fetch(`${baseUrl(env)}/${path}?${mask}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFields(fields) })
  });
  if (!res.ok) throw { status: 500, message: `Firestore update failed (${res.status}): ${await res.text()}` };
}
