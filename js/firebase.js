import {
	initializeApp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
	getAuth
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import {
	getFirestore
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


const firebaseConfig = {

	apiKey: "AIzaSyAmG4B9yilyq-vCHCCoXzmvhARmf2lD1JM",
	authDomain: "jan-samadhan-a4164.firebaseapp.com",
	projectId: "jan-samadhan-a4164",
	storageBucket: "jan-samadhan-a4164.firebasestorage.app",
	messagingSenderId: "691182894462",
	appId: "1:691182894462:web:0423cd5c0359002cfa472f"

};


const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);


export {
	app,
	auth,
	db
};