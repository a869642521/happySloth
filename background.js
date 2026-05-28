chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "VCO_FRAME_VIDEO_CLICK") return false;

  const tabId = sender.tab?.id;
  if (!tabId) {
    sendResponse({ ok: false });
    return true;
  }

  chrome.tabs.sendMessage(
    tabId,
    {
      type: "VCO_PLAY_IN_WEB_OVERLAY",
      payload: {
        videoUrl: message.videoUrl
      }
    },
    { frameId: 0 },
    (response) => {
      sendResponse(response || { ok: false });
    }
  );

  return true;
});
