
import { db } from "./firebase.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const detailsContainer = document.getElementById("complaintDetails");
const loadingMessage = document.getElementById("loadingMessage");

const urlParams = new URLSearchParams(window.location.search);
const complaintId = urlParams.get("id");


/* Convert common Google Drive file URLs into image URLs */
function getDisplayImageURL(url) {
    if (!url) return "";

    try {
        const parsedURL = new URL(url);

        if (
            parsedURL.hostname === "drive.google.com" ||
            parsedURL.hostname === "www.drive.google.com"
        ) {
            let fileId = parsedURL.searchParams.get("id");

            if (!fileId) {
                const match = parsedURL.pathname.match(
                    /\/file\/d\/([^/]+)/
                );

                if (match) {
                    fileId = match[1];
                }
            }

            if (fileId) {
                return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`;
            }
        }

        return url;
    } catch (error) {
        console.error("Invalid image URL:", error);
        return "";
    }
}


/* Display location using the saved name or coordinates */
function getDisplayLocation(complaint) {
    if (complaint.locationName) {
        return complaint.locationName;
    }

    if (
        complaint.latitude != null &&
        complaint.longitude != null
    ) {
        return `${complaint.latitude}, ${complaint.longitude}`;
    }

    return "Location not available";
}


/* Load complaint details from Firestore */
async function loadComplaint() {
    if (!complaintId) {
        loadingMessage.textContent = "Complaint ID not found.";
        return;
    }

    try {
        const complaintRef = doc(
            db,
            "complaints",
            complaintId
        );

        const complaintSnapshot = await getDoc(complaintRef);

        if (!complaintSnapshot.exists()) {
            loadingMessage.textContent = "Complaint not found.";
            return;
        }

        const complaint = complaintSnapshot.data();

        loadingMessage.style.display = "none";

        const imageURL = getDisplayImageURL(complaint.imageURL);

        detailsContainer.innerHTML = `
            <div class="complaint-card">

                ${
                    imageURL
                        ? `
                            <img
                                src="${imageURL}"
                                alt="Complaint image"
                                class="complaint-image"
                                onerror="
                                    this.style.display='none';
                                    this.nextElementSibling.style.display='block';
                                "
                            >
                            <p style="display:none;">
                                Image could not be loaded.
                            </p>
                        `
                        : `
                            <p>No image available for this complaint.</p>
                        `
                }

                <h2>${complaint.title || "Untitled complaint"}</h2>

                <p>
                    ${complaint.description || "No description provided."}
                </p>

                <p>
                    <strong>Category:</strong>
                    ${complaint.category || "Not specified"}
                </p>

                <p>
                    <strong>Location:</strong>
                    ${getDisplayLocation(complaint)}
                </p>

                <p>
                    <strong>Status:</strong>
                    ${complaint.status || "Pending"}
                </p>

            </div>
        `;

    } catch (error) {
        console.error("Error loading complaint:", error);
        loadingMessage.textContent = "Unable to load complaint.";
    }
}

loadComplaint();
