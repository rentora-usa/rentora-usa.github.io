import { auth, db } from "./firebase.js";
import {
  collection, doc, setDoc, getDoc, updateDoc, addDoc,
  query, where, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// One thread per (listing, renter) pair — deterministic id so "Message
// owner" always reopens the same conversation instead of creating a new
// one every time.
function conversationId(listingId, renterId) {
  return `${listingId}_${renterId}`;
}

// IMPORTANT: this used to getDoc() the conversation first to check whether
// it existed before deciding to create it. That doesn't work — the read
// rule requires the requester to already be listed in `participants`, and
// for a conversation that doesn't exist yet there's no resource to check
// against, so Firestore denies the read outright. That was the actual bug
// behind "the chat system doesn't work": starting a *new* conversation
// threw permission-denied before it ever got the chance to create one.
//
// The fix: skip the existence check entirely and setDoc with merge:true.
// Firestore evaluates that as a "create" when the doc is new and an
// "update" when it isn't, and merge:true leaves lastMessage/lastMessageAt
// untouched on repeat calls instead of resetting the thread every time
// "Message owner" is clicked again.
export async function startOrOpenConversation({ listingId, listingTitle, ownerId, renterId }) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("You must be logged in to message.");
  const actualRenterId = renterId || (uid === ownerId ? null : uid);
  if (!actualRenterId) throw new Error("A renter must be specified to start this conversation.");

  const id = conversationId(listingId, actualRenterId);
  const ref = doc(db, "conversations", id);
  await setDoc(ref, {
    listingId,
    listingTitle: listingTitle || "",
    ownerId,
    renterId: actualRenterId,
    participants: [ownerId, actualRenterId]
  }, { merge: true });
  return id;
}

// Not ordered server-side (array-contains + orderBy needs a composite
// index) — fetched flat and sorted client-side instead, consistent with
// the rest of the app's indexless approach.
export function subscribeConversations(uid, callback) {
  const q = query(collection(db, "conversations"), where("participants", "array-contains", uid));
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.lastMessageAt?.toMillis?.() || 0) - (a.lastMessageAt?.toMillis?.() || 0));
    callback(items);
  }, err => console.error("subscribeConversations", err));
}

export function subscribeMessages(convId, callback) {
  const q = query(collection(db, "conversations", convId, "messages"), orderBy("createdAt", "asc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => console.error("subscribeMessages", err));
}

export async function fetchConversation(convId) {
  const snap = await getDoc(doc(db, "conversations", convId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function sendMessage(convId, text) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("You must be logged in to message.");
  const trimmed = text.trim();
  if (!trimmed) return;

  await addDoc(collection(db, "conversations", convId, "messages"), {
    senderId: uid,
    text: trimmed,
    createdAt: serverTimestamp()
  });
  await updateDoc(doc(db, "conversations", convId), {
    lastMessage: trimmed.slice(0, 200),
    lastMessageAt: serverTimestamp(),
    lastSenderId: uid,
    [`lastRead.${uid}`]: serverTimestamp()
  });
}

export async function markConversationRead(convId, uid) {
  return updateDoc(doc(db, "conversations", convId), {
    [`lastRead.${uid}`]: serverTimestamp()
  });
}

export function isUnread(conversation, uid) {
  if (!conversation.lastMessageAt || conversation.lastSenderId === uid) return false;
  const lastRead = conversation.lastRead?.[uid];
  if (!lastRead) return !!conversation.lastMessage;
  return conversation.lastMessageAt.toMillis() > lastRead.toMillis();
}
