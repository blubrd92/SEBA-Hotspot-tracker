// Data layer for the device tracker.
//
// createStore() returns the same API whether it's backed by Firestore
// (live, shared between all staff) or by localStorage (demo mode, used
// until js/firebase-config.js is filled in):
//
//   store.mode                        'firebase' | 'demo'
//   store.onDeviceTypes(cb)           cb(listSortedByOrder)
//   store.onActivity(cb)              cb(entriesNewestFirst, max 25)
//   store.onStatus(cb)                cb('live' | 'offline' | 'demo')
//   store.adjustCount(id, field, delta)
//   store.setCount(id, field, value)
//   store.addDeviceType(name, emoji)
//   store.updateDeviceType(id, {name, emoji})
//   store.deleteDeviceType(id)
//   store.moveDeviceType(id, dir)     dir: -1 up, +1 down

import { firebaseConfig, isDemoMode } from "./firebase-config.js";

const COUNT_MAX = 999;
const ACTIVITY_SHOWN = 10;
const ACTIVITY_KEEP = 200;

const DEFAULT_DEVICE_TYPES = [
  { id: "hotspots", name: "Hotspots", emoji: "📱", order: 0, available: 0, mending: 0 },
  { id: "chromebooks", name: "Chromebooks", emoji: "💻", order: 1, available: 0, mending: 0 },
];

const clampCount = (n) => Math.max(0, Math.min(COUNT_MAX, Math.trunc(Number(n) || 0)));

export async function createStore() {
  return isDemoMode ? createDemoStore() : createFirestoreStore();
}

// ───────────────────────── Firestore ─────────────────────────

