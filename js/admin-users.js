import { auth } from "./firebase.js";
import { ADMIN_WORKER_URL } from "./admin-config.js";

export function adminWorkerConfigured() {
  return !!ADMIN_WORKER_URL;
}

async function callWorker(path, body = {}) {
  if (!ADMIN_WORKER_URL) {
    throw new Error("The admin Worker isn't configured yet — set ADMIN_WORKER_URL in js/admin-config.js after deploying admin-worker/.");
  }
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch(ADMIN_WORKER_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, idToken })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Admin request failed (${res.status}).`);
  return data;
}

export function listUsers({ pageToken } = {}) {
  return callWorker("/list-users", { pageToken });
}

export function searchUsersByEmail(search) {
  return callWorker("/list-users", { search });
}

export function setAccountDisabled(targetUid, disabled) {
  return callWorker("/set-account-disabled", { targetUid, disabled });
}

export function forceSignOut(targetUid) {
  return callWorker("/force-sign-out", { targetUid });
}

export function sendPasswordReset(targetUid, targetEmail) {
  return callWorker("/send-password-reset", { targetUid, targetEmail });
}

// confirm must exactly equal targetUid — a lightweight "type to confirm"
// the admin.js UI enforces before ever calling this, and the Worker
// double-checks server-side too.
export function deleteAccount(targetUid) {
  return callWorker("/delete-user", { targetUid, confirm: targetUid });
}
