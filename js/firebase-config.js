// ─────────────────────────────────────────────────────────────
// Firebase configuration
//
// Until you fill this in, the site runs in DEMO MODE: everything
// works, but data is stored only in this browser (localStorage)
// and is not shared between computers.
//
// To go live (see README.md for the full walkthrough):
//   1. Create a Firebase project at https://console.firebase.google.com
//   2. Add a Web App to the project (the </> icon)
//   3. Copy the "firebaseConfig" values it shows you over the
//      placeholders below
//   4. Commit and push — GitHub Pages redeploys automatically
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID",
};

// True while the placeholders above are untouched.
export const isDemoMode = firebaseConfig.projectId.startsWith("PASTE_");
