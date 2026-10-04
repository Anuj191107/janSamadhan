import {
    db
} from "./firebase.js";


import {
    collection,
    getDocs,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


const complaintsContainer =
    document.getElementById(
        "complaintsContainer"
    );

let allComplaints = [];

const loadingMessage =
    document.getElementById(
        "loadingMessage"
    );


const errorMessage =
    document.getElementById(
        "errorMessage"
    );



async function loadComplaints() {

    try {

        const complaintsQuery =
            query(
                collection(db, "complaints"),
                orderBy(
                    "createdAt",
                    "desc"
                )
            );


        const snapshot =
            await getDocs(
                complaintsQuery
            );


        loadingMessage.style.display =
            "none";


        if (snapshot.empty) {

            complaintsContainer.innerHTML =
                "<p>No complaints found.</p>";

            return;
        }


        snapshot.forEach(
            (documentSnapshot) => {

                const complaint =
                    documentSnapshot.data();

                const complaintId =
                    documentSnapshot.id;

                allComplaints.push({
                    id: complaintId,
                    ...complaint
                });

            }
        );


        renderComplaints(
            allComplaints
        );

    }


    catch (error) {

        console.error(
            "Error loading complaints:",
            error
        );


        loadingMessage.style.display =
            "none";


        errorMessage.textContent =
            "Unable to load complaints.";

    }

}

/////google drive URL helper to help conert gd url ti img generation///


function getDisplayImageURL(url) {
    if (!url) return "";

    try {
        const parsedURL = new URL(url);

        if (parsedURL.hostname === "drive.google.com") {
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
                return `https://drive.google.com/uc?export=view&id=${fileId}`;
            }
        }

        return url;
    } catch (error) {
        console.error("Invalid image URL:", error);
        return "";
    }
}


/* =========================================
   CREATE COMPLAINT CARD
========================================= */

function createComplaintCard(
    complaint,
    complaintId
) {

    const card =
        document.createElement("div");


    card.className =
        "complaint-card";


    card.innerHTML = `

        
        <img
            src="${getDisplayImageURL(complaint.imageURL)}"
            alt="Complaint image"
            class="complaint-image"
            onerror="this.style.display='none'; console.error('Image failed to load:', this.src);"
        >


        <h3>
            ${complaint.title}
        </h3>

        <p>
            <strong>Category:</strong>
            ${complaint.category}
        </p>

        <p>
            <strong>Location:</strong>
           ${complaint.locationName ||
        (
            complaint.latitude != null && complaint.longitude != null
                ? `${complaint.latitude}, ${complaint.longitude}`
                : "Location not available"
        )
        }
        </p>

        <p>
            ${complaint.description}
        </p>

        <p class="status ${getStatusClass(complaint.status)}">

            <strong>Status:</strong>
            ${complaint.status}

        </p>

        <button
            class="view-button"
            data-id="${complaintId}"
        >
            View Complaint
        </button>

    `;


    complaintsContainer.appendChild(
        card
    );

}


/* =========================================
   STEP 10: RENDER COMPLAINTS
========================================= */

function renderComplaints(
    complaints
) {

    complaintsContainer.innerHTML = "";


    if (complaints.length === 0) {

        complaintsContainer.innerHTML =
            "<p>No complaints found.</p>";

        return;

    }


    complaints.forEach(
        (complaint) => {

            createComplaintCard(
                complaint,
                complaint.id
            );

        }
    );


    addViewButtonListeners();

}


/* =========================================
   VIEW COMPLAINT BUTTON
========================================= */

function addViewButtonListeners() {

    const viewButtons =
        document.querySelectorAll(
            ".view-button"
        );


    viewButtons.forEach(
        (button) => {

            button.addEventListener(
                "click",
                () => {

                    const complaintId =
                        button.dataset.id;


                    window.location.href =
                        `complaint.html?id=${complaintId}`;

                }
            );

        }
    );

}


/* =========================================
   STATUS CLASS
========================================= */

function getStatusClass(status) {

    switch (status) {

        case "SUBMITTED":
            return "status-submitted";

        case "UNDER_REVIEW":
            return "status-review";

        case "IN_PROGRESS":
            return "status-progress";

        case "RESOLVED":
            return "status-resolved";

        case "CLOSED":
            return "status-closed";

        case "REJECTED":
            return "status-rejected";

        default:
            return "";

    }

}


/* =========================================
   LOAD COMPLAINTS
========================================= */

loadComplaints();

const filterButtons =
    document.querySelectorAll(
        "#filters button"
    );


filterButtons.forEach(
    (button) => {

        button.addEventListener(
            "click",
            () => {

                const category =
                    button.dataset.category;


                if (category === "all") {

                    renderComplaints(
                        allComplaints
                    );

                }

                else {

                    const filtered =
                        allComplaints.filter(
                            (complaint) =>
                                complaint.category ===
                                category
                        );


                    renderComplaints(
                        filtered
                    );

                }

            }
        );

    }
);


///....................................///
/// logic for button- "View Complaint"  phase 5 step 12///
///....................................///

document.addEventListener(
    "click",
    (event) => {

        if (
            event.target.classList.contains(
                "view-button"
            )
        ) {

            const complaintId =
                event.target.dataset.id;


            window.location.href =
                `complaint.html?id=${complaintId}`;

        }

    }
);