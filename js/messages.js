import { auth, db } from "./firebase.js";
import {
  collection, doc, getDoc, setDoc, updateDoc, addDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// One thread per (listing, renter) pair — deterministic id so "Message
// owner" always reopens the same conversation instead of creating a new
// one every time.
function conversationId(listingId, renterId) {
  return `${listingId}_${renterId}`;
}

export async function startOrOpenConversation({ listingId, listingTitle, ownerId, renterId }) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("You must be logged in to message.");
  const actualRenterId = renterId || (uid === ownerId ? null : uid);
  if (!actualRenterId) throw new Error("A renter must be specified to start this conversation.");

  const id = conversationId(listingId, actualRenterId);
  const ref = doc(db, "conversations", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      listingId,
      listingTitle: listingTitle || "",
      ownerId,
      renterId: actualRenterId,
      participants: [ownerId, actualRenterId],
      lastMessage: "",
      lastMessageAt: serverTimestamp(),
      lastSenderId: "",
      lastRead: {}
    });
  }
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
  });
}

export function subscribeMessages(convId, callback) {
  const q = query(collection(db, "conversations", convId, "messages"), orderBy("createdAt", "asc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
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

// Used by the header badge — a conversation counts as unread if its last
// message wasn't sent by this person and arrived after they last opened it.
export function isUnread(conversation, uid) {
  if (!conversation.lastMessageAt || conversation.lastSenderId === uid) return false;
  const lastRead = conversation.lastRead?.[uid];
  if (!lastRead) return !!conversation.lastMessage;
  return conversation.lastMessageAt.toMillis() > lastRead.toMillis();
}
