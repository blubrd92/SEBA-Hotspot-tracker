// ─────────────────────────────────────────────────────────────
// Firebase configuration
//
// These values are public identifiers, not secrets — access to the
// database is controlled by the Firestore rules (see firestore.rules).
//
// If they're ever replaced with PASTE_... placeholders, the site
// falls back to DEMO MODE: everything works, but data is stored only
// in the local browser and is not shared between computers.
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyBAfRUK-ircPWWz3vbT9rtV0TFeBU0wE7U",
  authDomain: "seba-device-tracker.firebaseapp.com",
  projectId: "seba-device-tracker",
  storageBucket: "seba-device-tracker.firebasestorage.app",
  messagingSenderId: "438596128416",
  appId: "1:438596128416:web:df467d2b2c708968d283c5",
};

// Demo mode when the placeholders are untouched, or when the page is
// opened with ?demo in the URL (handy for previewing the interface
// without touching the live shared data).
const demoOverride =
  typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");

export const isDemoMode = demoOverride || firebaseConfig.projectId.startsWith("PASTE_");
