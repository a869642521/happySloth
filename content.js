const VCO_STORAGE_PREFIX = "vco:placement:";
const MOBILE_VIEWPORT_WIDTH = 390;
const MOBILE_VIEWPORT_HEIGHT = 720;

let pickerState = null;
let toastTimer = null;
const overlays = new Set();
const isVcoChildFrame = window.top !== window;

if (isVcoChildFrame) {
  installFrameVideoInterceptor();
} else {
  window.addEventListener("scroll", syncAllOverlays, true);
  window.addEventListener("resize", syncAllOverlays);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "VCO_START_PICK") {
      startPicking(message.payload);
      sendResponse({ ok: true, message: "\u9009\u62e9\u6a21\u5f0f\u5df2\u5f00\u542f\uff0c\u70b9\u51fb\u76ee\u6807\u5361\u7247\u5373\u53ef\u653e\u5165\u53e0\u5c42\u3002" });
      return true;
    }

    if (message?.type === "VCO_RESTORE_SAVED") {
      restoreSavedPlacement().then(sendResponse);
      return true;
    }

    if (message?.type === "VCO_REMOVE_ALL") {
      removeAllOverlays();
      sendResponse({ ok: true, message: "\u5df2\u79fb\u9664\u672c\u9875\u53e0\u5c42\u3002" });
      return true;
    }

    if (message?.type === "VCO_PLAY_IN_WEB_OVERLAY") {
      const ok = playVideoInLatestWebOverlay(message.payload?.videoUrl);
      sendResponse({
        ok,
        message: ok
          ? "\u5df2\u5728\u5f53\u524d\u5361\u7247\u5185\u64ad\u653e\u89c6\u9891\u3002"
          : "\u6ca1\u6709\u627e\u5230\u53ef\u66ff\u6362\u7684\u7f51\u9875\u5361\u7247\u3002"
      });
      return true;
    }

    return false;
  });

  restoreSavedPlacement({ silent: true });
}

function startPicking(payload) {
  stopPicking();

  const ring = document.createElement("div");
  ring.className = "vco-hover-ring";
  ring.hidden = true;
  document.documentElement.append(ring);

  pickerState = {
    payload,
    ring,
    current: null,
    onPointerMove: (event) => updateHoverTarget(event),
    onClick: (event) => pickHoveredTarget(event),
    onKeyDown: (event) => {
      if (event.key === "Escape") {
        stopPicking();
        showToast("已退出选择模式。");
      }
    }
  };

  document.addEventListener("pointermove", pickerState.onPointerMove, true);
  document.addEventListener("click", pickerState.onClick, true);
  document.addEventListener("keydown", pickerState.onKeyDown, true);
  showToast("移动到卡片上并点击确认，按 Esc 取消。");
}

function stopPicking() {
  if (!pickerState) return;

  document.removeEventListener("pointermove", pickerState.onPointerMove, true);
  document.removeEventListener("click", pickerState.onClick, true);
  document.removeEventListener("keydown", pickerState.onKeyDown, true);
  pickerState.ring.remove();
  pickerState = null;
}

function updateHoverTarget(event) {
  if (!pickerState) return;

  const target = findCardCandidate(event.target);
  pickerState.current = target;

  if (!target) {
    pickerState.ring.hidden = true;
    return;
  }

  const rect = target.getBoundingClientRect();
  const style = getComputedStyle(target);
  pickerState.ring.hidden = false;
  pickerState.ring.style.left = `${rect.left + window.scrollX}px`;
  pickerState.ring.style.top = `${rect.top + window.scrollY}px`;
  pickerState.ring.style.width = `${rect.width}px`;
  pickerState.ring.style.height = `${rect.height}px`;
  pickerState.ring.style.borderRadius = style.borderRadius;
}

function pickHoveredTarget(event) {
  if (!pickerState?.current) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const target = pickerState.current;
  const payload = pickerState.payload;
  stopPicking();
  placeVideo(target, payload);

  if (payload.savePlacement) {
    savePlacement(target, payload);
  }

  showToast(payload.mode === "web" ? "网页已放入目标卡片。" : "视频已放入目标卡片。");
}

function installFrameVideoInterceptor() {
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest("a[href]");
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href) return;

      const url = normalizeFrameHref(href);
      if (!isEmbeddableVideoClickUrl(url)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      chrome.runtime.sendMessage({
        type: "VCO_FRAME_VIDEO_CLICK",
        videoUrl: url
      });
    },
    true
  );
}

function normalizeFrameHref(href) {
  try {
    return normalizeVideoUrl(new URL(href, location.href).href);
  } catch {
    return normalizeVideoUrl(href);
  }
}

