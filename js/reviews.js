import { auth, db } from "./firebase.js";
import {
  collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const reviewsRef = collection(db, "reviews");

// Deterministic id ("{rentalRequestId}_{authorId}") enforced by
// firestore.rules: one review per person per completed rental. Calling this
// again just edits the existing review instead of creating a duplicate.
export async function submitReview({ rentalRequestId, listingId, targetUserId, rating, text }) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("You must be logged in to leave a review.");
  const id = `${rentalRequestId}_${uid}`;
  return setDoc(doc(db, "reviews", id), {
    rentalRequestId,
    listingId,
    authorId: uid,
    targetUserId,
    rating,
    text: text || "",
    createdAt: serverTimestamp()
  });
}

// Reviews get computed live from the reviews collection rather than trusting
// a stored aggregate on the user doc — that keeps the star rating honest
// without needing a Cloud Function to recompute it server-side.
export async function fetchReviewsForUser(uid) {
  const snap = await getDocs(query(reviewsRef, where("targetUserId", "==", uid)));
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  return items;
}

export function averageRating(reviews) {
  if (!reviews.length) return 0;
  return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
}

export async function fetchMyReviewFor(rentalRequestId) {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(db, "reviews", `${rentalRequestId}_${uid}`));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
