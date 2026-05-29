chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "VCO_CAST_CONTROL") {
    fetch(message.url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(message.payload || {})
    })
      .then((response) => {
        sendResponse({ ok: response.ok, status: response.status });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (!["VCO_FRAME_VIDEO_CLICK", "VCO_FRAME_LOCATION_UPDATE"].includes(message?.type)) return false;

  const tabId = sender.tab?.id;
  if (!tabId) {
    sendResponse({ ok: false });
    return true;
  }

  chrome.tabs.sendMessage(
    tabId,
    {
      type: message.type === "VCO_FRAME_VIDEO_CLICK"
        ? "VCO_PLAY_IN_WEB_OVERLAY"
        : "VCO_FRAME_LOCATION_UPDATE",
      payload: {
        videoUrl: message.videoUrl,
        url: message.url
      }
    },
    { frameId: 0 },
    (response) => {
      sendResponse(response || { ok: false });
    }
  );

  return true;
});
