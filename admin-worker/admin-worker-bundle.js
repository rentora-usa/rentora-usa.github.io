// ============================================================
// Rentora Admin Worker — bundled single-file build
//
// This is admin-worker/src/*.js merged into one file so it can be pasted
// directly into Cloudflare's browser-based Worker editor, with no local
// Node.js/wrangler install needed. If you ever want the readable
// multi-file version (for local dev, or just easier editing), it's in
// admin-worker/src/ in the main project — this file is generated from it.
//
// After pasting this in:
//   1. Go to the Worker's Settings -> Variables tab
//   2. Add three plain-text variables:
//        FIREBASE_PROJECT_ID = rentora-415ca
//        FIREBASE_API_KEY    = (your Firebase Web API key)
//        ALLOWED_ORIGIN      = *   (tighten to your real site origin later)
//   3. Add one variable and click "Encrypt" on it:
//        FIREBASE_SERVICE_ACCOUNT_JSON = (paste the whole service-account
//        JSON file's contents as one value)
//   4. Save and deploy.
// ============================================================

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const wildcard = env.ALLOWED_ORIGIN === "*";
  const allowed = wildcard || origin === env.ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed ? (wildcard ? "*" : origin) : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin"
  };
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request, env) }
  });
}


// Verifies a Firebase Auth ID token via Google's Identity Toolkit REST API
// rather than checking the JWT signature ourselves — the standard approach
// for edge runtimes without the Node-only Admin SDK. Same technique as
// payments-worker/src/firebaseAuth.js.
async function verifyIdToken(idToken, apiKey) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });
  if (!res.ok) throw { status: 401, message: "Invalid or expired sign-in — please log in again." };
  const data = await res.json();
  const user = data.users?.[0];
  if (!user) throw { status: 401, message: "Invalid or expired sign-in — please log in again." };
  return { uid: user.localId, email: user.email || "" };
}


// Signs a JWT with the service account's private key (via Web Crypto,
// since Workers don't have Node's crypto or google-auth-library) and
// exchanges it for an OAuth2 access token scoped for both Firestore (to
// check staff membership) and the Identity Toolkit admin API (to actually
// manage accounts). Same technique as payments-worker/src/firestore.js,
// just requesting a broader set of scopes.

const SCOPES = [
  "https://www.googleapis.com/auth/datastore",
  "https://www.googleapis.com/auth/identitytoolkit"
].join(" ");

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
    scope: SCOPES,
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



const baseUrl = env => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

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
function toFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toValue(v);
  return fields;
}

// exists()-style check — doesn't need the document contents, just whether
// a staff/{uid} doc is there. This is what makes the Worker's own staff
// gate independent of (and just as strict as) firestore.rules' isStaff().
async function isStaff(env, uid) {
  const token = await getAccessToken(env);
  const res = await fetch(`${baseUrl(env)}/staff/${uid}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return false;
  if (!res.ok) throw { status: 500, message: `Firestore read failed (${res.status}).` };
  return true;
}

async function writeAuditLog(env, entry) {
  const token = await getAccessToken(env);
  await fetch(`${baseUrl(env)}/adminAuditLog`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFields({ ...entry, createdAt: new Date() }) })
  }).catch(err => console.error("writeAuditLog failed", err)); // never block the actual action on logging
}



const IDT_BASE = env => `https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}`;

async function idtRequest(env, path, body) {
  const token = await getAccessToken(env);
  const res = await fetch(`${IDT_BASE(env)}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: 502, message: data.error?.message || "Identity admin request failed." };
  return data;
}

// Firebase Auth never stores passwords in a recoverable form — there is no
// endpoint anywhere, including this one, that returns a user's actual
// password. What's below is everything that's actually possible: looking
// users up, disabling/enabling, forcing sign-out, resetting via email, and
// deleting.

