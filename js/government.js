import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { sendPhase5Event } from "./phase5-backend.js";
import { collection, doc, getDoc, getDocs, orderBy, query, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const loading = document.getElementById("governmentLoading");
const errorBox = document.getElementById("governmentError");
const notice = document.getElementById("governmentNotice");
const content = document.getElementById("governmentContent");
const list = document.getElementById("governmentComplaints");
const searchInput = document.getElementById("searchComplaints");
const categoryFilter = document.getElementById("categoryFilter");
const statusFilter = document.getElementById("statusFilter");
const refreshButton = document.getElementById("refreshComplaints");

let reports = [];
let currentUser = null;
let savingIds = new Set();

const STATUS_OPTIONS = [
  ["SUBMITTED", "Submitted"],
  ["UNDER_REVIEW", "Under review"],
  ["IN_PROGRESS", "In progress"],
  ["RESOLVED", "Resolved"],
  ["REJECTED", "Rejected"]
];

function normalizeStatus(value) {
  const status = String(value || "SUBMITTED").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (["PENDING", "NEW"].includes(status)) return "SUBMITTED";
  if (["UNDER_PROGRESS", "INPROGRESS"].includes(status)) return "IN_PROGRESS";
  if (["IN_REVIEW", "REVIEW"].includes(status)) return "UNDER_REVIEW";
  if (status === "CLOSED") return "RESOLVED";
  return STATUS_OPTIONS.some(([key]) => key === status) ? status : "SUBMITTED";
}

function formatDate(value) {
  if (!value) return "Date not available";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not available";
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function element(tag, text, className = "") {
  const node = document.createElement(tag);
  node.textContent = text ?? "";
  if (className) node.className = className;
  return node;
}

function getImageCandidates(url) {
    if (!url || typeof url !== "string") return [];
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        if (host === "drive.google.com" || host === "www.drive.google.com") {
            let id = parsed.searchParams.get("id");
            if (!id) id = parsed.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
            if (id) {
                const safeId = encodeURIComponent(id);
                return [
                    `https://drive.google.com/thumbnail?id=${safeId}&sz=w1200`,
                    `https://drive.google.com/uc?export=view&id=${safeId}`,
                    `https://drive.google.com/uc?export=download&id=${safeId}`
                ];
            }
        }
        return [url];
    } catch (error) {
        console.error("Invalid image URL:", error);
        return [];
    }
}

function setPreviewImage(image, originalURL, fallbackMessage) {
    const candidates = getImageCandidates(originalURL);
    let attempt = 0;
    image.addEventListener("error", () => {
        attempt += 1;
        if (attempt < candidates.length) {
            image.src = candidates[attempt];
        } else {
            const note = document.createElement("p");
            note.className = "image-fallback";
            note.textContent = fallbackMessage;
            image.replaceWith(note);
        }
    });
    if (candidates.length) image.src = candidates[0];
    else {
        const note = document.createElement("p");
        note.className = "image-fallback";
        note.textContent = fallbackMessage;
        image.replaceWith(note);
    }
}

function locationText(report) {
  if (report.locationName) return String(report.locationName);
  if (report.address) return String(report.address);
  if (report.latitude != null && report.longitude != null) return `${report.latitude}, ${report.longitude}`;
  return "Location not provided";
}

function updateStats() {
  const normalized = reports.map((report) => normalizeStatus(report.status));
  document.getElementById("countTotal").textContent = reports.length;
  document.getElementById("countSubmitted").textContent = normalized.filter((s) => s === "SUBMITTED").length;
  document.getElementById("countProgress").textContent = normalized.filter((s) => s === "IN_PROGRESS" || s === "UNDER_REVIEW").length;
  document.getElementById("countResolved").textContent = normalized.filter((s) => s === "RESOLVED").length;
}

function filteredReports() {
  const search = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;
  const status = statusFilter.value;
  return reports.filter((report) => {
    const searchable = [report.title, report.description, locationText(report), report.category].join(" ").toLowerCase();
    return (!search || searchable.includes(search))
      && (category === "all" || String(report.category || "Other") === category)
      && (status === "all" || normalizeStatus(report.status) === status);
  });
}

function renderReports() {
  const visible = filteredReports();
  list.replaceChildren();
  document.getElementById("visibleCount").textContent = `${visible.length} report${visible.length === 1 ? "" : "s"}`;
  if (!visible.length) {
    list.appendChild(element("p", "No complaints match these filters.", "empty-state"));
    return;
  }

  const fragment = document.createDocumentFragment();
  visible.forEach((report) => {
    const card = element("article", "", "government-report-card");
    const header = element("div", "", "government-report-header");
    const titleArea = document.createElement("div");
    titleArea.appendChild(element("h4", report.title || "Untitled complaint"));
    titleArea.appendChild(element("p", `${report.category || "Uncategorised"} · Reported ${formatDate(report.createdAt)}`, "report-meta"));
    header.appendChild(titleArea);
    const badge = element("span", normalizeStatus(report.status).replaceAll("_", " "), `status-badge status-${normalizeStatus(report.status).toLowerCase().replaceAll("_", "-")}`);
    header.appendChild(badge);
    card.appendChild(header);

    if (report.imageURL) {
      const url = report.imageURL;
      if (url) {
        const image = element("img", "", "government-report-image");
        setPreviewImage(image, url, "Evidence preview unavailable. Check that the image is shared for viewing.");
        image.alt = `Evidence for ${report.title || "complaint"}`;
        image.loading = "lazy";
        image.addEventListener("error", () => image.replaceWith(element("p", "Evidence image could not be loaded.", "image-fallback")), { once: true });
        card.appendChild(image);
      }
    }

    card.appendChild(element("p", report.description || "No description provided.", "government-description"));
    const location = document.createElement("p");
    location.append("Location: ");
    location.appendChild(element("strong", locationText(report)));
    card.appendChild(location);
    if (report.latitude != null && report.longitude != null) {
      const mapLink = element("a", "Open location in Maps", "map-link");
      mapLink.href = `https://www.google.com/maps?q=${encodeURIComponent(`${report.latitude},${report.longitude}`)}`;
      mapLink.target = "_blank";
      mapLink.rel = "noopener noreferrer";
      card.appendChild(mapLink);
    }

    const controls = element("div", "", "status-editor");
    const label = element("label", "Update status");
    label.htmlFor = `status-${report.id}`;
    const select = document.createElement("select");
    select.id = `status-${report.id}`;
    STATUS_OPTIONS.forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      option.selected = normalizeStatus(report.status) === value;
      select.appendChild(option);
    });
    label.appendChild(select);
    controls.appendChild(label);
    const save = element("button", savingIds.has(report.id) ? "Saving..." : "Save status", "save-status-button");
    save.type = "button";
    save.disabled = savingIds.has(report.id);
    save.addEventListener("click", () => saveStatus(report, select.value, save));
    controls.appendChild(save);
    card.appendChild(controls);
    fragment.appendChild(card);
  });
  list.appendChild(fragment);
}

