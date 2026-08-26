import { db } from "./firebase.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, onSnapshot,
  query, orderBy, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const componentsRef = collection(db, "statusComponents");
const incidentsRef = collection(db, "statusIncidents");

export const COMPONENT_STATUSES = [
  { id: "operational", label: "Operational" },
  { id: "degraded", label: "Degraded Performance" },
  { id: "partial_outage", label: "Partial Outage" },
  { id: "major_outage", label: "Major Outage" }
];

export const INCIDENT_STATUSES = [
  { id: "investigating", label: "Investigating" },
  { id: "identified", label: "Identified" },
  { id: "monitoring", label: "Monitoring" },
  { id: "resolved", label: "Resolved" }
];

// ---------- Components ----------
export function subscribeComponents(callback) {
  const q = query(componentsRef, orderBy("order", "asc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => console.error("subscribeComponents", err));
}

export async function createComponent(name) {
  const snap = await getDocs(componentsRef); // just to pick the next display order
  return addDoc(componentsRef, {
    name: name.trim(),
    status: "operational",
    order: snap.size,
    updatedAt: serverTimestamp()
  });
}

export async function updateComponentStatus(id, status) {
  return updateDoc(doc(db, "statusComponents", id), { status, updatedAt: serverTimestamp() });
}

export async function renameComponent(id, name) {
  return updateDoc(doc(db, "statusComponents", id), { name: name.trim(), updatedAt: serverTimestamp() });
}

export async function deleteComponent(id) {
  return deleteDoc(doc(db, "statusComponents", id));
}

// ---------- Incidents ----------
// Each incident carries its own timeline as an array of {status, message,
// createdAt} entries — Discord-style. serverTimestamp() can't be used
// *inside* an array element (Firestore doesn't resolve it there), so
// per-update timestamps use Timestamp.now() (client clock) instead; the
// incident document's own top-level createdAt/updatedAt still use the
// real server timestamp.
export function subscribeIncidents(callback, take = 20) {
  const q = query(incidentsRef, orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, take)),
    err => console.error("subscribeIncidents", err));
}

export async function createIncident({ title, impact, message }) {
  return addDoc(incidentsRef, {
    title: title.trim(),
    impact,
    status: "investigating",
    updates: [{ status: "investigating", message: message.trim(), createdAt: Timestamp.now() }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    resolvedAt: null
  });
}

export async function addIncidentUpdate(incident, { status, message }) {
  const updates = [...(incident.updates || []), { status, message: message.trim(), createdAt: Timestamp.now() }];
  return updateDoc(doc(db, "statusIncidents", incident.id), {
    status,
    updates,
    updatedAt: serverTimestamp(),
    resolvedAt: status === "resolved" ? serverTimestamp() : (incident.resolvedAt || null)
  });
}

export async function deleteIncident(id) {
  return deleteDoc(doc(db, "statusIncidents", id));
}
