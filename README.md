# 📚 SEBA Device Tracker

A tiny website that lets library staff keep track of how many **hotspots** and
**Chromebooks** (or anything else) are available for checkout — so staff in the
back offices can answer a phone call without walking to the front desk.

- **Front desk** taps **+** / **−** as devices go out and come back
  (or clicks a number to type an exact count).
- **Everyone else** just keeps the page open — it updates by itself, live,
  within a second. No refresh button, no polling.
- **`display.html`** is a read-only view with huge numbers, made to be left
  fullscreen on a back-office monitor and readable from across the room.

Also included:

- 🕐 **Recent activity** log — see the last changes ("Hotspots · Available 3 → 2")
  to catch mistakes.
- ⚙️ **Edit devices** — add, rename, reorder, or remove device types without
  touching code (add "Tablets" later in ten seconds).
- 📶 **Offline-friendly** — a Wi-Fi blip shows the last known counts with an
  "Offline" badge instead of an error.
- 🧪 **Demo mode** — until Firebase is configured, the site runs on
  browser-local storage so you can try everything immediately.

No build step, no framework — plain HTML/CSS/JS you can edit directly on GitHub.

---

## Setup (once, ~15 minutes)

You need two free things: **GitHub Pages** (hosts the site — this repo) and
**Firebase Firestore** (the shared live database).

### 1. Turn on GitHub Pages

1. In this repo, go to **Settings → Pages**.
2. Under *Build and deployment*, set **Source** to `Deploy from a branch`,
   pick the **`main`** branch and **`/ (root)`** folder, and save.
3. After a minute, your site is at
   `https://<your-username>.github.io/SEBA-Hotspot-tracker/`.

At this point the site works in **demo mode** (yellow banner) — counts save
only in each browser. Continue below to make them shared and live.

### 2. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
   and click **Create a project** (the free *Spark* plan is plenty —
   this app stays far below the free limits).
   You can decline Google Analytics.
2. In the left menu choose **Build → Firestore Database → Create database**.
   Pick the location closest to you and start in **production mode**.
3. Open the **Rules** tab of Firestore, replace everything with the contents
   of [`firestore.rules`](firestore.rules) from this repo, and click **Publish**.

### 3. Connect the site to Firebase

1. In Firebase, click the **⚙ Project settings** gear → *General* →
   *Your apps* → the **`</>`** (Web) icon to register a web app
   (no hosting needed — GitHub Pages does that part).
2. Firebase shows a `firebaseConfig = { ... }` snippet. Copy those values
   into [`js/firebase-config.js`](js/firebase-config.js) in this repo,
   replacing the `PASTE_...` placeholders. You can edit the file right on
   GitHub (pencil icon) and commit.
3. GitHub Pages redeploys automatically in about a minute. Reload the site —
   the yellow demo banner is gone and the pill says **● Live**. On first load
   the app creates the default *Hotspots* and *Chromebooks* cards for you.

Open the site on two different computers and tap **+** on one — the other
updates within a second. That's the whole tool working.

> ℹ️ The values in `firebase-config.js` are identifiers, not secrets — it's
> normal and safe for them to be public. Access is controlled by the
> Firestore rules you published, which allow only valid count updates.

## Day-to-day use

| Who | What |
| --- | --- |
| Front desk | Tap **+**/**−** as devices go out or come back. Click a number to type an exact count after a shelf recount. |
| Back office | Keep the page (or `display.html` on a spare monitor) open — it updates itself. |
| Anyone | Open **🕐 Recent activity** to see what changed and when. |
| Whoever manages devices | **⚙️ Edit devices** to add/rename/reorder/remove device types. |

## Files

| File | Purpose |
| --- | --- |
| `index.html` + `js/app.js` | Main tracker page |
| `display.html` + `js/display.js` | Read-only big-numbers view for a monitor |
| `js/store.js` | Data layer (Firestore, or localStorage in demo mode) |
| `js/firebase-config.js` | Your Firebase project's config — the only file you must edit |
| `firestore.rules` | Database rules to paste into the Firebase console |
| `css/style.css` | All styles (light/dark follows the computer's setting) |

## Troubleshooting

- **Yellow "Demo mode" banner won't go away** — `js/firebase-config.js` still
  has `PASTE_...` placeholders, or the edit hasn't deployed yet (check the
  repo's *Actions* tab for the Pages build).
- **"Offline" badge** — the computer lost internet or Firebase is unreachable;
  counts shown are the last known ones and taps sync when it reconnects.
- **Changes rejected / counts snap back** — the Firestore rules from step 2.3
  probably weren't published, or were edited; re-paste `firestore.rules`.
- **Want to poke around without touching real data?** — add `?demo` to the
  page address to run it on browser-local demo data.
