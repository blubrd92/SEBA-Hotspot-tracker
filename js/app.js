// Main tracker page.

import { createStore } from "./store.js";

const cardsEl = document.getElementById("cards");
const statusPill = document.getElementById("status-pill");
const demoBanner = document.getElementById("demo-banner");
const activityList = document.getElementById("activity-list");
const settingsDialog = document.getElementById("settings-dialog");
const settingsList = document.getElementById("settings-list");

let store;
let devices = [];
let editing = null; // {id, field} while a count is being typed

const FIELD_LABELS = { available: "Available", mending: "Mending" };

init();

async function init() {
  store = await createStore();

  if (store.mode === "demo") demoBanner.hidden = false;

  store.onStatus((status) => {
    statusPill.classList.remove("live", "offline");
    if (status === "live") {
      statusPill.classList.add("live");
      statusPill.textContent = "● Live";
    } else if (status === "offline") {
      statusPill.classList.add("offline");
      statusPill.textContent = "⚠ Offline — showing last known counts";
    } else {
      statusPill.textContent = "Demo mode";
    }
  });

  store.onDeviceTypes((list) => {
    devices = list;
    renderCards();
  });

  store.onActivity(renderActivity);

  // Keep the "Updated X min ago" lines fresh.
  setInterval(() => {
    document.querySelectorAll(".updated[data-ts]").forEach((el) => {
      el.textContent = "Updated " + timeAgo(new Date(Number(el.dataset.ts)));
    });
  }, 30_000);

  wireCardEvents();
  wireSettings();
}

// ── Cards ──────────────────────────────────────────

function renderCards() {
  // Don't yank the input out from under the user; finishing the edit re-renders.
  if (editing) return;

  if (devices.length === 0) {
    cardsEl.innerHTML = '<p class="loading">No device types yet — add one with ⚙️ Edit devices.</p>';
    return;
  }

  cardsEl.innerHTML = devices
    .map(
      (d) => `
    <article class="card" data-id="${d.id}">
      <h2>${esc(d.emoji)} ${esc(d.name)}</h2>
      <div class="counts">
        ${countBlock(d, "available")}
        ${countBlock(d, "mending")}
      </div>
      <footer class="updated" ${d.updatedAt ? `data-ts="${d.updatedAt.getTime()}"` : ""}>
        ${d.updatedAt ? "Updated " + timeAgo(d.updatedAt) : ""}
      </footer>
    </article>`
    )
    .join("");
}

function countBlock(d, field) {
  const n = d[field];
  const stateClass =
    field === "available" ? (n > 0 ? "has-items" : "is-zero") : n > 0 ? "has-items" : "";
  return `
    <section class="count ${field} ${stateClass}">
      <span class="count-label">${FIELD_LABELS[field]}</span>
      <button class="count-num" data-action="edit" data-field="${field}"
        title="Click to type an exact number"
        aria-label="${esc(d.name)} ${FIELD_LABELS[field].toLowerCase()}: ${n}. Click to type an exact number.">${n}</button>
      <div class="count-row">
        <button class="step" data-action="adjust" data-field="${field}" data-delta="-1"
          ${n === 0 ? "disabled" : ""}
          aria-label="One ${FIELD_LABELS[field].toLowerCase()} ${esc(d.name)} fewer">−</button>
        <button class="step" data-action="adjust" data-field="${field}" data-delta="1"
          aria-label="One ${FIELD_LABELS[field].toLowerCase()} ${esc(d.name)} more">+</button>
      </div>
    </section>`;
}

function wireCardEvents() {
  cardsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.closest(".card")?.dataset.id;
    const field = btn.dataset.field;
    if (!id) return;

    if (btn.dataset.action === "adjust") {
      store.adjustCount(id, field, Number(btn.dataset.delta));
    } else if (btn.dataset.action === "edit") {
      openInlineEdit(btn, id, field);
    }
  });
}

