import { db } from "./firebase.js";
import { mountReactionControls } from "./interactions.js";
import {
    collection,
    getDocs,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const complaintsContainer = document.getElementById("complaintsContainer");
const loadingMessage = document.getElementById("loadingMessage");
const errorMessage = document.getElementById("errorMessage");
let allComplaints = [];

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

function getStatusClass(status) {
    const normalized = String(status || "").toUpperCase();
    if (normalized === "SUBMITTED" || normalized === "PENDING") return "status-submitted";
    if (normalized === "UNDER_REVIEW" || normalized === "IN_REVIEW") return "status-review";
    if (normalized === "IN_PROGRESS" || normalized === "UNDER_PROGRESS") return "status-progress";
    if (normalized === "RESOLVED" || normalized === "CLOSED") return "status-resolved";
    if (normalized === "REJECTED") return "status-rejected";
    return "";
}

function makeTextElement(tag, text, className = "") {
    const element = document.createElement(tag);
    element.textContent = text ?? "";
    if (className) element.className = className;
    return element;
}

function createComplaintCard(complaint) {
    const card = document.createElement("article");
    card.className = "complaint-card";

    const imageURL = complaint.imageURL;
    if (imageURL) {
        const image = document.createElement("img");
        setPreviewImage(image, imageURL, "Image preview unavailable. Open the image URL to check sharing access.");
        image.alt = `Photo for ${complaint.title || "civic complaint"}`;
        image.className = "complaint-image";
        image.loading = "lazy";
        image.addEventListener("error", () => {
            image.replaceWith(makeTextElement("p", "Complaint image could not be loaded.", "image-fallback"));
        }, { once: true });
        card.appendChild(image);
    } else {
        card.appendChild(makeTextElement("p", "No image available for this complaint.", "image-fallback"));
    }

    card.appendChild(makeTextElement("h3", complaint.title || "Untitled complaint"));
    const category = document.createElement("p");
    category.append("Category: ");
    category.appendChild(makeTextElement("strong", complaint.category || "Not specified"));
    card.appendChild(category);

    const locationValue = complaint.locationName ||
        (complaint.latitude != null && complaint.longitude != null
            ? `${complaint.latitude}, ${complaint.longitude}`
            : "Location not available");
    const location = document.createElement("p");
    location.append("Location: ");
    location.appendChild(makeTextElement("strong", locationValue));
    card.appendChild(location);

    card.appendChild(makeTextElement("p", complaint.description || "No description provided."));

    const status = makeTextElement("p", `Status: ${complaint.status || "SUBMITTED"}`,
        `status ${getStatusClass(complaint.status)}`.trim());
    card.appendChild(status);

    const actions = document.createElement("div");
    actions.className = "complaint-actions";

    const viewButton = makeTextElement("button", "View Complaint", "view-button");
    viewButton.type = "button";
    viewButton.addEventListener("click", () => {
        window.location.href = `complaint.html?id=${encodeURIComponent(complaint.id)}`;
    });
    actions.appendChild(viewButton);

    const interactionPanel = document.createElement("section");
    interactionPanel.className = "interaction-panel complaint-card-interactions";
    mountReactionControls(interactionPanel, complaint.id, { compact: true });
    actions.appendChild(interactionPanel);
    card.appendChild(actions);
    return card;
}

function renderComplaints(complaints) {
    complaintsContainer.replaceChildren();
    if (!complaints.length) {
        complaintsContainer.appendChild(makeTextElement("p", "No complaints found."));
        return;
    }
    const fragment = document.createDocumentFragment();
    complaints.forEach((complaint) => fragment.appendChild(createComplaintCard(complaint)));
    complaintsContainer.appendChild(fragment);
}

async function loadComplaints() {
    try {
        const complaintsQuery = query(collection(db, "complaints"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(complaintsQuery);
        allComplaints = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        loadingMessage.style.display = "none";
        renderComplaints(allComplaints);
    } catch (error) {
        console.error("Error loading complaints:", error);
        loadingMessage.style.display = "none";
        errorMessage.textContent = "Unable to load complaints. Check your connection and Firestore read permissions.";
    }
}

document.querySelectorAll("#filters button").forEach((button) => {
    button.addEventListener("click", () => {
        const category = button.dataset.category;
        renderComplaints(category === "all"
            ? allComplaints
            : allComplaints.filter((complaint) => complaint.category === category));
        document.querySelectorAll("#filters button").forEach((item) => {
            item.classList.toggle("filter-active", item === button);
            item.setAttribute("aria-pressed", String(item === button));
        });
    });
});

loadComplaints();
