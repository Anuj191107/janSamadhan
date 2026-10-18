import { auth } from "./firebase.js";
// Set this to the NEW Phase 5 Apps Script web-app URL after deploying it.
// Keep the existing complaint-image upload URL in js/report.js unchanged.
export const PHASE5_BACKEND_URL = "https://script.google.com/macros/s/AKfycbxg21hdXTHhhVSHEBZ19TN_38KQ8TFTdh-8lOd5j-PkEANgY1-7030XhzsKYsCS6QPTww/exec";
export async function sendPhase5Event(action, complaintId) {
  const user = auth.currentUser;
  if (!user || !complaintId || PHASE5_BACKEND_URL.startsWith("PASTE_")) return { configured: false };
  const idToken = await user.getIdToken();
  const response = await fetch(PHASE5_BACKEND_URL, {
    method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, complaintId, idToken })
  });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || "Notification service rejected the request.");
  return { configured: true, ...result };
}
