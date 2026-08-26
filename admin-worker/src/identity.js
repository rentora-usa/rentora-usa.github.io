import { getAccessToken } from "./googleAuth.js";

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

export async function listUsers(env, { pageToken, maxResults = 50 } = {}) {
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

export async function findUsersByEmail(env, emailQuery) {
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

export async function setUserDisabled(env, uid, disabled) {
  await idtRequest(env, "/accounts:update", { localId: uid, disableUser: disabled });
}

// Forces every existing session/token for this user to stop working
// immediately, on top of (or instead of) disabling the account outright.
export async function forceSignOut(env, uid) {
  await idtRequest(env, "/accounts:update", { localId: uid, validSince: String(Math.floor(Date.now() / 1000)) });
}

// Sends Firebase's own password-reset email — staff never see or set the
// actual password this way, the user resets it themselves via the link.
export async function sendPasswordResetEmail(env, email) {
  await idtRequest(env, "/accounts:sendOobCode", { requestType: "PASSWORD_RESET", email });
}

export async function deleteUser(env, uid) {
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
