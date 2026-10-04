import {
    auth,
    db
} from "./firebase.js";

import {
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


document
    .getElementById("loginButton")
    .addEventListener("click", login);


async function login() {

    const email =
        document.getElementById("email").value;

    const password =
        document.getElementById("password").value;

    const message =
        document.getElementById("message");


    try {

        const userCredential =
            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );


        const uid =
            userCredential.user.uid;


        const userDoc =
            await getDoc(
                doc(db, "users", uid)
            );


        if (!userDoc.exists()) {

            message.textContent =
                "User profile not found.";

            return;
        }


        const userData =
            userDoc.data();


        if (userData.role === "citizen") {

            window.location.href =
                "citizen.html";

        }

        else if (
            userData.role === "government"
        ) {

            window.location.href =
                "government.html";

        }

    }

    catch (error) {

        console.error(error);

        message.textContent =
            "Login failed: " + error.message;

    }

}