function openInlineEdit(numBtn, id, field) {
  editing = { id, field };
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "999";
  input.className = "count-edit";
  input.value = numBtn.textContent.trim();
  numBtn.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    if (commit && input.value !== "") {
      store.setCount(id, field, input.value);
    }
    editing = null;
    renderCards();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
}

// ── Activity log ───────────────────────────────────

function renderActivity(entries) {
  if (entries.length === 0) {
    activityList.innerHTML = '<li class="activity-empty">No changes yet.</li>';
    return;
  }
  activityList.innerHTML = entries
    .map((a) => {
      const dir = a.to > a.from ? "delta-up" : "delta-down";
      const arrow = a.to > a.from ? "▲" : "▼";
      return `
      <li>
        <span class="activity-what">
          ${esc(a.deviceTypeName)} · ${FIELD_LABELS[a.field] ?? esc(a.field)}
          <span class="${dir}">${arrow} ${a.from} → ${a.to}</span>
        </span>
        <span class="activity-when">${a.at ? formatWhen(a.at) : "…"}</span>
      </li>`;
    })
    .join("");
}

// ── Settings dialog ────────────────────────────────

function wireSettings() {
  document.getElementById("settings-btn").addEventListener("click", () => {
    renderSettingsList();
    settingsDialog.showModal();
  });
  document.getElementById("settings-close").addEventListener("click", () => {
    settingsDialog.close();
  });

  document.getElementById("add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameEl = document.getElementById("add-name");
    const emojiEl = document.getElementById("add-emoji");
    const name = nameEl.value.trim();
    if (!name) return;
    await store.addDeviceType(name, emojiEl.value.trim());
    nameEl.value = "";
    emojiEl.value = "";
    renderSettingsList();
  });

  settingsList.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.closest("li").dataset.id;
    const device = devices.find((d) => d.id === id);
    if (!device) return;

    if (btn.dataset.action === "up") await store.moveDeviceType(id, -1);
    if (btn.dataset.action === "down") await store.moveDeviceType(id, 1);
    if (btn.dataset.action === "delete") {
      const ok = confirm(
        `Remove "${device.name}"?\n\nIts counts and card disappear for everyone. This can't be undone.`
      );
      if (!ok) return;
      await store.deleteDeviceType(id);
    }
    renderSettingsList();
  });

  // Commit renames when an input loses focus or Enter is pressed.
  settingsList.addEventListener(
    "blur",
    (e) => {
      if (e.target.matches("input")) commitRename(e.target.closest("li"));
    },
    true
  );
  settingsList.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("input")) e.target.blur();
  });
}

function renderSettingsList() {
  const sorted = [...devices].sort((a, b) => a.order - b.order);
  settingsList.innerHTML = sorted
    .map(
      (d, i) => `
    <li data-id="${d.id}">
      <input type="text" class="settings-emoji" maxlength="4" value="${esc(d.emoji)}" aria-label="Emoji for ${esc(d.name)}">
      <input type="text" class="settings-name" maxlength="40" value="${esc(d.name)}" aria-label="Name for ${esc(d.name)}">
      <button class="icon-btn" data-action="up" title="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
      <button class="icon-btn" data-action="down" title="Move down" ${i === sorted.length - 1 ? "disabled" : ""}>↓</button>
      <button class="icon-btn danger" data-action="delete" title="Remove ${esc(d.name)}">🗑</button>
    </li>`
    )
    .join("");
}

function commitRename(li) {
  if (!li) return;
  const id = li.dataset.id;
  const device = devices.find((d) => d.id === id);
  if (!device) return;
  const name = li.querySelector(".settings-name").value.trim();
  const emoji = li.querySelector(".settings-emoji").value.trim();
  if (!name || (name === device.name && emoji === device.emoji)) return;
  store.updateDeviceType(id, { name, emoji });
}

// ── Helpers ────────────────────────────────────────

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function timeAgo(date) {
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return date.toLocaleDateString();
}

function formatWhen(date) {
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const today = new Date().toDateString() === date.toDateString();
  return today ? time : `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}
