import {
    auth,
    db
} from "./firebase.js";

import {
    collection,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { sendPhase5Event } from "./phase5-backend.js";


// ==================================================
// GOOGLE APPS SCRIPT URL
// ==================================================

const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbzt0HcpGxDUc6Mpitckt3B3zXRiJL-I2WZDBIM6aLqfZ4VR1cb3o_nbkimQGGoWKzJO/exec";


// ==================================================
// LOCATION VARIABLES
// ==================================================

let latitude = null;
let longitude = null;


// ==================================================
// LOCATION BUTTON
// ==================================================

document
    .getElementById("locationButton")
    .addEventListener(
        "click",
        getLocation
    );


// ==================================================
// GET USER LOCATION
// ==================================================

function getLocation() {

    const status =
        document.getElementById(
            "locationStatus"
        );


    if (!navigator.geolocation) {

        status.textContent =
            "Geolocation is not supported.";

        return;
    }


    status.textContent =
        "Getting your location...";


    navigator.geolocation.getCurrentPosition(

        function (position) {

            latitude =
                position.coords.latitude;

            longitude =
                position.coords.longitude;


            status.textContent =
                `Location selected:
                ${latitude.toFixed(6)},
                ${longitude.toFixed(6)}`;


            console.log(
                "Latitude:",
                latitude
            );

            console.log(
                "Longitude:",
                longitude
            );

        },


        function (error) {

            console.error(error);

            status.textContent =
                "Unable to get location. Please allow location access.";

        }

    );

}


// ==================================================
// UPLOAD IMAGE TO GOOGLE DRIVE
// ==================================================

async function uploadImageToDrive(file) {

    return new Promise((resolve, reject) => {

        const reader =
            new FileReader();


        reader.onload = async function () {

            try {

                // Convert image into Base64
                const base64Data =
                    reader.result.split(",")[1];


                const uploadData = {

                    fileName:
                        `${Date.now()}_${file.name}`,

                    mimeType:
                        file.type,

                    fileData:
                        base64Data,

                    type:
                        "complaint"

                };


                console.log(
                    "Uploading image to Google Drive..."
                );


                const response =
                    await fetch(
                        APPS_SCRIPT_URL,
                        {
                            method: "POST",

                            redirect: "follow",

                            headers: {
                                "Content-Type":
                                    "text/plain;charset=utf-8"
                            },

                            body:
                                JSON.stringify(
                                    uploadData
                                )
                        }
                    );


                const result =
                    await response.json();


                console.log(
                    "Drive upload response:",
                    result
                );


                if (!result.success) {

                    throw new Error(
                        result.error ||
                        "Image upload failed."
                    );

                }


                // Return URL received from Apps Script
                resolve(
                    result.fileUrl
                );

            }

            catch (error) {

                reject(error);

            }

        };


        reader.onerror =
            function () {

                reject(
                    new Error(
                        "Could not read the image file."
                    )
                );

            };


        reader.readAsDataURL(file);

    });

}


// ==================================================
// COMPLAINT FORM SUBMISSION
// ==================================================

document
    .getElementById("complaintForm")
    .addEventListener(
        "submit",
        submitComplaint
    );


// ==================================================
// SUBMIT COMPLAINT FUNCTION
// ==================================================

async function submitComplaint(event) {

    event.preventDefault();


    const message =
        document.getElementById(
            "message"
        );


    const submitButton =
        document.getElementById(
            "submitButton"
        );


    try {

        // ------------------------------------------
        // 1. CHECK LOGIN
        // ------------------------------------------

        const user =
            auth.currentUser;


        if (!user) {

            alert(
                "Please login before submitting a complaint."
            );

            window.location.href =
                "login.html";

            return;

        }


        // ------------------------------------------
        // 2. GET FORM DATA
        // ------------------------------------------

        const title =
            document
                .getElementById("title")
                .value
                .trim();


        const category =
            document
                .getElementById("category")
                .value;


        const description =
            document
                .getElementById("description")
                .value
                .trim();


        const imageInput =
            document.getElementById(
                "image"
            );


        const file =
            imageInput.files[0];


        // ------------------------------------------
        // 3. VALIDATE FORM
        // ------------------------------------------

        if (!title) {

            alert(
                "Please enter an issue title."
            );

            return;

        }


        if (!category) {

            alert(
                "Please select a category."
            );

            return;

        }


        if (!description) {

            alert(
                "Please describe the issue."
            );

            return;

        }


        if (!file) {

            alert(
                "Please select an image."
            );

            return;

        }


        // ------------------------------------------
        // 4. CHECK LOCATION
        // ------------------------------------------

        if (
            latitude === null ||
            longitude === null
        ) {

            alert(
                "Please select your location before submitting."
            );

            return;

        }


        // ------------------------------------------
        // 5. CHECK IMAGE SIZE
        // ------------------------------------------

        const maxSize =
            5 * 1024 * 1024; // 5 MB


        if (file.size > maxSize) {

            alert(
                "Image must be smaller than 5 MB."
            );

            return;

        }


        // ------------------------------------------
        // 6. DISABLE SUBMIT BUTTON
        // ------------------------------------------

        submitButton.disabled =
            true;


        submitButton.textContent =
            "Submitting...";


        message.textContent =
            "Uploading image...";


        // ------------------------------------------
        // 7. UPLOAD IMAGE TO GOOGLE DRIVE
        // ------------------------------------------

        const imageURL =
            await uploadImageToDrive(
                file
            );


        console.log(
            "Image URL:",
            imageURL
        );


        // ------------------------------------------
        // 8. SAVE COMPLAINT TO FIRESTORE
        // ------------------------------------------

        message.textContent =
            "Saving complaint...";


        const complaintData = {

            title:
                title,

            category:
                category,

            description:
                description,

            latitude:
                latitude,

            longitude:
                longitude,

            imageURL:
                imageURL,

            userId:
                user.uid,

            status:
                "SUBMITTED",

            createdAt:
                serverTimestamp()

        };


        const complaintRef =
            await addDoc(
                collection(
                    db,
                    "complaints"
                ),
                complaintData
            );


        // ------------------------------------------
        // Create an in-platform notification through the trusted backend when configured.
        // Notification failure must not undo a successfully submitted complaint.
        sendPhase5Event("complaintSubmitted", complaintRef.id).catch((e) => console.warn("Phase 5 notification pending backend setup:", e));

        // 9. SUCCESS
        // ------------------------------------------

        console.log(
            "Complaint successfully created."
        );


        console.log(
            "Complaint ID:",
            complaintRef.id
        );


        message.textContent =
            "Complaint submitted successfully!";


        alert(
            "Complaint submitted successfully!"
        );


        // ------------------------------------------
        // 10. RESET FORM
        // ------------------------------------------

        document
            .getElementById(
                "complaintForm"
            )
            .reset();


        latitude = null;
        longitude = null;


        document
            .getElementById(
                "locationStatus"
            )
            .textContent =
            "Location not selected";


    }


    catch (error) {

        console.error(
            "Complaint submission error:",
            error
        );


        message.textContent =
            "Something went wrong.";


        alert(
            "Error submitting complaint:\n" +
            error.message
        );

    }


    finally {

        submitButton.disabled =
            false;


        submitButton.textContent =
            "Submit Complaint";

    }

}