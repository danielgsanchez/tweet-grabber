// Runs inside the page itself (world: MAIN) so it can read the responses X receives.
// Video URLs only appear there: on the page, the <video> is a segmented blob: that
// cannot be downloaded. It also removes the tracking X adds to the links it copies.
(() => {
  'use strict';

  // Photos and video thumbnails are recognized by their path without the extension,
  // which is the same in the API data and in the page's <img> and <video poster>.
  const mediaKey = (url) => new URL(url).pathname.replace(/\.[^./]*$/, '');

  function bestMp4(media) {
    let best = null;
    for (const variant of media.video_info?.variants || []) {
      if (variant.content_type !== 'video/mp4') continue;
      if (!best || (variant.bitrate ?? 0) > (best.bitrate ?? 0)) best = variant;
    }
    return best?.url || null;
  }

  function usernameOf(tweet) {
    const user = tweet.core?.user_results?.result;
    return user?.core?.screen_name || user?.legacy?.screen_name || tweet.user?.screen_name || null;
  }

  function addTweet(tweet, legacy, found) {
    const media = legacy.extended_entities?.media;
    if (!Array.isArray(media)) return;
    const tweetId = String(tweet.rest_id ?? legacy.id_str ?? '');
    const username = usernameOf(tweet);
    media.forEach((item, index) => {
      if (!item?.media_url_https) return;
      found.push({
        key: mediaKey(item.media_url_https),
        tweetId,
        username,
        index: index + 1,
        count: media.length,
        imageUrl: item.media_url_https,
        videoUrl: item.type === 'photo' ? null : bestMp4(item),
      });
    });
  }

  function findMedia(node, found = []) {
    if (!node || typeof node !== 'object') return found;
    if (Array.isArray(node)) {
      for (const child of node) findMedia(child, found);
      return found;
    }
    // GraphQL tweets keep their content in "legacy"; older APIs have it at the top, next
    // to "user". Retweets repeat the original's media under the retweeter's name, so they
    // are skipped: the original, nested inside, is found further down.
    let legacy = null;
    if (node.legacy?.extended_entities) legacy = node.legacy;
    else if (node.extended_entities && node.user) legacy = node;
    if (legacy && !legacy.retweeted_status_result && !legacy.retweeted_status) {
      addTweet(node, legacy, found);
    }
    for (const key in node) findMedia(node[key], found);
    return found;
  }

  function harvest(text) {
    if (typeof text !== 'string' || !text.includes('"extended_entities"')) return;
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }
    harvestData(data);
  }

  // ---------- Links without tracking ----------

  // X adds ?s= (the device) and a= or t= (who shared it) to the post links it copies.
  const TRACKING_PARAMS = ['s', 't', 'a'];
  const X_LINK = /https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[^\s"'<>]+/g;

  function cleanLinks(text) {
    if (typeof text !== 'string') return text;
    let cleaned = false;
    const result = text.replace(X_LINK, (link) => {
      let url;
      try {
        url = new URL(link);
      } catch {
        return link;
      }
      if (!/\/status\/\d+/.test(url.pathname)) return link;
      const before = url.href;
      for (const param of TRACKING_PARAMS) url.searchParams.delete(param);
      if (url.href === before) return link;
      cleaned = true;
      return url.href;
    });
    if (cleaned) window.postMessage({ source: 'tg-link-cleaned' }, location.origin);
    return result;
  }

  // The share menu's "Copy link" selects the link on the page and copies the selection.
  addEventListener(
    'copy',
    (e) => {
      const selected = String(getSelection());
      const cleaned = cleanLinks(selected);
      if (cleaned === selected || !e.clipboardData) return;
      e.clipboardData.setData('text/plain', cleaned);
      e.preventDefault();
    },
    true,
  );

  // Other ways of copying it, in case X changes how it does it.
  const originalSetData = DataTransfer.prototype.setData;
  DataTransfer.prototype.setData = function (format, data) {
    return originalSetData.call(this, format, cleanLinks(data));
  };
  if (window.Clipboard?.prototype.writeText) {
    const originalWriteText = Clipboard.prototype.writeText;
    Clipboard.prototype.writeText = function (text) {
      return originalWriteText.call(this, cleanLinks(text));
    };
  }

  // ---------- Reading X's responses ----------

  // Only X's API carries post data. Everything else, video segments included, is left
  // alone so it isn't copied and decoded for nothing.
  const isApiUrl = (url) => /\/i\/api\/|\/graphql\//.test(url);

  function harvestData(data) {
    const media = findMedia(data);
    if (media.length) window.postMessage({ source: 'tg-media', media }, location.origin);
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const type = response.headers.get('content-type') || '';
    if (isApiUrl(response.url) && type.includes('json')) {
      response.clone().text().then(harvest).catch(() => {});
    }
    return response;
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      if (!isApiUrl(this.responseURL)) return;
      if (this.responseType === '' || this.responseType === 'text') harvest(this.responseText);
      else if (this.responseType === 'json') harvestData(this.response);
    });
    return originalSend.apply(this, args);
  };
})();