async function saveStatus(report, newStatus, button) {
  if (!currentUser || savingIds.has(report.id)) return;
  const previousStatus = normalizeStatus(report.status);
  if (newStatus === previousStatus) {
    notice.textContent = "This complaint already has that status.";
    errorBox.textContent = "";
    return;
  }
  savingIds.add(report.id);
  button.disabled = true;
  button.textContent = "Saving...";
  notice.textContent = "";
  errorBox.textContent = "";
  try {
    await updateDoc(doc(db, "complaints", report.id), {
      status: newStatus,
      statusUpdatedAt: serverTimestamp(),
      statusUpdatedBy: currentUser.uid,
      ...(newStatus === "RESOLVED" ? { resolutionConfirmation: "PENDING", resolutionConfirmedAt: null, resolutionFeedback: "" } : {})
    });
    report.status = newStatus;
    sendPhase5Event("statusUpdated", report.id).catch((e) => console.warn("Status notification backend needs setup:", e));
    updateStats();
    renderReports();
    notice.textContent = `Status updated to ${newStatus.replaceAll("_", " ")}.`;
  } catch (error) {
    console.error("Unable to update complaint status:", error);
    errorBox.textContent = error.code === "permission-denied"
      ? "Permission denied while updating status. Check the Firestore complaint update rule."
      : `Could not update status: ${error.message || "Unknown error"}`;
  } finally {
    savingIds.delete(report.id);
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = "Save status";
    }
  }
}

async function loadReports() {
  loading.hidden = false;
  errorBox.textContent = "";
  notice.textContent = "";
  try {
    const snapshot = await getDocs(query(collection(db, "complaints"), orderBy("createdAt", "desc")));
    reports = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    updateStats();
    renderReports();
    loading.hidden = true;
    content.hidden = false;
  } catch (error) {
    console.error("Unable to load government dashboard:", error);
    loading.hidden = true;
    errorBox.textContent = "Unable to load complaints. Check your internet connection and Firestore read permissions.";
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("login.html");
    return;
  }
  currentUser = user;
  try {
    const userSnapshot = await getDoc(doc(db, "users", user.uid));
    if (!userSnapshot.exists() || userSnapshot.data().role !== "government") {
      errorBox.textContent = "Access denied. This page is only for government accounts.";
      loading.hidden = true;
      setTimeout(() => window.location.replace("citizen.html"), 1800);
      return;
    }
    await loadReports();
  } catch (error) {
    console.error("Government role verification failed:", error);
    loading.hidden = true;
    errorBox.textContent = "Could not verify your account role. Please sign in again.";
  }
});

searchInput.addEventListener("input", renderReports);
categoryFilter.addEventListener("change", renderReports);
statusFilter.addEventListener("change", renderReports);
refreshButton.addEventListener("click", loadReports);