function isEmbeddableVideoClickUrl(url) {
  if (!url) return false;
  if (isDirectVideoUrl(url)) return true;

  try {
    const parsed = new URL(normalizeVideoUrl(url));
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname;

    if (host === "player.bilibili.com") return true;
    if ((host === "bilibili.com" || host === "m.bilibili.com") && /\/video\/(BV[a-zA-Z0-9]+|av\d+)/i.test(path)) {
      return true;
    }
    if (host === "youtu.be") return Boolean(path.split("/").filter(Boolean)[0]);
    if (host === "youtube.com" || host === "m.youtube.com") {
      return parsed.searchParams.has("v") || path.startsWith("/shorts/") || path.startsWith("/embed/");
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") return /\d+/.test(path);
  } catch {
    return false;
  }

  return false;
}

function findCardCandidate(start) {
  if (!(start instanceof Element)) return null;

  let node = start;
  const viewportArea = window.innerWidth * window.innerHeight;

  while (node && node !== document.body && node !== document.documentElement) {
    if (node.closest?.(".vco-player, .vco-hover-ring, .vco-toast")) return null;

    const rect = node.getBoundingClientRect();
    const area = rect.width * rect.height;
    const isVisible = rect.width >= 80 && rect.height >= 80;
    const isReasonableSize = area > 7000 && area < viewportArea * 0.85;
    const style = getComputedStyle(node);
    const hasVisualShape =
      style.backgroundImage !== "none" ||
      style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
      node.matches("img, video, picture, canvas, [role='img'], a, article");

    if (isVisible && isReasonableSize && hasVisualShape) return node;
    node = node.parentElement;
  }

  return start.closest("a, article, [role='listitem'], [data-test-id], [class*='card'], [class*='pin']");
}

function placeVideo(target, payload) {
  payload = {
    ...payload,
    mode: payload.mode === "web" ? "web" : "video",
    viewportMode: payload.viewportMode === "mobile" ? "mobile" : "auto",
    videoUrl: normalizeVideoUrl(payload.videoUrl)
  };

  const previous = [...overlays].find((entry) => entry.target === target);
  if (previous) removeOverlay(previous);

  const wrapper = document.createElement("div");
  wrapper.className = "vco-player";
  wrapper.dataset.vcoMode = payload.mode;
  wrapper.dataset.vcoUrl = payload.videoUrl;

  const closeButton = document.createElement("button");
  closeButton.className = "vco-remove";
  closeButton.type = "button";
  closeButton.textContent = "x";
  closeButton.title = "移除叠层";

  const media = payload.mode === "web"
    ? createWebsiteElement(payload.videoUrl, payload.viewportMode)
    : createMediaElement(payload.videoUrl);
  wrapper.append(closeButton, media);
  document.documentElement.append(wrapper);

  if (payload.hideOriginal) {
    target.classList.add("vco-hidden-original");
  }

  const entry = {
    target,
    wrapper,
    mode: payload.mode,
    videoUrl: payload.videoUrl,
    viewportMode: payload.viewportMode,
    hiddenOriginal: payload.hideOriginal,
    resizeObserver: new ResizeObserver(() => syncOverlay(entry)),
    intervalId: window.setInterval(() => syncOverlay(entry), 250)
  };

  closeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    removeOverlay(entry);
  });

  entry.resizeObserver.observe(target);
  overlays.add(entry);
  syncOverlay(entry);
}

function playVideoInLatestWebOverlay(videoUrl) {
  videoUrl = normalizeVideoUrl(videoUrl);
  if (!isEmbeddableVideoClickUrl(videoUrl)) return false;

  const entry = [...overlays]
    .reverse()
    .find((overlay) => overlay.mode === "web" || overlay.wrapper.dataset.vcoMode === "web");

  if (!entry) return false;

  const closeButton = entry.wrapper.querySelector(".vco-remove");
  if (!closeButton) return false;

  const media = createMediaElement(videoUrl);
  entry.wrapper.replaceChildren(closeButton, media);
  entry.mode = "video";
  entry.videoUrl = videoUrl;
  entry.wrapper.dataset.vcoMode = "video";
  entry.wrapper.dataset.vcoUrl = videoUrl;
  syncOverlay(entry);
  showToast("\u5df2\u5728\u5f53\u524d\u5361\u7247\u5185\u64ad\u653e\u89c6\u9891\u3002");
  return true;
}

function createMediaElement(url) {
  url = normalizeVideoUrl(url);
  if (isRestrictedEmbedHost(url)) {
    return createRestrictedEmbedElement(url);
  }

  const embedUrl = toEmbedUrl(url);

  if (isDirectVideoUrl(url)) {
    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.loop = false;
    return video;
  }

  const iframe = document.createElement("iframe");
  iframe.src = embedUrl;
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  return iframe;
}

