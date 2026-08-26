import { auth, db } from "./firebase.js";
import {
  collection, doc, addDoc, updateDoc, getDoc, setDoc,
  query, where, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const ticketsRef = collection(db, "supportTickets");

// The 5-stage lifecycle a ticket moves through, in order. "closed" is a
// hard stop — see canPostToTicket() in firestore.rules — nobody can post
// another message until it's reopened, which resets it to "received".
export const TICKET_STAGES = [
  { id: "received", label: "Received" },
  { id: "read", label: "Read" },
  { id: "in_progress", label: "In Progress" },
  { id: "resolved", label: "Resolved" },
  { id: "closed", label: "Closed" }
];

// ---------- Staff membership & profile ----------
// Staff accounts are provisioned manually in the Firebase console (create a
// doc at staff/{uid}) — see README §8. There's no in-app way to grant staff
// access, on purpose: it must not be something a signed-in user can do to
// themselves.
export async function isStaffUser(uid) {
  if (!uid) return false;
  const snap = await getDoc(doc(db, "staff", uid));
  return snap.exists();
}

export async function fetchStaffProfile(uid) {
  const snap = await getDoc(doc(db, "staff", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// The name/photo a staff member chats under — separate from their personal
// Rentora profile, so support can have a distinct identity (e.g. "Jamie —
// Rentora Support") without exposing their personal listing-owner profile.
export async function saveStaffProfile(uid, { displayName, photoURL }) {
  return setDoc(doc(db, "staff", uid), {
    displayName: displayName.trim(),
    photoURL: (photoURL || "").trim()
  }, { merge: true });
}

// ---------- Tickets ----------
export async function createTicket(subject, firstMessage) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be logged in to open a ticket.");
  const userName = user.displayName || (user.email ? user.email.split("@")[0] : "Rentora user");

  const ref = await addDoc(ticketsRef, {
    userId: user.uid,
    userName,
    userEmail: user.email || "",
    subject: subject.trim().slice(0, 150),
    status: "received",
    assignedStaffId: "",
    assignedStaffName: "",
    lastMessage: "",
    lastMessageAt: serverTimestamp(),
    lastSenderId: "",
    createdAt: serverTimestamp()
  });

  if (firstMessage && firstMessage.trim()) {
    await sendTicketMessage(ref.id, firstMessage, { isStaff: false });
  }
  return ref.id;
}

export function subscribeMyTickets(uid, callback) {
  const q = query(ticketsRef, where("userId", "==", uid));
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.lastMessageAt?.toMillis?.() || 0) - (a.lastMessageAt?.toMillis?.() || 0));
    callback(items);
  }, err => console.error("subscribeMyTickets", err));
}

// Staff-only (enforced by firestore.rules) — every ticket, live.
export function subscribeAllTickets(callback) {
  return onSnapshot(ticketsRef, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.lastMessageAt?.toMillis?.() || 0) - (a.lastMessageAt?.toMillis?.() || 0));
    callback(items);
  }, err => console.error("subscribeAllTickets", err));
}

export function subscribeTicketMessages(ticketId, callback) {
  const q = query(collection(db, "supportTickets", ticketId, "messages"), orderBy("createdAt", "asc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => console.error("subscribeTicketMessages", err));
}

// currentStatus is passed in (rather than re-read from Firestore) since the
// caller already has the ticket in memory — this is just to decide whether
// a staff reply should auto-advance the stage tracker, not for security;
// firestore.rules is what actually blocks posting into a closed ticket.
export async function sendTicketMessage(ticketId, text, { isStaff, staffName, currentStatus } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be logged in to message.");
  const trimmed = text.trim();
  if (!trimmed) return;

  await addDoc(collection(db, "supportTickets", ticketId, "messages"), {
    senderId: user.uid,
    senderRole: isStaff ? "staff" : "user",
    senderName: isStaff ? (staffName || "Support") : (user.displayName || "You"),
    text: trimmed,
    createdAt: serverTimestamp()
  });

  const updates = {
    lastMessage: trimmed.slice(0, 200),
    lastMessageAt: serverTimestamp(),
    lastSenderId: user.uid
  };
  // A staff member actually replying is a good, low-friction signal that
  // the ticket has moved from "received/read" into "in_progress" — no
  // separate click required. Staff can still override with any stage
  // manually (setTicketStage) if this isn't the right moment for that.
  if (isStaff && (currentStatus === "received" || currentStatus === "read")) {
    updates.status = "in_progress";
  }
  await updateDoc(doc(db, "supportTickets", ticketId), updates);
}

// Explicit claim action (a button in the admin panel) rather than
// auto-assigning on every reply — keeps ownership of a ticket predictable
// when more than one staff member is around.
export async function claimTicket(ticketId, staffId, staffName) {
  return updateDoc(doc(db, "supportTickets", ticketId), {
    assignedStaffId: staffId,
    assignedStaffName: staffName
  });
}

// Staff: jump the tracker to any of the 5 stages directly.
export async function setTicketStage(ticketId, stage) {
  return updateDoc(doc(db, "supportTickets", ticketId), { status: stage });
}

// The one thing a staff member opening a ticket does automatically — moves
// "received" to "read" the first time someone actually looks at it. A
// no-op (and no write) if it's already past that stage.
export async function markTicketRead(ticketId, currentStatus) {
  if (currentStatus !== "received") return;
  return updateDoc(doc(db, "supportTickets", ticketId), { status: "read" });
}

// Closing works the same way for the ticket owner or staff; reopening
// (owner-side) always resets to "received" — a fresh cycle for staff to
// re-triage, per firestore.rules.
export async function closeTicket(ticketId) {
  return updateDoc(doc(db, "supportTickets", ticketId), { status: "closed" });
}
export async function reopenTicket(ticketId) {
  return updateDoc(doc(db, "supportTickets", ticketId), { status: "received" });
}
