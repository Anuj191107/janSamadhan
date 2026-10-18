import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { sendPhase5Event } from "./phase5-backend.js";

const params = new URLSearchParams(location.search);
const complaintId = params.get("id");
const statusText = (s) => String(s || "SUBMITTED").toUpperCase();

export async function withdrawComplaint(id, user) {
  const ref = doc(db, "complaints", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Complaint not found.");
  const data = snap.data();
  if (data.userId !== user.uid) throw new Error("You can withdraw only your own complaint.");
  if (!["SUBMITTED", "UNDER_REVIEW", "IN_PROGRESS"].includes(statusText(data.status))) {
    throw new Error("This complaint can no longer be withdrawn at its current status.");
  }
  if (!confirm("Withdraw this complaint? Its history will be preserved.")) return false;
  await updateDoc(ref, { status: "WITHDRAWN", statusUpdatedAt: serverTimestamp(), statusUpdatedBy: user.uid });
  return true;
}

export async function respondToResolution(id, user, response) {
  const ref = doc(db, "complaints", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Complaint not found.");
  const data = snap.data();
  if (data.userId !== user.uid) throw new Error("Only the reporting citizen can verify this complaint.");
  if (statusText(data.status) !== "RESOLVED" || data.resolutionConfirmation !== "PENDING") {
    throw new Error("This complaint is not awaiting your resolution confirmation.");
  }
  const confirmation = response === "confirm" ? "CONFIRMED" : "REOPEN_REQUESTED";
  const feedback = response === "confirm" ? "Citizen confirmed resolution" : "Citizen reports issue remains unresolved";
  await updateDoc(ref, { resolutionConfirmation: confirmation, resolutionConfirmedAt: serverTimestamp(), resolutionFeedback: feedback });
  sendPhase5Event("resolutionResponse", id).catch((e) => console.warn("Resolution notification backend needs setup:", e));
  return true;
}

export function attachComplaintActions(container, complaint, user) {
  if (!container || !user || !complaint || complaint.userId !== user.uid) return;
  const status = statusText(complaint.status);
  if (["SUBMITTED", "UNDER_REVIEW", "IN_PROGRESS"].includes(status)) {
    const withdraw = document.createElement("button");
    withdraw.type = "button"; withdraw.className = "phase5-danger-button"; withdraw.textContent = "Withdraw complaint";
    withdraw.addEventListener("click", async () => {
      withdraw.disabled = true;
      try { if (await withdrawComplaint(complaint.id, user)) location.reload(); }
      catch (e) { alert(e.message || "Could not withdraw complaint."); withdraw.disabled = false; }
    });
    container.appendChild(withdraw);
  }
  if (status === "RESOLVED" && complaint.resolutionConfirmation === "PENDING") {
    const panel = document.createElement("section"); panel.className = "phase5-resolution-panel";
    const title = document.createElement("h3"); title.textContent = "Has this issue actually been resolved?"; panel.appendChild(title);
    const note = document.createElement("p"); note.textContent = "The report remains awaiting your confirmation. If the issue is still present, request a review."; panel.appendChild(note);
    const confirmButton = document.createElement("button"); confirmButton.type = "button"; confirmButton.className = "view-button"; confirmButton.textContent = "Confirm resolution";
    const reopenButton = document.createElement("button"); reopenButton.type = "button"; reopenButton.className = "phase5-secondary-button"; reopenButton.textContent = "Issue not resolved";
    const submit = async (response, button) => { confirmButton.disabled = reopenButton.disabled = true; try { await respondToResolution(complaint.id, user, response); alert(response === "confirm" ? "Resolution confirmed. Thank you." : "Review requested. The government team will be notified when notification service is configured."); location.reload(); } catch (e) { alert(e.message || "Could not save your response."); confirmButton.disabled = reopenButton.disabled = false; } };
    confirmButton.addEventListener("click", () => submit("confirm", confirmButton));
    reopenButton.addEventListener("click", () => submit("reopen", reopenButton));
    panel.append(confirmButton, reopenButton); container.appendChild(panel);
  }
}

export function mountPhase5Notifications() {
  const nav = document.querySelector(".app-header nav");
  if (!nav || document.getElementById("phase5NotificationLink")) return;
  const link = document.createElement("a"); link.id = "phase5NotificationLink"; link.href = "notifications.html"; link.textContent = "Notifications"; nav.insertBefore(link, nav.firstChild);
}

onAuthStateChanged(auth, (user) => { if (user) mountPhase5Notifications(); });
