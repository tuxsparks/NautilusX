(function bootstrap() {
  const DEFAULT_TARGET_URL = "https://nautilusx.playit.plus:36703/";
  const MESSAGES_REFRESH_MS = 4000;
  const STATE_PING_MS = 2000;
  const frame = document.getElementById("siteFrame");
  const status = document.getElementById("status");
  const openExternal = document.getElementById("openExternal");
  const faviconEl = getOrCreateFaviconEl();
  let lastStatusBase = "";
  let messagesRefreshEnabled = false;
  let messagesRefreshTimer = null;

  const params = new URLSearchParams(window.location.search);
  const requestedTarget = params.get("target");
  const titleOverride = params.get("title");
  const faviconOverride = normalizeUrl(params.get("favicon"), window.location.origin + "/");
  const allowAutoTitle = !titleOverride;
  const allowAutoFavicon = !faviconOverride;

  const target = normalizeUrl(requestedTarget || DEFAULT_TARGET_URL);
  if (!target) {
    renderStatus("Invalid target URL. Use ?target=https://your-site");
    return;
  }

  if (titleOverride) {
    document.title = titleOverride;
  }
  if (faviconOverride) {
    faviconEl.href = faviconOverride.toString();
  }

  openExternal.href = target.toString();
  frame.src = target.toString();

  if (target.origin === window.location.origin) {
    renderStatus("Embedded target is same-origin. If this loops, use ?target=https://your-real-site");
  } else {
    renderStatus("Embedding: " + target.origin);
  }

  let didLoad = false;
  frame.addEventListener("load", function onLoad() {
    didLoad = true;
    renderStatus("Connected: " + target.origin);
    syncMetaFromFrameDoc(target);
    syncPathFromFrameDoc();
    requestStateFromEmbeddedApp(target);
  });

  window.setTimeout(function checkFrameBlock() {
    if (!didLoad) {
      renderStatus("If you see a blank frame, target may block iframe embedding (X-Frame-Options/CSP).");
    }
  }, 3000);

  window.addEventListener("message", function onMetaMessage(event) {
    if (event.origin !== target.origin || !event.data || typeof event.data !== "object") {
      return;
    }

    if (event.data.type !== "nautilusx:meta" && event.data.type !== "nautilusx:state") {
      return;
    }

    applyMeta(event.data.title, event.data.favicon, target, {
      allowTitle: allowAutoTitle,
      allowFavicon: allowAutoFavicon
    });

    if (typeof event.data.pathname === "string") {
      setMessagesRefreshFromPath(event.data.pathname);
    }
  });

  window.setInterval(function statePing() {
    syncPathFromFrameDoc();
    requestStateFromEmbeddedApp(target);
  }, STATE_PING_MS);

  // Some sites expose HTML over CORS; this helps sync title/favicon when iframe access is cross-origin.
  if (!titleOverride || !faviconOverride) {
    fetchMetaFromTarget(target).then(function onFetchedMeta(meta) {
      if (!meta) {
        return;
      }
      applyMeta(meta.title, meta.favicon, target, {
        allowTitle: allowAutoTitle,
        allowFavicon: allowAutoFavicon
      });
    }).catch(function ignoreFetchErrors() {});
  }

  function getOrCreateFaviconEl() {
    let el = document.querySelector("link[rel='icon']");
    if (!el) {
      el = document.createElement("link");
      el.setAttribute("rel", "icon");
      document.head.appendChild(el);
    }
    return el;
  }

  function applyMeta(nextTitle, nextFavicon, base, options) {
    if (options.allowTitle && nextTitle && typeof nextTitle === "string") {
      const trimmedTitle = nextTitle.trim();
      if (trimmedTitle) {
        document.title = trimmedTitle;
      }
    }

    if (options.allowFavicon && nextFavicon && typeof nextFavicon === "string") {
      const normalizedFavicon = normalizeUrl(nextFavicon, base.toString());
      if (normalizedFavicon) {
        faviconEl.href = normalizedFavicon.toString();
      }
    }
  }

  function renderStatus(baseMessage) {
    lastStatusBase = baseMessage;
    if (messagesRefreshEnabled) {
      status.textContent = baseMessage + " | /messages auto-refresh every 4s";
      return;
    }
    status.textContent = baseMessage;
  }

  function isMessagesPath(pathname) {
    const path = String(pathname || "").toLowerCase();
    return path === "/messages" || path.startsWith("/messages/");
  }

  function setMessagesRefreshFromPath(pathname) {
    const shouldEnable = isMessagesPath(pathname);
    if (shouldEnable === messagesRefreshEnabled) {
      return;
    }

    messagesRefreshEnabled = shouldEnable;
    updateMessagesRefreshTimer();

    if (lastStatusBase) {
      renderStatus(lastStatusBase);
    }
  }

  function updateMessagesRefreshTimer() {
    if (!messagesRefreshEnabled) {
      if (messagesRefreshTimer !== null) {
        window.clearInterval(messagesRefreshTimer);
        messagesRefreshTimer = null;
      }
      return;
    }

    if (messagesRefreshTimer !== null) {
      return;
    }

    messagesRefreshTimer = window.setInterval(() => {
      try {
        if (frame.contentWindow) {
          frame.contentWindow.postMessage({ type: "nautilusx:refresh-if-messages" }, target.origin);
        }
      } catch (_error) {
        // Ignore postMessage failures.
      }

      // Same-origin fallback: force iframe reload while on /messages.
      try {
        if (
          target.origin === window.location.origin &&
          frame.contentWindow &&
          frame.contentWindow.location &&
          isMessagesPath(frame.contentWindow.location.pathname)
        ) {
          frame.contentWindow.location.reload();
        }
      } catch (_error) {
        // Ignore cross-origin access errors.
      }
    }, MESSAGES_REFRESH_MS);
  }

  function syncMetaFromFrameDoc(base) {
    try {
      const doc = frame.contentDocument;
      if (!doc) {
        return;
      }

      const title = doc.title || "";
      let favicon = "";
      const iconLink = doc.querySelector("link[rel~='icon']");
      if (iconLink) {
        favicon = iconLink.getAttribute("href") || "";
      } else {
        favicon = "/favicon.ico";
      }

      applyMeta(title, favicon, base, {
        allowTitle: allowAutoTitle,
        allowFavicon: allowAutoFavicon
      });
    } catch (_error) {
      // Cross-origin iframes are not readable from GitHub Pages.
    }
  }

  function syncPathFromFrameDoc() {
    try {
      if (!frame.contentWindow || !frame.contentWindow.location) {
        return;
      }
      setMessagesRefreshFromPath(frame.contentWindow.location.pathname || "");
    } catch (_error) {
      // Cross-origin iframes are not readable from GitHub Pages.
    }
  }

  function requestStateFromEmbeddedApp(base) {
    try {
      frame.contentWindow.postMessage({ type: "nautilusx:request-state" }, base.origin);
    } catch (_error) {
      // Ignore if target doesn't support postMessage.
    }
  }

  async function fetchMetaFromTarget(base) {
    try {
      const response = await fetch(base.toString(), { method: "GET", mode: "cors" });
      if (!response.ok) {
        return null;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        return null;
      }

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const title = doc.title || "";
      const iconLink = doc.querySelector("link[rel~='icon']");
      const favicon = iconLink ? (iconLink.getAttribute("href") || "") : "/favicon.ico";
      return { title, favicon };
    } catch (_error) {
      return null;
    }
  }

  function normalizeUrl(value, base) {
    if (!value || typeof value !== "string") {
      return null;
    }

    try {
      const url = base ? new URL(value, base) : new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return null;
      }
      return url;
    } catch (_error) {
      return null;
    }
  }
})();
