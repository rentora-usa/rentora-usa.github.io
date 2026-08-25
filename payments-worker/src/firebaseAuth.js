// Verifies a Firebase Auth ID token by asking Google's own Identity Toolkit
// REST API whether it's valid, rather than verifying the JWT signature
// ourselves. This is the standard approach for edge runtimes (like Workers)
// that don't run the Node-only Firebase Admin SDK. It costs one extra
// network round-trip per request; fine at this scale.
export async function verifyIdToken(idToken, apiKey) {
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
