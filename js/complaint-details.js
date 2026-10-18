import { db } from "./firebase.js";
import { mountComments, mountReactionControls } from "./interactions.js";
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { attachComplaintActions } from "./phase5-actions.js";
import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const detailsContainer = document.getElementById("complaintDetails");
const loadingMessage = document.getElementById("loadingMessage");
const complaintId = new URLSearchParams(window.location.search).get("id");

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

function addText(parent, tag, text, className = "") {
    const node = document.createElement(tag);
    node.textContent = text ?? "";
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
}

function getDisplayLocation(complaint) {
    if (complaint.locationName) return complaint.locationName;
    if (complaint.latitude != null && complaint.longitude != null) {
        return `${complaint.latitude}, ${complaint.longitude}`;
    }
    return "Location not available";
}

function formatDate(value) {
    if (!value) return "Date not available";
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime())
        ? "Date not available"
        : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function renderComplaint(complaint) {
    const card = document.createElement("article");
    card.className = "complaint-card complaint-detail-card";

    const imageURL = complaint.imageURL;
    if (imageURL) {
        const image = document.createElement("img");
        setPreviewImage(image, imageURL, "Image preview unavailable. Open the image URL to check sharing access.");
        image.alt = `Photo for ${complaint.title || "civic complaint"}`;
        image.className = "complaint-image";
        image.loading = "lazy";
        image.addEventListener("error", () => {
            image.replaceWith(addText(document.createDocumentFragment(), "p", "Complaint image could not be loaded.", "image-fallback"));
        }, { once: true });
        card.appendChild(image);
    } else {
        addText(card, "p", "No image available for this complaint.", "image-fallback");
    }

    addText(card, "h2", complaint.title || "Untitled complaint");
    addText(card, "p", complaint.description || "No description provided.");
    addText(card, "p", `Category: ${complaint.category || "Not specified"}`, "detail-meta");
    addText(card, "p", `Location: ${getDisplayLocation(complaint)}`, "detail-meta");
    addText(card, "p", `Status: ${complaint.status || "SUBMITTED"}`, "detail-meta");
    addText(card, "p", `Reported: ${formatDate(complaint.createdAt)}`, "detail-meta");

    const interactionSection = document.createElement("section");
    interactionSection.className = "interaction-panel";
    addText(interactionSection, "h3", "Community feedback");
    mountReactionControls(interactionSection, complaint.id);

    addText(interactionSection, "h3", "Comments");
    const commentsContainer = document.createElement("div");
    commentsContainer.className = "comments-section";
    mountComments(commentsContainer, complaint.id);
    interactionSection.appendChild(commentsContainer);

    card.appendChild(interactionSection);
    const actions = document.createElement("section");
    actions.className = "phase5-complaint-actions";
    card.appendChild(actions);
    onAuthStateChanged(auth, (user) => { actions.replaceChildren(); if (user) attachComplaintActions(actions, complaint, user); });
    detailsContainer.replaceChildren(card);
}

async function loadComplaint() {
    if (!complaintId) {
        loadingMessage.textContent = "Complaint ID not found. Return to the issues page and select a complaint.";
        return;
    }

    try {
        const complaintSnapshot = await getDoc(doc(db, "complaints", complaintId));
        if (!complaintSnapshot.exists()) {
            loadingMessage.textContent = "Complaint not found.";
            return;
        }

        renderComplaint({ id: complaintSnapshot.id, ...complaintSnapshot.data() });
        loadingMessage.style.display = "none";
    } catch (error) {
        console.error("Error loading complaint:", error);
        loadingMessage.textContent = "Unable to load complaint. Check your connection and Firestore read permissions.";
    }
}

loadComplaint();
