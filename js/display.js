// Big-screen kiosk view: read-only, huge numbers, flashes on change.
// Leave it open fullscreen on a back-office monitor.

import { createStore } from "./store.js";
import { esc, keepDemoParam, scheduleDailyReload } from "./util.js";

const grid = document.getElementById("display-grid");
const statusEl = document.getElementById("display-status");
const clockEl = document.getElementById("clock");

let prevCounts = new Map(); // id -> {available, mending}, to detect changes

init();

async function init() {
  keepDemoParam();
  scheduleDailyReload();
  tickClock();
  setInterval(tickClock, 10_000);

  let store;
  try {
    store = await createStore();
  } catch (e) {
    console.error("Could not start the data store:", e);
    statusEl.textContent = "❌ Can't connect — the network may be blocking Firebase";
    grid.innerHTML = '<p class="loading">The live database couldn\'t be loaded. Reload to try again.</p>';
    return;
  }

  store.onStatus((status) => {
    statusEl.textContent =
      status === "live"
        ? "● Live — updates automatically"
        : status === "offline"
          ? "⚠ Offline — showing last known counts"
          : status === "connecting"
            ? "Connecting…"
            : "Demo mode — data from this browser only";
  });

  store.onDeviceTypes(render);
}

function render(devices) {
  if (devices.length === 0) {
    grid.innerHTML = '<p class="loading">No device types set up yet.</p>';
    return;
  }

  grid.innerHTML = devices
    .map((d) => {
      const changed =
        prevCounts.has(d.id) &&
        (prevCounts.get(d.id).available !== d.available ||
          prevCounts.get(d.id).mending !== d.mending);
      return `
      <section class="display-tile ${d.available > 0 ? "ok" : "none"} ${changed ? "flash" : ""}">
        <div class="display-name">${esc(d.emoji)} ${esc(d.name)}</div>
        <div class="display-count">${d.available}</div>
        <div class="display-sub">
          available
          ${d.mending > 0 ? `· <span class="mend-some">${d.mending} mending</span>` : ""}
        </div>
      </section>`;
    })
    .join("");

  prevCounts = new Map(devices.map((d) => [d.id, { available: d.available, mending: d.mending }]));
}

function tickClock() {
  clockEl.textContent = new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
