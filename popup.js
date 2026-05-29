const videoUrlInput = document.querySelector("#videoUrl");
const urlLabel = document.querySelector("#urlLabel");
const modeInputs = [...document.querySelectorAll("input[name='mode']")];
const viewportInputs = [...document.querySelectorAll("input[name='viewportMode']")];
const viewportControl = document.querySelector(".viewport-control");
const castGuide = document.querySelector("#castGuide");
const useCastExampleButton = document.querySelector("#useCastExample");
const checkCastServiceButton = document.querySelector("#checkCastService");
const savePlacementInput = document.querySelector("#savePlacement");
const hideOriginalInput = document.querySelector("#hideOriginal");
const pickCardButton = document.querySelector("#pickCard");
const restoreSavedButton = document.querySelector("#restoreSaved");
const removeOverlaysButton = document.querySelector("#removeOverlays");
const message = document.querySelector("#message");

const POPUP_STATE_KEY = "vco:lastPopupState";
const hasChromeStorage = typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
const hasChromeTabs = typeof chrome !== "undefined" && Boolean(chrome.tabs?.query);

initPopup();

async function initPopup() {
  const { [POPUP_STATE_KEY]: state } = await storageGet(POPUP_STATE_KEY);
  if (state?.videoUrl) videoUrlInput.value = state.videoUrl;
  if (state?.mode) setSelectedMode(state.mode);
  if (state?.viewportMode) setSelectedViewportMode(state.viewportMode);
  if (typeof state?.savePlacement === "boolean") {
    savePlacementInput.checked = state.savePlacement;
  }
  if (typeof state?.hideOriginal === "boolean") {
    hideOriginalInput.checked = state.hideOriginal;
  }

  updateModeText();
  videoUrlInput.addEventListener("input", persistPopupState);
  modeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      updateModeText();
      persistPopupState();
    });
  });
  viewportInputs.forEach((input) => {
    input.addEventListener("change", persistPopupState);
  });
  useCastExampleButton.addEventListener("click", useCastExample);
  checkCastServiceButton.addEventListener("click", checkCastService);
  savePlacementInput.addEventListener("change", persistPopupState);
  hideOriginalInput.addEventListener("change", persistPopupState);
}

pickCardButton.addEventListener("click", async () => {
  const payload = getPayload();
  if (payload.mode === "cast") {
    payload.videoUrl = ensureCastControlUrl(payload.videoUrl);
    videoUrlInput.value = payload.videoUrl;
  }

  if (!payload.videoUrl) {
    setMessage("\u8bf7\u5148\u7c98\u8d34\u4e00\u4e2a\u94fe\u63a5\u3002");
    videoUrlInput.focus();
    return;
  }

  await persistPopupState();
  const response = await sendToActiveTab({ type: "VCO_START_PICK", payload });
  setMessage(response?.message || "\u79fb\u52a8\u5230\u5361\u7247\u4e0a\uff0c\u7136\u540e\u70b9\u51fb\u786e\u8ba4\u3002");
});

restoreSavedButton.addEventListener("click", async () => {
  const response = await sendToActiveTab({ type: "VCO_RESTORE_SAVED" });
  setMessage(response?.message || "\u5df2\u5c1d\u8bd5\u6062\u590d\u4fdd\u5b58\u7684\u4f4d\u7f6e\u3002");
});

removeOverlaysButton.addEventListener("click", async () => {
  const response = await sendToActiveTab({ type: "VCO_REMOVE_ALL" });
  setMessage(response?.message || "\u5df2\u79fb\u9664\u672c\u9875\u53e0\u5c42\u3002");
});

function getPayload() {
  return {
    mode: getSelectedMode(),
    viewportMode: getSelectedViewportMode(),
    videoUrl: normalizeUrl(videoUrlInput.value),
    savePlacement: savePlacementInput.checked,
    hideOriginal: hideOriginalInput.checked
  };
}

function getSelectedMode() {
  return document.querySelector("input[name='mode']:checked")?.value || "video";
}

function setSelectedMode(mode) {
  const normalizedMode = ["video", "web", "cast"].includes(mode) ? mode : "video";
  modeInputs.forEach((input) => {
    input.checked = input.value === normalizedMode;
  });
}

function getSelectedViewportMode() {
  return document.querySelector("input[name='viewportMode']:checked")?.value || "auto";
}

function setSelectedViewportMode(mode) {
  const normalizedMode = mode === "mobile" ? "mobile" : "auto";
  viewportInputs.forEach((input) => {
    input.checked = input.value === normalizedMode;
  });
}

