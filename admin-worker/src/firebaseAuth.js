// Verifies a Firebase Auth ID token via Google's Identity Toolkit REST API
// rather than checking the JWT signature ourselves — the standard approach
// for edge runtimes without the Node-only Admin SDK. Same technique as
// payments-worker/src/firebaseAuth.js.
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