async function createFirestoreStore() {
  const { initializeApp } = await import(
    "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js"
  );
  const fs = await import(
    "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js"
  );

  const app = initializeApp(firebaseConfig);
  // Local cache keeps the last-known counts visible through Wi-Fi blips
  // and syncs across tabs on the same computer. If persistence isn't
  // available (some private-browsing modes), fall back to memory-only
  // rather than failing to start.
  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({
        tabManager: fs.persistentMultipleTabManager(),
      }),
    });
  } catch (e) {
    console.warn("Persistent cache unavailable, using in-memory cache:", e);
    db = fs.getFirestore(app);
  }

  const deviceTypesCol = fs.collection(db, "deviceTypes");
  const activityCol = fs.collection(db, "activity");

  let latest = new Map(); // id -> device type data, for from→to activity entries
  let statusCb = null;
  let status = "connecting";
  let everLive = false;
  const setStatus = (s) => {
    if (s !== status) {
      status = s;
      statusCb?.(status);
    }
  };
  // Cache-only snapshots during startup mean "still connecting", not
  // "offline" — only show the offline warning once we've either been
  // live before or given the first connection a fair chance.
  setTimeout(() => {
    if (!everLive && status === "connecting") setStatus("offline");
  }, 6000);
  const noteSnapshot = (fromCache) => {
    if (!fromCache) {
      everLive = true;
      setStatus("live");
    } else if (everLive) {
      setStatus("offline");
    }
  };

  // Network problems retry inside the SDK, but errors like a (temporarily)
  // broken rules deploy cancel an onSnapshot listener permanently. Without
  // this, a wall display would sit frozen on "Offline" until someone
  // reloads the page — even after the rules are fixed. Re-subscribe with
  // exponential backoff instead.
  function listenForever(query, options, handler, label) {
    let delay = 5_000;
    let stopped = false;
    let unsubscribe = () => {};
    const subscribe = () => {
      unsubscribe = fs.onSnapshot(
        query,
        options,
        (snap) => {
          delay = 5_000; // healthy again — reset the backoff
          handler(snap);
        },
        (err) => {
          console.error(`${label} listener error, retrying in ${delay / 1000}s:`, err);
          setStatus("offline");
          if (stopped) return;
          setTimeout(() => {
            if (!stopped) subscribe();
          }, delay);
          delay = Math.min(delay * 2, 300_000);
        }
      );
    };
    subscribe();
    return () => {
      stopped = true;
      unsubscribe();
    };
  }

  let seedChecked = false;
  async function seedIfEmpty(snapshotEmpty) {
    if (seedChecked || !snapshotEmpty) return;
    seedChecked = true;
    // Only seed on a true first run. The meta/setup marker records that
    // setup already happened, so deliberately deleting every device type
    // doesn't resurrect the defaults.
    const markerRef = fs.doc(db, "meta", "setup");
    const marker = await fs.getDoc(markerRef);
    if (marker.exists()) return;
    await fs.setDoc(markerRef, { seededAt: fs.serverTimestamp() });
    // Fixed doc IDs make this idempotent if two browsers race on first run.
    await Promise.all(
      DEFAULT_DEVICE_TYPES.map((d) => {
        const { id, ...data } = d;
        return fs.setDoc(
          fs.doc(deviceTypesCol, id),
          { ...data, updatedAt: fs.serverTimestamp() },
          { merge: true }
        );
      })
    );
  }

  async function logActivity(deviceTypeName, field, from, to) {
    try {
      await fs.addDoc(activityCol, {
        deviceTypeName,
        field,
        from,
        to,
        at: fs.serverTimestamp(),
      });
      if (Math.random() < 0.03) await trimActivity();
    } catch (e) {
      console.warn("Activity log write failed:", e);
    }
  }

  async function trimActivity() {
    const snap = await fs.getDocs(
      fs.query(activityCol, fs.orderBy("at", "desc"), fs.limit(ACTIVITY_KEEP + 100))
    );
    const stale = snap.docs.slice(ACTIVITY_KEEP);
    await Promise.all(stale.map((d) => fs.deleteDoc(d.ref)));
  }

  return {
    mode: "firebase",

    onDeviceTypes(cb) {
      return listenForever(
        fs.query(deviceTypesCol, fs.orderBy("order")),
        { includeMetadataChanges: true },
        (snap) => {
          noteSnapshot(snap.metadata.fromCache);
          const list = snap.docs.map((d) => {
            // "estimate" keeps updatedAt usable on latency-compensated
            // snapshots instead of null while the server timestamp is pending.
            const data = d.data({ serverTimestamps: "estimate" });
            return {
              id: d.id,
              name: data.name ?? "",
              emoji: data.emoji ?? "",
              order: data.order ?? 0,
              available: data.available ?? 0,
              mending: data.mending ?? 0,
              updatedAt: data.updatedAt?.toDate?.() ?? null,
            };
          });
          latest = new Map(list.map((d) => [d.id, d]));
          seedIfEmpty(snap.empty && !snap.metadata.fromCache).catch(console.warn);
          cb(list);
        },
        "deviceTypes"
      );
    },

    onActivity(cb) {
      return listenForever(
        fs.query(activityCol, fs.orderBy("at", "desc"), fs.limit(ACTIVITY_SHOWN)),
        {},
        (snap) => {
          cb(
            snap.docs.map((d) => {
              const data = d.data({ serverTimestamps: "estimate" });
              return { id: d.id, ...data, at: data.at?.toDate?.() ?? null };
            })
          );
        },
        "activity"
      );
    },

    onStatus(cb) {
      statusCb = cb;
      cb(status);
    },

    async adjustCount(id, field, delta) {
      const current = latest.get(id);
      if (!current) return;
      const from = current[field];
      const to = clampCount(from + delta);
      if (to === from) return;
      // increment() is atomic, so two staff tapping at once both count.
      // Security rules reject a result outside 0–999 and the listener
      // snaps the display back, so the clamp only needs to be best-effort.
      await fs.updateDoc(fs.doc(deviceTypesCol, id), {
        [field]: fs.increment(to - from),
        updatedAt: fs.serverTimestamp(),
      });
      logActivity(current.name, field, from, to);
    },

    async setCount(id, field, value) {
      const current = latest.get(id);
      if (!current) return;
      const from = current[field];
      const to = clampCount(value);
      if (to === from) return;
      await fs.updateDoc(fs.doc(deviceTypesCol, id), {
        [field]: to,
        updatedAt: fs.serverTimestamp(),
      });
      logActivity(current.name, field, from, to);
    },

    async addDeviceType(name, emoji) {
      // Date.now() keeps concurrently-added types from colliding on the
      // same order value (which would make the reorder arrows no-ops);
      // maxOrder+1 keeps "append at end" even with a skewed clock.
      const maxOrder = Math.max(-1, ...[...latest.values()].map((d) => d.order));
      await fs.addDoc(deviceTypesCol, {
        name,
        emoji,
        order: Math.max(maxOrder + 1, Date.now()),
        available: 0,
        mending: 0,
        updatedAt: fs.serverTimestamp(),
      });
    },

    async updateDeviceType(id, fields) {
      // Partial update: only touch the fields the caller actually changed,
      // so a stale settings dialog can't clobber a concurrent edit to the
      // other field from another desk.
      const updates = {};
      if (fields.name !== undefined) updates.name = fields.name;
      if (fields.emoji !== undefined) updates.emoji = fields.emoji;
      if (Object.keys(updates).length === 0) return;
      await fs.updateDoc(fs.doc(deviceTypesCol, id), {
        ...updates,
        updatedAt: fs.serverTimestamp(),
      });
    },

    async deleteDeviceType(id) {
      await fs.deleteDoc(fs.doc(deviceTypesCol, id));
    },

    async moveDeviceType(id, dir) {
      const list = [...latest.values()].sort((a, b) => a.order - b.order);
      const i = list.findIndex((d) => d.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      await Promise.all([
        fs.updateDoc(fs.doc(deviceTypesCol, list[i].id), { order: list[j].order }),
        fs.updateDoc(fs.doc(deviceTypesCol, list[j].id), { order: list[i].order }),
      ]);
    },
  };
}