function updateModeText() {
  const mode = getSelectedMode();
  const copyByMode = {
    video: {
      label: "\u89c6\u9891\u94fe\u63a5",
      placeholder: "https://example.com/video.mp4",
      button: "\u9009\u62e9\u5361\u7247"
    },
    web: {
      label: "\u7f51\u9875\u94fe\u63a5",
      placeholder: "https://www.bilibili.com",
      button: "\u9009\u62e9\u7f51\u9875\u5361\u7247"
    },
    cast: {
      label: "\u6295\u5c4f\u5730\u5740",
      placeholder: "http://\u624b\u673aIP:8080/stream.mjpeg#control=http://localhost:4174",
      button: "\u9009\u62e9\u6295\u5c4f\u5361\u7247"
    }
  };
  const copy = copyByMode[mode] || copyByMode.video;
  urlLabel.textContent = copy.label;
  videoUrlInput.placeholder = copy.placeholder;
  pickCardButton.textContent = copy.button;
  viewportControl.hidden = mode !== "web";
  castGuide.hidden = mode !== "cast";
  if (mode === "cast") {
    setMessage("\u5148\u542f\u52a8\u624b\u673a HTTP \u6295\u5c4f\u548c node adb-control-server.mjs\u3002");
  } else if (message.textContent.includes("ADB") || message.textContent.includes("\u6295\u5c4f")) {
    setMessage("");
  }
}

function normalizeUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

async function persistPopupState() {
  await storageSet({ [POPUP_STATE_KEY]: getPayload() });
}

function useCastExample() {
  videoUrlInput.value = "http://192.168.1.100:8080/stream.mjpeg#control=http://localhost:4174";
  setMessage("\u628a 192.168.1.100 \u6539\u6210\u624b\u673a\u6295\u5c4f App \u663e\u793a\u7684 IP\u3002");
  persistPopupState();
}

async function checkCastService() {
  setMessage("\u6b63\u5728\u68c0\u67e5 ADB \u63a7\u5236\u670d\u52a1...");
  try {
    const response = await fetch("http://localhost:4174/health", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setMessage(payload.error || "\u63a7\u5236\u670d\u52a1\u672a\u5c31\u7eea\uff0c\u8bf7\u786e\u8ba4 ADB \u548c\u624b\u673a\u6388\u6743\u3002");
      return;
    }

    const size = payload.deviceSize ? `${payload.deviceSize.width}x${payload.deviceSize.height}` : "\u5df2\u8fde\u63a5";
    setMessage(`ADB \u63a7\u5236\u670d\u52a1\u6b63\u5e38\uff1a${size}`);
  } catch {
    setMessage("\u8bf7\u5148\u5728\u9879\u76ee\u76ee\u5f55\u8fd0\u884c node adb-control-server.mjs\u3002");
  }
}

function ensureCastControlUrl(url) {
  if (!url || /(^|[#&?])control=/i.test(url)) return url;

  try {
    const parsed = new URL(url);
    const hash = parsed.hash ? `${parsed.hash.replace(/^#/, "")}&` : "";
    parsed.hash = `${hash}control=http://localhost:4174`;
    return parsed.toString();
  } catch {
    return url;
  }
}

async function sendToActiveTab(message) {
  if (!hasChromeTabs) {
    return {
      ok: false,
      message: "\u672c\u5730\u9884\u89c8\u4e0d\u80fd\u9009\u62e9\u5361\u7247\uff0c\u8bf7\u5728 Chrome \u6269\u5c55\u91cc\u4f7f\u7528\u3002"
    };
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, message: "\u6ca1\u6709\u627e\u5230\u5f53\u524d\u6807\u7b7e\u9875\u3002" };

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      return {
        ok: false,
        message: "\u5f53\u524d\u9875\u9762\u4e0d\u80fd\u88ab\u6269\u5c55\u4fee\u6539\u3002"
      };
    }
  }
}

function setMessage(text) {
  message.textContent = text;
}

async function storageGet(key) {
  if (hasChromeStorage) return chrome.storage.local.get(key);

  try {
    return { [key]: JSON.parse(localStorage.getItem(key) || "null") };
  } catch {
    return { [key]: null };
  }
}

async function storageSet(values) {
  if (hasChromeStorage) {
    await chrome.storage.local.set(values);
    return;
  }

  Object.entries(values).forEach(([key, value]) => {
    localStorage.setItem(key, JSON.stringify(value));
  });
}
