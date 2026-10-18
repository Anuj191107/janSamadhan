import { auth, db } from "./firebase.js";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { sendPhase5Event } from "./phase5-backend.js";


function waitForUser() {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user || null);
        });
    });
}

function textElement(tag, text, className = "") {
    const element = document.createElement(tag);
    element.textContent = text ?? "";
    if (className) element.className = className;
    return element;
}

function showInteractionError(container, error, fallback) {
    console.error(fallback, error);
    let message = container.querySelector(".interaction-error");
    if (!message) {
        message = textElement("p", "", "interaction-error");
        container.appendChild(message);
    }
    message.textContent = error?.code === "permission-denied"
        ? "Firebase denied this action. Check the Firestore security rules for reactions/comments."
        : fallback;
}

async function getAccountName(user) {
    try {
        const accountSnapshot = await getDoc(doc(db, "users", user.uid));
        const account = accountSnapshot.exists() ? accountSnapshot.data() : {};
        return account.name || user.displayName || (user.email ? user.email.split("@")[0] : "Citizen");
    } catch (error) {
        console.warn("Could not load citizen name; using account fallback.", error);
        return user.displayName || (user.email ? user.email.split("@")[0] : "Citizen");
    }
}

/** Adds live like/dislike controls for one complaint. */
export function mountReactionControls(container, complaintId, { compact = false } = {}) {
    const row = document.createElement("div");
    row.className = compact ? "reaction-row reaction-row-compact" : "reaction-row";
    const likeButton = textElement("button", "👍 Like", "reaction-button");
    const dislikeButton = textElement("button", "👎 Dislike", "reaction-button");
    const likeCount = textElement("span", "0", "reaction-count");
    const dislikeCount = textElement("span", "0", "reaction-count");
    likeButton.type = dislikeButton.type = "button";
    likeButton.append(" ");
    likeButton.appendChild(likeCount);
    dislikeButton.append(" ");
    dislikeButton.appendChild(dislikeCount);
    likeButton.setAttribute("aria-label", "Like complaint");
    dislikeButton.setAttribute("aria-label", "Dislike complaint");
    row.append(likeButton, dislikeButton);
    container.appendChild(row);

    const reactionsRef = collection(db, "complaints", complaintId, "reactions");
    let currentReaction = null;
    let busy = false;
    let unsubscribe = null;

    function renderSelected() {
        likeButton.classList.toggle("reaction-selected", currentReaction === "like");
        dislikeButton.classList.toggle("reaction-selected", currentReaction === "dislike");
        likeButton.setAttribute("aria-pressed", String(currentReaction === "like"));
        dislikeButton.setAttribute("aria-pressed", String(currentReaction === "dislike"));
    }

    async function updateReaction(type) {
        if (busy) return;
        const user = await waitForUser();
        if (!user) {
            showInteractionError(container, null, "Please sign in to react to a complaint.");
            return;
        }
        busy = true;
        likeButton.disabled = dislikeButton.disabled = true;
        try {
            const reactionRef = doc(db, "complaints", complaintId, "reactions", user.uid);
            const existing = await getDoc(reactionRef);
            const existingType = existing.exists() ? existing.data().type : null;
            if (existingType === type) {
                await deleteDoc(reactionRef);
                currentReaction = null;
            } else {
                await setDoc(reactionRef, {
                    userId: user.uid,
                    type,
                    updatedAt: serverTimestamp()
                });
                currentReaction = type;
            }
            renderSelected();
            if (type === "dislike" && currentReaction === "dislike") {
                sendPhase5Event("reactionChanged", complaintId).catch((e) => console.warn("Dislike warning backend needs setup:", e));
            }
            const errorNode = container.querySelector(".interaction-error");
            if (errorNode) errorNode.remove();
        } catch (error) {
            showInteractionError(container, error, "Could not save your reaction. Please try again.");
        } finally {
            busy = false;
            likeButton.disabled = dislikeButton.disabled = false;
        }
    }

    likeButton.addEventListener("click", () => updateReaction("like"));
    dislikeButton.addEventListener("click", () => updateReaction("dislike"));

    waitForUser().then(async (user) => {
        try {
            if (user) {
                const ownReaction = await getDoc(doc(db, "complaints", complaintId, "reactions", user.uid));
                currentReaction = ownReaction.exists() ? ownReaction.data().type : null;
                renderSelected();
            }
            unsubscribe = onSnapshot(reactionsRef, (snapshot) => {
                let likes = 0;
                let dislikes = 0;
                snapshot.forEach((item) => {
                    if (item.data().type === "like") likes++;
                    if (item.data().type === "dislike") dislikes++;
                });
                likeCount.textContent = String(likes);
                dislikeCount.textContent = String(dislikes);
            }, (error) => showInteractionError(container, error, "Could not load reaction counts."));
        } catch (error) {
            showInteractionError(container, error, "Could not load your reaction.");
        }
    });

    return () => { if (unsubscribe) unsubscribe(); };
}