function createWebsiteElement(url, viewportMode = "auto") {
  if (viewportMode === "mobile") {
    url = toMobileWebsiteUrl(url);
  }

  const container = document.createElement("div");
  container.className = viewportMode === "mobile" ? "vco-web vco-web-mobile" : "vco-web";

  const toolbar = document.createElement("div");
  toolbar.className = "vco-web-toolbar";

  const label = document.createElement("span");
  label.textContent = getReadableHost(url);

  const openLink = document.createElement("a");
  openLink.href = url;
  openLink.target = "_blank";
  openLink.rel = "noreferrer";
  openLink.textContent = "打开";

  toolbar.append(label, openLink);

  const iframe = document.createElement("iframe");
  iframe.className = "vco-web-frame";
  iframe.src = url;
  if (viewportMode === "mobile") {
    iframe.dataset.vcoMobileFrame = "true";
    iframe.width = String(MOBILE_VIEWPORT_WIDTH);
    iframe.height = String(MOBILE_VIEWPORT_HEIGHT);
  }
  iframe.allow = "autoplay; fullscreen; clipboard-read; clipboard-write; encrypted-media; picture-in-picture";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";

  const hint = document.createElement("div");
  hint.className = "vco-web-hint";
  hint.textContent = "如果网站禁止嵌入，请点击“打开”。";

  const hintTimer = window.setTimeout(() => {
    hint.hidden = false;
  }, 2200);

  iframe.addEventListener("load", () => {
    window.clearTimeout(hintTimer);
    hint.hidden = true;
  });

  hint.hidden = true;
  container.append(iframe, toolbar, hint);
  window.requestAnimationFrame(() => fitMobileFrames(container));
  return container;
}

function toMobileWebsiteUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "bilibili.com") {
      parsed.hostname = "m.bilibili.com";
      return parsed.toString();
    }

    if (host === "youtube.com") {
      parsed.hostname = "m.youtube.com";
      return parsed.toString();
    }

    if (host === "twitter.com") {
      parsed.hostname = "mobile.twitter.com";
      return parsed.toString();
    }
  } catch {
    return url;
  }

  return url;
}

function getReadableHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "网页";
  }
}

