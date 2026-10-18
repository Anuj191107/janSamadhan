import { auth, db } from "./firebase.js";
import { attachComplaintActions } from "./phase5-actions.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const loading = $("profileLoading");
const errorMessage = $("profileError");
const notice = $("profileNotice");
const content = $("profileContent");
const reportsList = $("myReportsList");
const reportsLoading = $("myReportsLoading");
const refreshButton = $("refreshProfileReports");
let signedInUser = null;
let loadingReports = false;

function formatDate(value, includeTime = false) {
  if (!value) return "Not available";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-IN", includeTime
    ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" });
}

function normalizeStatus(status) {
  const value = String(status || "SUBMITTED").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (["PENDING", "NEW"].includes(value)) return "SUBMITTED";
  if (["IN_REVIEW", "REVIEW"].includes(value)) return "UNDER_REVIEW";
  if (["UNDER_PROGRESS", "INPROGRESS"].includes(value)) return "IN_PROGRESS";
  if (["CLOSED", "COMPLETED"].includes(value)) return "RESOLVED";
  return ["SUBMITTED", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "REJECTED"].includes(value) ? value : value;
}

function statusLabel(status) {
  return normalizeStatus(status).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusClass(status) {
  return `my-report-status status-${normalizeStatus(status).toLowerCase().replaceAll("_", "-")}`;
}

function textElement(tag, text, className = "") {
  const node = document.createElement(tag);
  node.textContent = text == null ? "" : String(text);
  if (className) node.className = className;
  return node;
}

function renderReports(reports) {
  reportsList.replaceChildren();
  if (!reports.length) {
    const empty = document.createElement("div");
    empty.className = "my-reports-empty";
    empty.appendChild(textElement("strong", "No reports yet"));
    empty.appendChild(textElement("p", "When you report a civic issue, it will appear here so you can track its progress."));
    const link = textElement("a", "Report your first issue", "profile-button");
    link.href = "report.html";
    empty.appendChild(link);
    reportsList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  reports.forEach((report) => {
    const card = document.createElement("article");
    card.className = "my-report-card";
    const top = document.createElement("div");
    top.className = "my-report-top";
    const titleArea = document.createElement("div");
    titleArea.appendChild(textElement("h4", report.title || "Untitled complaint"));
    titleArea.appendChild(textElement("p", `${report.category || "Uncategorised"} · Reported ${formatDate(report.createdAt, true)}`, "my-report-meta"));
    top.appendChild(titleArea);
    top.appendChild(textElement("span", statusLabel(report.status), statusClass(report.status)));
    card.appendChild(top);
    if (report.description) card.appendChild(textElement("p", report.description, "my-report-description"));
    const phase5Actions = document.createElement("div");
    phase5Actions.className = "phase5-complaint-actions";
    attachComplaintActions(phase5Actions, report, signedInUser);
    card.appendChild(phase5Actions);
    const actions = document.createElement("div");
    actions.className = "my-report-actions";
    const view = textElement("a", "View complaint");
    view.href = `complaint.html?id=${encodeURIComponent(report.id)}`;
    view.className = "my-report-link";
    actions.appendChild(view);
    if (report.latitude != null && report.longitude != null) {
      const map = textElement("a", "View location");
      map.href = `https://www.google.com/maps?q=${encodeURIComponent(`${report.latitude},${report.longitude}`)}`;
      map.target = "_blank";
      map.rel = "noopener noreferrer";
      map.className = "my-report-link secondary-link";
      actions.appendChild(map);
    }
    card.appendChild(actions);
    fragment.appendChild(card);
  });
  reportsList.appendChild(fragment);
}

function updateStats(reports) {
  const statuses = reports.map((report) => normalizeStatus(report.status));
  $("totalReports").textContent = reports.length;
  $("progressReports").textContent = statuses.filter((status) => ["UNDER_REVIEW", "IN_PROGRESS"].includes(status)).length;
  $("resolvedReports").textContent = statuses.filter((status) => status === "RESOLVED").length;
}

async function loadMyReports() {
  if (!signedInUser || loadingReports) return;
  loadingReports = true;
  reportsLoading.hidden = false;
  refreshButton.disabled = true;
  notice.textContent = "";
  try {
    // Query only this citizen's reports. Sorting is done in the browser to avoid
    // requiring a composite Firestore index.
    const reportsQuery = query(collection(db, "complaints"), where("userId", "==", signedInUser.uid));
    const snapshot = await getDocs(reportsQuery);
    const reports = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    reports.sort((a, b) => {
      const dateValue = (value) => value && typeof value.toDate === "function" ? value.toDate().getTime() : new Date(value || 0).getTime();
      return dateValue(b.createdAt) - dateValue(a.createdAt);
    });
    updateStats(reports);
    renderReports(reports);
    notice.textContent = `Loaded ${reports.length} report${reports.length === 1 ? "" : "s"}.`;
  } catch (error) {
    console.error("My reports loading error:", error);
    reportsList.replaceChildren(textElement("p", "Unable to load your reports. Check your connection and Firestore read permissions.", "profile-inline-error"));
    notice.textContent = "";
  } finally {
    reportsLoading.hidden = true;
    refreshButton.disabled = false;
    loadingReports = false;
  }
}

async function loadProfile(user) {
  loading.hidden = false;
  errorMessage.textContent = "";
  content.hidden = true;
  try {
    const userSnapshot = await getDoc(doc(db, "users", user.uid));
    const account = userSnapshot.exists() ? userSnapshot.data() : {};
    const name = String(account.name || user.displayName || "Citizen").trim() || "Citizen";
    $("profileHeading").textContent = `Hello, ${name}`;
    $("profileAvatar").textContent = name.charAt(0).toUpperCase();
    $("profileName").textContent = name;
    $("profileEmail").textContent = account.email || user.email || "Not available";
    $("profileRole").textContent = account.role || "citizen";
    $("profileJoined").textContent = formatDate(account.createdAt || user.metadata.creationTime);
    loading.hidden = true;
    content.hidden = false;
    await loadMyReports();
  } catch (error) {
    console.error("Profile loading error:", error);
    loading.hidden = true;
    errorMessage.textContent = error.code === "permission-denied"
      ? "Permission denied while loading your profile. Check the existing users and complaints read rules."
      : "Unable to load your profile. Please refresh and try again.";
  }
}

refreshButton.addEventListener("click", loadMyReports);
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("login.html");
    return;
  }
  signedInUser = user;
  loadProfile(user);
});
