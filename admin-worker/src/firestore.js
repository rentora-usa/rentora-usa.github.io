import { getAccessToken } from "./googleAuth.js";

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
export async function isStaff(env, uid) {
  const token = await getAccessToken(env);
  const res = await fetch(`${baseUrl(env)}/staff/${uid}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return false;
  if (!res.ok) throw { status: 500, message: `Firestore read failed (${res.status}).` };
  return true;
}

export async function writeAuditLog(env, entry) {
  const token = await getAccessToken(env);
  await fetch(`${baseUrl(env)}/adminAuditLog`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFields({ ...entry, createdAt: new Date() }) })
  }).catch(err => console.error("writeAuditLog failed", err)); // never block the actual action on logging
}
