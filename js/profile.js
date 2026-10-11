
import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import {
    doc,
    getDoc,
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const loading = document.getElementById("profileLoading");
const errorMessage = document.getElementById("profileError");
const content = document.getElementById("profileContent");

function showError(message) {
    loading.style.display = "none";
    errorMessage.textContent = message;
}

function formatDate(value) {
    if (!value) return "Not available";

    const date = typeof value.toDate === "function"
        ? value.toDate()
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Not available";
    }

    return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function normalizeStatus(status) {
    return String(status || "SUBMITTED")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
}

async function loadProfile(user) {
    try {
        // 1. Load the account document.
        const userRef = doc(db, "users", user.uid);
        const userSnapshot = await getDoc(userRef);

        const account = userSnapshot.exists()
            ? userSnapshot.data()
            : {};

        const name = account.name || user.displayName || "Citizen";

        document.getElementById("profileHeading").textContent =
            name;

        document.getElementById("profileAvatar").textContent =
            name.trim().charAt(0).toUpperCase() || "C";

        document.getElementById("profileName").textContent =
            name;

        document.getElementById("profileEmail").textContent =
            account.email || user.email || "Not available";

        document.getElementById("profileRole").textContent =
            account.role || "citizen";

        document.getElementById("profileJoined").textContent =
            formatDate(account.createdAt || user.metadata.creationTime);

        // 2. Fetch only this user's complaints.
        const reportsQuery = query(
            collection(db, "complaints"),
            where("userId", "==", user.uid)
        );

        const reportsSnapshot = await getDocs(reportsQuery);

        let total = 0;
        let inProgress = 0;
        let resolved = 0;

        reportsSnapshot.forEach((reportDoc) => {
            const report = reportDoc.data();
            const status = normalizeStatus(report.status);

            total++;

            if (status === "IN_PROGRESS" ||
                status === "UNDER_PROGRESS") {
                inProgress++;
            }

            if (status === "RESOLVED") {
                resolved++;
            }
        });

        // 3. Display the calculated statistics.
        document.getElementById("totalReports").textContent = total;
        document.getElementById("progressReports").textContent =
            inProgress;
        document.getElementById("resolvedReports").textContent =
            resolved;

        loading.style.display = "none";
        content.hidden = false;

    } catch (error) {
        console.error("Profile loading error:", error);

        showError(
            "Unable to load your profile. Please refresh and try again."
        );
    }
}

// Wait until Firebase has restored the login session.
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.replace("login.html");
        return;
    }

    loadProfile(user);
});
