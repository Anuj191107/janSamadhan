/** Jan Samadhan Phase 5 notification backend.
 * Deploy as a separate Apps Script web app, execute as project owner.
 * Requires the script owner's Google account to have appropriate Firestore access.
 * Never expose ScriptApp.getOAuthToken() to the browser.
 */
const PROJECT_ID = "jan-samadhan-a4164";
const FIREBASE_WEB_API_KEY = "PASTE_FIREBASE_WEB_API_KEY_HERE";
const DISLIKE_THRESHOLD = 5;

function doPost(e) {
  try {
    const input = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const user = verifyIdToken_(input.idToken);
    if (!user) return json_({ success: false, error: "Sign-in token is invalid or expired." });
    const profile = getDocument_("users/" + user.localId);
    if (!profile) return json_({ success: false, error: "User profile not found." });
    let result;
    switch (input.action) {
      case "complaintSubmitted": result = handleSubmitted_(user, input); break;
      case "statusUpdated": result = handleStatusUpdated_(user, profile, input); break;
      case "reactionChanged": result = handleReactionChanged_(user, input); break;
      case "resolutionResponse": result = handleResolutionResponse_(user, input); break;
      default: return json_({ success: false, error: "Unsupported action." });
    }
    return json_({ success: true, result: result || "processed" });
  } catch (err) {
    console.error(err && err.stack || err);
    return json_({ success: false, error: "The notification request could not be processed." });
  }
}

function verifyIdToken_(idToken) {
  if (!idToken || FIREBASE_WEB_API_KEY.indexOf("PASTE_") === 0) throw new Error("Configure Firebase web API key first.");
  const response = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(FIREBASE_WEB_API_KEY), {
    method: "post", contentType: "application/json", payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) return null;
  const payload = JSON.parse(response.getContentText());
  const user = payload.users && payload.users[0];
  return user && user.localId && user.disabled !== true ? user : null;
}

function handleSubmitted_(user, input) {
  const c = getDocument_("complaints/" + safeId_(input.complaintId));
  if (!c || c.userId !== user.localId) throw new Error("Complaint ownership check failed.");
  createNotification_(user.localId, "complaint_submitted_" + input.complaintId, "Complaint submitted", "Your complaint was submitted successfully.", input.complaintId, "submission");
  return "submission notification created";
}

function handleStatusUpdated_(user, profile, input) {
  if (profile.role !== "government") throw new Error("Government role required.");
  const c = getDocument_("complaints/" + safeId_(input.complaintId));
  if (!c || c.statusUpdatedBy !== user.localId) throw new Error("Status update authorization failed.");
  const status = String(c.status || "SUBMITTED").replace(/_/g, " ");
  createNotification_(c.userId, "status_" + input.complaintId + "_" + String(c.statusUpdatedAt || "updated").replace(/[^A-Za-z0-9]/g, ""), "Complaint status updated", "Your complaint status is now " + status + ".", input.complaintId, "status");
  if (c.status === "RESOLVED" && c.resolutionConfirmation === "PENDING") {
    createNotification_(c.userId, "resolution_pending_" + input.complaintId, "Please verify the resolution", "The government marked this complaint as resolved. Please confirm whether the issue has actually been fixed.", input.complaintId, "resolution");
  }
  return "status notification created";
}

function handleReactionChanged_(user, input) {
  const id = safeId_(input.complaintId);
  const c = getDocument_("complaints/" + id);
  if (!c) throw new Error("Complaint not found.");
  const reaction = getDocument_("complaints/" + id + "/reactions/" + user.localId);
  if (!reaction || reaction.type !== "dislike") return "no dislike threshold check needed";
  const reactions = listDocuments_("complaints/" + id + "/reactions");
  const dislikes = reactions.filter(r => r.fields && r.fields.type && r.fields.type.stringValue === "dislike").length;
  if (dislikes < DISLIKE_THRESHOLD) return "threshold not reached";
  createNotification_(c.userId, "dislike_threshold_" + id, "Please verify your complaint", "This report has received " + DISLIKE_THRESHOLD + " or more dislikes. Please cross-check its details. This is a request to verify, not a conclusion that the report is false.", id, "verification");
  const governmentUsers = listDocuments_("users").filter(d => d.fields && d.fields.role && d.fields.role.stringValue === "government");
  governmentUsers.forEach(d => {
    const uid = d.name.split("/").pop();
    createNotification_(uid, "dislike_threshold_" + id, "Complaint needs review", "A civic report has reached the community verification threshold. Please review the report and evidence.", id, "verification");
  });
  return "threshold notifications processed";
}

function handleResolutionResponse_(user, input) {
  const id = safeId_(input.complaintId);
  const c = getDocument_("complaints/" + id);
  if (!c || c.userId !== user.localId) throw new Error("Reporter ownership check failed.");
  if (c.resolutionConfirmation === "REOPEN_REQUESTED") {
    const govs = listDocuments_("users").filter(d => d.fields && d.fields.role && d.fields.role.stringValue === "government");
    govs.forEach(d => createNotification_(d.name.split("/").pop(), "reopen_" + id, "Citizen requests another review", "The reporting citizen says the issue remains unresolved.", id, "reopen"));
  } else if (c.resolutionConfirmation === "CONFIRMED") {
    createNotification_(user.localId, "resolution_confirmed_" + id, "Resolution confirmed", "Thank you for confirming that this issue has been resolved.", id, "resolution");
  }
  return "resolution response processed";
}

function createNotification_(uid, id, title, message, complaintId, type) {
  if (!uid) return;
  const path = "users/" + safeId_(uid) + "/notifications";
  const body = { fields: {
    title: { stringValue: title }, message: { stringValue: message }, complaintId: { stringValue: String(complaintId || "") },
    type: { stringValue: type }, createdAt: { timestampValue: new Date().toISOString() }
  }};
  const url = firestoreBase_() + "/" + path + "?documentId=" + encodeURIComponent(safeId_(id));
  const response = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, payload: JSON.stringify(body), muteHttpExceptions: true });
  const code = response.getResponseCode();
  if (code !== 200 && code !== 201 && code !== 409) throw new Error("Firestore notification write failed: " + code);
}

function getDocument_(path) {
  const response = UrlFetchApp.fetch(firestoreBase_() + "/" + path, { method: "get", headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (response.getResponseCode() === 404) return null;
  if (response.getResponseCode() !== 200) throw new Error("Firestore read failed: " + response.getResponseCode());
  return decodeFields_(JSON.parse(response.getContentText()).fields || {});
}

function listDocuments_(path) {
  const url = firestoreBase_() + "/" + path;
  const response = UrlFetchApp.fetch(url, { method: "get", headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error("Firestore list failed: " + response.getResponseCode());
  const data = JSON.parse(response.getContentText());
  return (data.documents || []).map(d => ({ name: d.name, fields: d.fields || {}, ...decodeFields_(d.fields || {}) }));
}

function decodeFields_(fields) {
  const out = {};
  Object.keys(fields).forEach(k => { const v = fields[k]; if (v.stringValue !== undefined) out[k] = v.stringValue; else if (v.booleanValue !== undefined) out[k] = v.booleanValue; else if (v.integerValue !== undefined) out[k] = Number(v.integerValue); else if (v.timestampValue !== undefined) out[k] = v.timestampValue; });
  return out;
}
function firestoreBase_() { return "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID + "/databases/(default)/documents"; }
function safeId_(value) { const id = String(value || ""); if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error("Invalid document ID."); return id; }
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
