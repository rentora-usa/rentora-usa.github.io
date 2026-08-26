import { corsHeaders, json } from "./cors.js";
import { verifyIdToken } from "./firebaseAuth.js";
import { isStaff, writeAuditLog } from "./firestore.js";
import * as identity from "./identity.js";

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
    return { users: await identity.findUsersByEmail(env, body.search.trim()), nextPageToken: null };
  }
  return identity.listUsers(env, { pageToken: body.pageToken });
}

async function handleSetDisabled(request, env) {
  const { body, staff } = await requireStaff(request, env);
  const { targetUid, disabled } = body;
  if (!targetUid) throw { status: 400, message: "Missing targetUid." };
  await identity.setUserDisabled(env, targetUid, !!disabled);
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
  await identity.forceSignOut(env, targetUid);
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
  await identity.sendPasswordResetEmail(env, targetEmail);
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
  await identity.deleteUser(env, targetUid);
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
