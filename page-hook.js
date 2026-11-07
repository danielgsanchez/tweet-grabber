// Runs inside the page itself (world: MAIN) so it can read the responses X receives.
// Video URLs only appear there: on the page, the <video> is a segmented blob: that
// cannot be downloaded.
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
    const media = findMedia(data);
    if (media.length) window.postMessage({ source: 'tg-media', media }, location.origin);
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    response.clone().text().then(harvest).catch(() => {});
    return response;
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      if (this.responseType === '' || this.responseType === 'text') harvest(this.responseText);
    });
    return originalSend.apply(this, args);
  };
})();
