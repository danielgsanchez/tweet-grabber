// Downloads happen here because this is the only context with access to chrome.downloads.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'download') return;

  chrome.downloads
    .download({ url: msg.url, filename: msg.filename, conflictAction: 'uniquify' })
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true; // the response is sent asynchronously
});