// ───────────────────────── Demo (localStorage) ─────────────────────────

function createDemoStore() {
  const KEY = "seba-device-tracker-demo";

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn("Demo data unreadable, starting fresh:", e);
    }
    return {
      deviceTypes: DEFAULT_DEVICE_TYPES.map((d) => ({ ...d, updatedAt: Date.now() })),
      activity: [],
    };
  }

  let state = load();
  const deviceCbs = new Set();
  const activityCbs = new Set();

  function persistAndNotify() {
    localStorage.setItem(KEY, JSON.stringify(state));
    notify();
  }

  function notify() {
    const list = [...state.deviceTypes]
      .sort((a, b) => a.order - b.order)
      .map((d) => ({ ...d, updatedAt: d.updatedAt ? new Date(d.updatedAt) : null }));
    deviceCbs.forEach((cb) => cb(list));
    const acts = state.activity
      .slice(0, ACTIVITY_SHOWN)
      .map((a) => ({ ...a, at: a.at ? new Date(a.at) : null }));
    activityCbs.forEach((cb) => cb(acts));
  }

  // Sync across tabs (lets the display page mirror the main page locally).
  window.addEventListener("storage", (e) => {
    if (e.key === KEY && e.newValue) {
      try {
        state = JSON.parse(e.newValue);
        notify();
      } catch {}
    }
  });

  const find = (id) => state.deviceTypes.find((d) => d.id === id);

  function logActivity(deviceTypeName, field, from, to) {
    state.activity.unshift({
      id: String(Date.now()) + Math.random().toString(36).slice(2),
      deviceTypeName,
      field,
      from,
      to,
      at: Date.now(),
    });
    state.activity = state.activity.slice(0, ACTIVITY_KEEP);
  }

  return {
    mode: "demo",

    onDeviceTypes(cb) {
      deviceCbs.add(cb);
      notify();
      return () => deviceCbs.delete(cb);
    },

    onActivity(cb) {
      activityCbs.add(cb);
      notify();
      return () => activityCbs.delete(cb);
    },

    onStatus(cb) {
      cb("demo");
    },

    async adjustCount(id, field, delta) {
      const d = find(id);
      if (!d) return;
      const to = clampCount(d[field] + delta);
      if (to === d[field]) return;
      logActivity(d.name, field, d[field], to);
      d[field] = to;
      d.updatedAt = Date.now();
      persistAndNotify();
    },

    async setCount(id, field, value) {
      const d = find(id);
      if (!d) return;
      const to = clampCount(value);
      if (to === d[field]) return;
      logActivity(d.name, field, d[field], to);
      d[field] = to;
      d.updatedAt = Date.now();
      persistAndNotify();
    },

    async addDeviceType(name, emoji) {
      const maxOrder = Math.max(-1, ...state.deviceTypes.map((d) => d.order));
      state.deviceTypes.push({
        id: String(Date.now()) + Math.random().toString(36).slice(2),
        name,
        emoji,
        order: Math.max(maxOrder + 1, Date.now()),
        available: 0,
        mending: 0,
        updatedAt: Date.now(),
      });
      persistAndNotify();
    },

    async updateDeviceType(id, fields) {
      const d = find(id);
      if (!d) return;
      if (fields.name !== undefined) d.name = fields.name;
      if (fields.emoji !== undefined) d.emoji = fields.emoji;
      d.updatedAt = Date.now();
      persistAndNotify();
    },

    async deleteDeviceType(id) {
      state.deviceTypes = state.deviceTypes.filter((d) => d.id !== id);
      persistAndNotify();
    },

    async moveDeviceType(id, dir) {
      const list = [...state.deviceTypes].sort((a, b) => a.order - b.order);
      const i = list.findIndex((d) => d.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i].order, list[j].order] = [list[j].order, list[i].order];
      persistAndNotify();
    },
  };
}
