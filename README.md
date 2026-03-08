# NautilusX GitHub Pages Site

Static site for GitHub Pages that embeds a NautilusX URL in an iframe.

## Files

- `index.html`
- `styles.css`
- `app.js`

## Default embedded URL

- `https://nautilusx.github.io`

Change it in `app.js` (`DEFAULT_TARGET_URL`) or pass a target at runtime:

```text
https://your-username.github.io/your-repo/?target=https://your-live-site
```

## Title + favicon sync

The wrapper now tries to copy the embedded page title/favicon.

- Works directly for same-origin iframe targets.
- Works cross-origin only if the target allows CORS metadata fetch or sends `postMessage`.

## Messages auto-refresh (4 seconds)

When the embedded page path is `/messages`, the wrapper refreshes every 4 seconds.

- Same-origin targets: works automatically.
- Cross-origin targets: add the script below so the wrapper can read path/state and trigger refresh safely.

Optional manual override:

```text
?target=https://your-live-site&title=Your%20Title&favicon=https://your-live-site/favicon.ico
```

Optional script for the embedded site (cross-origin support):

```html
<script>
window.addEventListener("message", (event) => {
  if (!event.data || typeof event.data !== "object") return;

  const sendState = () => {
    const icon = document.querySelector("link[rel~='icon']");
    event.source.postMessage({
      type: "nautilusx:state",
      title: document.title,
      favicon: icon ? icon.href : "/favicon.ico",
      pathname: window.location.pathname
    }, event.origin);
  };

  if (event.data.type === "nautilusx:request-meta" || event.data.type === "nautilusx:request-state") {
    sendState();
    return;
  }

  if (event.data.type === "nautilusx:refresh-if-messages") {
    const path = window.location.pathname.toLowerCase();
    if (path === "/messages" || path.startsWith("/messages/")) {
      window.location.reload();
    }
  }
});

["popstate", "hashchange", "pageshow"].forEach((type) => {
  window.addEventListener(type, () => {
    if (!window.parent || window.parent === window) return;
    const icon = document.querySelector("link[rel~='icon']");
    window.parent.postMessage({
      type: "nautilusx:state",
      title: document.title,
      favicon: icon ? icon.href : "/favicon.ico",
      pathname: window.location.pathname
    }, "*");
  });
});
</script>
```

If you also use the Electron wrappers in this repo, this bridge is already included in:

- `preload.js`
- `github-electron-app/preload.js`

## Deploy to GitHub Pages

1. Push this folder's files to the repo branch/path used by Pages.
2. In GitHub repo settings, enable Pages for that branch/path.
3. Open the Pages URL.

If the iframe is blank, the target site likely blocks embedding with `X-Frame-Options` or CSP `frame-ancestors`.
