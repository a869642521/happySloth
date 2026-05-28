const videoUrlInput = document.querySelector("#videoUrl");
const urlLabel = document.querySelector("#urlLabel");
const modeInputs = [...document.querySelectorAll("input[name='mode']")];
const viewportInputs = [...document.querySelectorAll("input[name='viewportMode']")];
const savePlacementInput = document.querySelector("#savePlacement");
const hideOriginalInput = document.querySelector("#hideOriginal");
const pickCardButton = document.querySelector("#pickCard");
const restoreSavedButton = document.querySelector("#restoreSaved");
const removeOverlaysButton = document.querySelector("#removeOverlays");
const message = document.querySelector("#message");

const POPUP_STATE_KEY = "vco:lastPopupState";

initPopup();

async function initPopup() {
  const { [POPUP_STATE_KEY]: state } = await chrome.storage.local.get(POPUP_STATE_KEY);
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
  savePlacementInput.addEventListener("change", persistPopupState);
  hideOriginalInput.addEventListener("change", persistPopupState);
}

pickCardButton.addEventListener("click", async () => {
  const payload = getPayload();
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
  const normalizedMode = mode === "web" ? "web" : "video";
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
  const isWebMode = getSelectedMode() === "web";
  urlLabel.textContent = isWebMode ? "\u7f51\u9875\u94fe\u63a5" : "\u89c6\u9891\u94fe\u63a5";
  videoUrlInput.placeholder = isWebMode
    ? "https://www.bilibili.com"
    : "https://example.com/video.mp4";
  pickCardButton.textContent = isWebMode ? "\u9009\u62e9\u7f51\u9875\u5361\u7247" : "\u9009\u62e9\u5361\u7247";
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
  await chrome.storage.local.set({ [POPUP_STATE_KEY]: getPayload() });
}

async function sendToActiveTab(message) {
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
