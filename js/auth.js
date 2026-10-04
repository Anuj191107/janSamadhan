import {
    auth,
    db
} from "./firebase.js";

import {
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import {
    doc,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


const registerButton =
    document.getElementById("registerButton");


if (registerButton) {

    registerButton.addEventListener(
        "click",
        registerUser
    );

}


async function registerUser() {

    const name =
        document.getElementById("name").value;

    const email =
        document.getElementById("email").value;

    const password =
        document.getElementById("password").value;

    const role =
        document.getElementById("role").value;


    const message =
        document.getElementById("message");


    try {

        const userCredential =
            await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );


        const user =
            userCredential.user;


        await setDoc(
            doc(db, "users", user.uid),
            {

                name: name,

                email: email,

                role: role,

                createdAt: new Date()

            }
        );


        message.textContent =
            "Registration successful!";

        console.log(user.uid);

    }

    catch (error) {

        console.error(error);

        message.textContent =
            error.message;

    }

}