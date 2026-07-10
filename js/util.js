// Small helpers shared by the main and display pages.

// Escape user-controlled text for safe interpolation into HTML
// (element content and double-quoted attribute values).
export function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// When the page was opened with ?demo, carry the flag onto same-site
// links so navigating between the tracker and display view doesn't
// silently drop the user back into the live data.
export function keepDemoParam() {
  if (!new URLSearchParams(location.search).has("demo")) return;
  document.querySelectorAll("a[href]").forEach((a) => {
    const url = new URL(a.getAttribute("href"), location.href);
    if (url.origin === location.origin && !url.searchParams.has("demo")) {
      url.searchParams.set("demo", "");
      a.href = url.pathname + url.search + url.hash;
    }
  });
}