async function listUsers(env, { pageToken, maxResults = 50 } = {}) {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (pageToken) params.set("nextPageToken", pageToken);
  const token = await getAccessToken(env);
  const res = await fetch(`${IDT_BASE(env)}/accounts:batchGet?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: 502, message: data.error?.message || "Couldn't list users." };
  return {
    users: (data.userInfo || []).map(sanitizeUser),
    nextPageToken: data.nextPageToken || null
  };
}

async function findUsersByEmail(env, emailQuery) {
  // batchGet has no search/filter param, so for a search box we page
  // through and filter client-side (Worker-side) by substring match. Fine
  // at the scale a single marketplace's user base is likely to hit; if
  // this ever gets slow, Firestore's own users/{uid} docs (which already
  // store email) could be queried instead and cross-referenced.
  const q = emailQuery.toLowerCase();
  let pageToken, matches = [], pages = 0;
  do {
    const { users, nextPageToken } = await listUsers(env, { pageToken, maxResults: 1000 });
    matches.push(...users.filter(u => (u.email || "").toLowerCase().includes(q)));
    pageToken = nextPageToken;
    pages++;
  } while (pageToken && pages < 10 && matches.length < 50);
  return matches.slice(0, 50);
}

async function setUserDisabled(env, uid, disabled) {
  await idtRequest(env, "/accounts:update", { localId: uid, disableUser: disabled });
}

// Forces every existing session/token for this user to stop working
// immediately, on top of (or instead of) disabling the account outright.
async function forceSignOut(env, uid) {
  await idtRequest(env, "/accounts:update", { localId: uid, validSince: String(Math.floor(Date.now() / 1000)) });
}

// Sends Firebase's own password-reset email — staff never see or set the
// actual password this way, the user resets it themselves via the link.
async function sendPasswordResetEmail(env, email) {
  await idtRequest(env, "/accounts:sendOobCode", { requestType: "PASSWORD_RESET", email });
}

async function deleteUser(env, uid) {
  await idtRequest(env, "/accounts:delete", { localId: uid });
}

function sanitizeUser(u) {
  return {
    uid: u.localId,
    email: u.email || "",
    displayName: u.displayName || "",
    disabled: !!u.disabled,
    emailVerified: !!u.emailVerified,
    providerIds: (u.providerUserInfo || []).map(p => p.providerId),
    createdAt: u.createdAt || null,
    lastLoginAt: u.lastLoginAt || null
  };
}



// Every route requires a valid Firebase ID token AND a real staff/{uid}
// Firestore doc for that uid — checked here independently, not trusted
// from the client, exactly like firestore.rules' own isStaff() does for
// Firestore-native actions.
async function requireStaff(request, env) {
  const body = await request.json().catch(() => ({}));
  if (!body.idToken) throw { status: 401, message: "Missing idToken." };
  const user = await verifyIdToken(body.idToken, env.FIREBASE_API_KEY);
  const staff = await isStaff(env, user.uid);
  if (!staff) throw { status: 403, message: "Staff access required." };
  return { body, staff: user };
}

async function handleListUsers(request, env) {
  const { body } = await requireStaff(request, env);
  if (body.search && body.search.trim()) {
    return { users: await findUsersByEmail(env, body.search.trim()), nextPageToken: null };
  }
  return listUsers(env, { pageToken: body.pageToken });
}

async function handleSetDisabled(request, env) {
  const { body, staff } = await requireStaff(request, env);
  const { targetUid, disabled } = body;
  if (!targetUid) throw { status: 400, message: "Missing targetUid." };
  await setUserDisabled(env, targetUid, !!disabled);
  await writeAuditLog(env, {
    staffId: staff.uid, staffEmail: staff.email,
    action: disabled ? "disable_account" : "enable_account",
    targetType: "user", targetId: targetUid, details: ""
  });
  return { ok: true };
}

async function handleForceSignOut(request, env) {
  const { body, staff } = await requireStaff(request, env);
  const { targetUid } = body;
  if (!targetUid) throw { status: 400, message: "Missing targetUid." };
  await forceSignOut(env, targetUid);
  await writeAuditLog(env, {
    staffId: staff.uid, staffEmail: staff.email,
    action: "force_sign_out", targetType: "user", targetId: targetUid, details: ""
  });
  return { ok: true };
}

async function handleSendPasswordReset(request, env) {
  const { body, staff } = await requireStaff(request, env);
  const { targetUid, targetEmail } = body;
  if (!targetEmail) throw { status: 400, message: "Missing targetEmail." };
  await sendPasswordResetEmail(env, targetEmail);
  await writeAuditLog(env, {
    staffId: staff.uid, staffEmail: staff.email,
    action: "send_password_reset", targetType: "user", targetId: targetUid || targetEmail, details: targetEmail
  });
  return { ok: true };
}

async function handleDeleteUser(request, env) {
  const { body, staff } = await requireStaff(request, env);
  const { targetUid, confirm } = body;
  if (!targetUid) throw { status: 400, message: "Missing targetUid." };
  if (confirm !== targetUid) throw { status: 400, message: "Confirmation didn't match — nothing was deleted." };
  await deleteUser(env, targetUid);
  await writeAuditLog(env, {
    staffId: staff.uid, staffEmail: staff.email,
    action: "delete_account", targetType: "user", targetId: targetUid,
    details: "Firebase Auth account deleted. Firestore data (listings, reviews, etc.) is NOT automatically cleaned up."
  });
  return { ok: true };
}

const ROUTES = {
  "/list-users": handleListUsers,
  "/set-account-disabled": handleSetDisabled,
  "/force-sign-out": handleForceSignOut,
  "/send-password-reset": handleSendPasswordReset,
  "/delete-user": handleDeleteUser
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

