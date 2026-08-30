import { db } from "./firebase.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

export async function submitCorporateInquiry({ name, email, subject, message }) {
  return addDoc(collection(db, "corporateInquiries"), {
    name: name.trim(),
    email: email.trim(),
    subject: (subject || "").trim(),
    message: message.trim(),
    createdAt: serverTimestamp()
  });
}