/** Adds persistent comment form and live comments list for one complaint. */
export function mountComments(container, complaintId) {
    const form = document.createElement("form");
    form.className = "comment-form";
    const input = document.createElement("textarea");
    input.rows = 3;
    input.maxLength = 1000;
    input.required = true;
    input.placeholder = "Share a helpful, respectful comment...";
    input.setAttribute("aria-label", "Write a comment");
    const submit = textElement("button", "Post comment", "view-button");
    submit.type = "submit";
    const formMessage = textElement("p", "", "comment-form-message");
    form.append(input, submit, formMessage);
    container.appendChild(form);

    const list = document.createElement("div");
    list.className = "comments-list";
    list.appendChild(textElement("p", "Loading comments...", "comments-loading"));
    container.appendChild(list);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) {
            formMessage.textContent = "Please write a comment first.";
            return;
        }
        if (text.length > 1000) {
            formMessage.textContent = "Comments must be 1,000 characters or fewer.";
            return;
        }
        const user = await waitForUser();
        if (!user) {
            formMessage.textContent = "Please sign in to comment.";
            return;
        }
        submit.disabled = true;
        formMessage.textContent = "Posting comment...";
        try {
            const userName = await getAccountName(user);
            await addDoc(collection(db, "complaints", complaintId, "comments"), {
                userId: user.uid,
                userName,
                text,
                createdAt: serverTimestamp()
            });
            input.value = "";
            formMessage.textContent = "Comment posted.";
        } catch (error) {
            console.error("Comment submission failed:", error);
            formMessage.textContent = error?.code === "permission-denied"
                ? "Firebase denied this comment. Check the Firestore comments rules."
                : "Could not post the comment. Please try again.";
        } finally {
            submit.disabled = false;
        }
    });

    const commentsQuery = query(
        collection(db, "complaints", complaintId, "comments"),
        orderBy("createdAt", "asc")
    );
    return onSnapshot(commentsQuery, (snapshot) => {
        list.replaceChildren();
        if (snapshot.empty) {
            list.appendChild(textElement("p", "No comments yet. Start the conversation respectfully.", "comments-placeholder"));
            return;
        }
        snapshot.forEach((commentSnapshot) => {
            const comment = commentSnapshot.data();
            const card = document.createElement("article");
            card.className = "comment-card";
            const header = document.createElement("div");
            header.className = "comment-header";
            header.appendChild(textElement("strong", comment.userName || "Citizen"));
            let dateLabel = "Just now";
            if (comment.createdAt) {
                const date = typeof comment.createdAt.toDate === "function" ? comment.createdAt.toDate() : new Date(comment.createdAt);
                if (!Number.isNaN(date.getTime())) dateLabel = date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
            }
            header.appendChild(textElement("span", dateLabel, "comment-date"));
            card.appendChild(header);
            card.appendChild(textElement("p", comment.text || "", "comment-text"));
            list.appendChild(card);
        });
    }, (error) => {
        list.replaceChildren();
        showInteractionError(list, error, "Could not load comments. Check Firestore read permissions.");
    });
}