function isRestrictedEmbedHost(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return [
      "douyin.com",
      "iesdouyin.com",
      "snssdk.com",
      "amemv.com"
    ].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function createRestrictedEmbedElement(url) {
  const panel = document.createElement("div");
  panel.className = "vco-restricted";

  const title = document.createElement("strong");
  title.textContent = "此平台限制嵌入播放";

  const body = document.createElement("span");
  body.textContent = "请打开原链接，或使用可直接访问的 mp4/webm 视频直链。";

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "打开原链接";

  panel.append(title, body, link);
  return panel;
}

function normalizeVideoUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function isDirectVideoUrl(url) {
  try {
    const parsed = new URL(url);
    return /\.(mp4|webm|ogg|ogv|mov)(\?.*)?$/i.test(parsed.pathname + parsed.search);
  } catch {
    return false;
  }
}

function toEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "player.bilibili.com") {
      parsed.searchParams.set("isOutside", "true");
      if (!parsed.searchParams.has("autoplay")) parsed.searchParams.set("autoplay", "1");
      return parsed.toString();
    }

    if (host === "bilibili.com" || host === "m.bilibili.com") {
      const embedUrl = toBilibiliEmbedUrl(parsed);
      if (embedUrl) return embedUrl;
    }

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1`;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      let id = parsed.searchParams.get("v");
      if (!id && parsed.pathname.startsWith("/shorts/")) {
        id = parsed.pathname.split("/").filter(Boolean)[1];
      }
      if (!id && parsed.pathname.startsWith("/embed/")) {
        id = parsed.pathname.split("/").filter(Boolean)[1];
      }
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1`;
    }

    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = parsed.pathname.split("/").filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${id}?autoplay=1&muted=1`;
    }
  } catch {
    return url;
  }

  return url;
}

function toBilibiliEmbedUrl(parsed) {
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  const videoIndex = pathParts.indexOf("video");
  const videoId = videoIndex >= 0 ? pathParts[videoIndex + 1] : "";
  const page = parsed.searchParams.get("p") || "1";

  if (/^BV[a-zA-Z0-9]+$/.test(videoId)) {
    const embed = new URL("https://player.bilibili.com/player.html");
    embed.searchParams.set("isOutside", "true");
    embed.searchParams.set("bvid", videoId);
    embed.searchParams.set("p", page);
    embed.searchParams.set("autoplay", "1");
    return embed.toString();
  }

  const aidMatch = videoId.match(/^av(\d+)$/i);
  if (aidMatch) {
    const embed = new URL("https://player.bilibili.com/player.html");
    embed.searchParams.set("isOutside", "true");
    embed.searchParams.set("aid", aidMatch[1]);
    embed.searchParams.set("p", page);
    embed.searchParams.set("autoplay", "1");
    return embed.toString();
  }

  return "";
}

function syncOverlay(entry) {
  if (!document.documentElement.contains(entry.target)) {
    removeOverlay(entry);
    return;
  }

  const rect = entry.target.getBoundingClientRect();
  const style = getComputedStyle(entry.target);

  entry.wrapper.style.left = `${rect.left + window.scrollX}px`;
  entry.wrapper.style.top = `${rect.top + window.scrollY}px`;
  entry.wrapper.style.width = `${rect.width}px`;
  entry.wrapper.style.height = `${rect.height}px`;
  entry.wrapper.style.borderRadius = style.borderRadius;
  fitMobileFrames(entry.wrapper);
}

function removeOverlay(entry) {
  entry.resizeObserver?.disconnect();
  window.clearInterval(entry.intervalId);
  entry.wrapper.remove();
  if (entry.hiddenOriginal) entry.target.classList.remove("vco-hidden-original");
  overlays.delete(entry);
}

function removeAllOverlays() {
  [...overlays].forEach(removeOverlay);
}

function syncAllOverlays() {
  overlays.forEach(syncOverlay);
  fitMobileFrames(document);
}

function fitMobileFrames(root) {
  root.querySelectorAll?.("[data-vco-mobile-frame='true']").forEach((frame) => {
    const container = frame.closest(".vco-web-mobile");
    if (!container) return;

    const scale = Math.min(1, container.clientWidth / MOBILE_VIEWPORT_WIDTH);

    frame.style.width = `${MOBILE_VIEWPORT_WIDTH}px`;
    frame.style.height = `${MOBILE_VIEWPORT_HEIGHT}px`;
    frame.style.transform = `scale(${Math.max(0.1, scale)})`;
    frame.style.marginBottom = `${MOBILE_VIEWPORT_HEIGHT * (scale - 1)}px`;
  });
}

async function savePlacement(target, payload) {
  const record = {
    mode: payload.mode === "web" ? "web" : "video",
    viewportMode: payload.viewportMode === "mobile" ? "mobile" : "auto",
    videoUrl: payload.videoUrl,
    hideOriginal: payload.hideOriginal,
    selector: getStableSelector(target),
    savedAt: Date.now()
  };

  await chrome.storage.local.set({ [getPlacementKey()]: record });
}

async function restoreSavedPlacement(options = {}) {
  const { [getPlacementKey()]: record } = await chrome.storage.local.get(getPlacementKey());
  if (!record?.selector || !record?.videoUrl) {
    if (!options.silent) return { ok: false, message: "当前页面还没有保存过位置。" };
    return { ok: false };
  }

  const target = document.querySelector(record.selector);
  if (!target) {
    if (!options.silent) return { ok: false, message: "找不到保存的卡片，页面结构可能已经变化。" };
    return { ok: false };
  }

  placeVideo(target, {
    mode: record.mode || "video",
    viewportMode: record.viewportMode || "auto",
    videoUrl: record.videoUrl,
    hideOriginal: record.hideOriginal,
    savePlacement: false
  });

  if (!options.silent) return { ok: true, message: "已恢复保存的位置。" };
  return { ok: true };
}

function getPlacementKey() {
  return `${VCO_STORAGE_PREFIX}${location.origin}${location.pathname}`;
}

function getStableSelector(element) {
  if (element.id && !/^\d/.test(element.id)) {
    return `#${CSS.escape(element.id)}`;
  }

  const segments = [];
  let node = element;
  while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.body) {
    let segment = node.localName.toLowerCase();

    const testIdAttribute = node.hasAttribute("data-testid") ? "data-testid" : "data-test-id";
    const testId = node.getAttribute(testIdAttribute);
    if (testId) {
      segment += `[${testIdAttribute}="${CSS.escape(testId)}"]`;
      segments.unshift(segment);
      break;
    }

    const className = [...node.classList]
      .filter((name) => !name.startsWith("vco-") && name.length < 40)
      .slice(0, 2)
      .map((name) => `.${CSS.escape(name)}`)
      .join("");
    segment += className;

    const parent = node.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter((child) => child.localName === node.localName);
      if (siblings.length > 1) {
        segment += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
    }

    segments.unshift(segment);
    node = parent;
  }

  return segments.join(" > ");
}

function showToast(text) {
  let toast = document.querySelector(".vco-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "vco-toast";
    document.documentElement.append(toast);
  }

  toast.textContent = text;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.remove(), 2800);
}
