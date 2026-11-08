(() => {
  'use strict';

  const MIN_MEDIA_SIZE = 100; // px: posts with four photos show them small
  const BTN_SIZE = 36;
  const BTN_MARGIN = 10;
  const BTN_GAP = 14;
  const REFRESH_MS = 300;
  const SCROLL_SETTLE_MS = 150;
  // Photos and video thumbnails; avatars, banners and link previews live elsewhere.
  const MEDIA_PATH =
    /^\/(media|ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\//;
  const NON_USER_PATHS = new Set([
    'home', 'explore', 'notifications', 'messages', 'search', 'settings', 'i', 'compose',
  ]);

  // ---------- File name ----------

  let settings = DEFAULT_SETTINGS;
  chrome.storage.local.get(DEFAULT_SETTINGS).then((stored) => {
    settings = stored;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const updated = { ...settings };
    for (const [key, change] of Object.entries(changes)) updated[key] = change.newValue;
    settings = updated;
  });

  const urlPath = (url) => new URL(url, location.href).pathname;
  const lastPathSegment = (url) => urlPath(url).split('/').pop() || '';
  const mediaKey = (url) => urlPath(url).replace(/\.[^./]*$/, '');

  function fileIdFromUrl(url) {
    return lastPathSegment(url).replace(/\.[^.]*$/, '').replace(/[^\w-]/g, '');
  }

  function extensionFromUrl(url, fallback) {
    const ext = lastPathSegment(url).match(/\.([a-z0-9]{2,5})$/i)?.[1];
    return ext ? ext.toLowerCase() : fallback;
  }

  function buildFilename({ username, tweetId, index, count }, url, isVideo) {
    const fileId = fileIdFromUrl(url) || String(Date.now());
    const postId = tweetId && count > 1 ? `${tweetId}_${index}` : tweetId;
    const ext = isVideo ? 'mp4' : extensionFromUrl(url, 'jpg');
    return composeFilename(settings, { username: username || 'x', fileId, postId, isVideo, ext });
  }

  // ---------- Data read from X's responses by page-hook.js ----------

  const mediaByKey = new Map();
  const MAX_REMEMBERED = 3000; // keeps memory flat in long sessions

  addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data?.source === 'tg-media') {
      for (const item of e.data.media) {
        mediaByKey.delete(item.key); // so it counts as the newest
        mediaByKey.set(item.key, item);
      }
      // Maps keep insertion order, so the first keys are the oldest.
      for (const key of mediaByKey.keys()) {
        if (mediaByKey.size <= MAX_REMEMBERED) break;
        mediaByKey.delete(key);
      }
    } else if (e.data?.source === 'tg-link-cleaned') {
      toast('Link copied without tracking');
    }
  });

  // ---------- Finding what's on screen ----------

  function thumbnailOf(el) {
    const url = el.tagName === 'VIDEO' ? el.poster : el.currentSrc || el.src;
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'pbs.twimg.com' && MEDIA_PATH.test(parsed.pathname) ? url : null;
    } catch {
      return null;
    }
  }

  function isMedia(el) {
    if (el.tagName !== 'IMG' && el.tagName !== 'VIDEO') return false;
    const r = el.getBoundingClientRect();
    if (r.width < MIN_MEDIA_SIZE || r.height < MIN_MEDIA_SIZE) return false;
    // GIFs play straight from video.twimg.com and may have no thumbnail.
    return Boolean(thumbnailOf(el) || (el.tagName === 'VIDEO' && el.src.startsWith('https:')));
  }

  function visiblePart(el) {
    const r = el.getBoundingClientRect();
    const left = Math.max(r.left, 0);
    const right = Math.min(r.right, innerWidth);
    const top = Math.max(r.top, 0);
    const bottom = Math.min(r.bottom, innerHeight);
    return right > left && bottom > top ? { left, right, top, bottom } : null;
  }

  // X covers media with transparent layers, so we check everything under the point.
  function mediaAt(x, y) {
    const stack = document
      .elementsFromPoint(x, y)
      .filter((el) => !el.closest('.tg-bar'));

    const media = stack.find(isMedia);
    if (!media) return null;
    // Menus and pop-ups open in #layers, on top of the timeline.
    const layer = stack[0]?.closest?.('#layers');
    if (layer && !layer.contains(media)) return null;
    // While a video loads, its still image sits on top: the video is what counts.
    return stack.find((el) => el.tagName === 'VIDEO' && isMedia(el)) || media;
  }

  // ---------- Downloads ----------

  // Used when X's data for a photo hasn't been seen: the author comes from the post's link.
  function postFromPage(el) {
    const article = el.closest('article');
    const links = article
      ? [...article.querySelectorAll('a[href*="/status/"]')]
      : [];
    const permalink = links.find((link) => link.querySelector('time')) || links[0];
    const path = permalink ? urlPath(permalink.href) : location.pathname;
    const match = path.match(/^\/([^/]+)\/status\/(\d+)/);
    if (match) return { username: match[1], tweetId: match[2], index: 1, count: 1 };
    const user = path.split('/')[1];
    return { username: user && !NON_USER_PATHS.has(user) ? user : null, tweetId: null };
  }

  // Photos are shown resized; name=orig asks for the uploaded original.
  function originalPhotoUrl(url) {
    const parsed = new URL(url);
    const ext = parsed.pathname.match(/\.(\w+)$/)?.[1];
    const format = parsed.searchParams.get('format') || ext || 'jpg';
    parsed.pathname = parsed.pathname.replace(/\.\w+$/, '');
    parsed.search = `?format=${format}&name=orig`;
    return { url: parsed.href, ext: format };
  }

  async function downloadMedia(el) {
    const thumbnail = thumbnailOf(el);
    const item = thumbnail && mediaByKey.get(mediaKey(thumbnail));
    const post = item || postFromPage(el);

    if (item?.videoUrl) {
      await sendDownload(item.videoUrl, buildFilename(post, item.videoUrl, true));
      return;
    }
    if (el.tagName === 'VIDEO' && el.src.startsWith('https:')) {
      await sendDownload(el.src, buildFilename(post, el.src, true));
      return;
    }
    const isPhoto = thumbnail && urlPath(thumbnail).startsWith('/media/');
    if (!isPhoto) throw new Error('No data for this video yet: reload the page and try again');

    const { url, ext } = originalPhotoUrl(item?.imageUrl || thumbnail);
    const filename = buildFilename(post, `${urlPath(url)}.${ext}`, false);
    await sendDownload(url, filename);
  }

  // The link X used to give with "Post video": pasted in a post, it shows only that item.
  // N is the item's position in the post, counting photos and videos alike.
  function mediaLink(el) {
    const thumbnail = thumbnailOf(el);
    const item = thumbnail && mediaByKey.get(mediaKey(thumbnail));
    const isPhoto = thumbnail && urlPath(thumbnail).startsWith('/media/') && el.tagName !== 'VIDEO';

    if (item?.tweetId) {
      const username = item.username || postFromPage(el).username || 'i';
      const kind = isPhoto ? 'photo' : 'video';
      return `https://x.com/${username}/status/${item.tweetId}/${kind}/${item.index}`;
    }
    // Photos link to their own page, which is the same link.
    const photoLink = isPhoto && el.closest('a[href*="/photo/"]');
    if (photoLink) {
      const path = urlPath(photoLink.href).match(/^\/[^/]+\/status\/\d+\/photo\/\d+/)?.[0];
      if (path) return `https://x.com${path}`;
    }
    throw new Error('No data for this post yet: reload the page and try again');
  }

  async function copyMediaLink(el) {
    const link = mediaLink(el);
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      throw new Error('Could not copy the link');
    }
    toast(`Copied ${link}`);
  }

  async function sendDownload(url, filename) {
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: 'download', url, filename });
    } catch {
      throw new Error('The extension was updated: reload the page');
    }
    if (!res?.ok) throw new Error(res?.error || 'Download failed');
    toast(`Downloading ${filename}`);
  }

  let toastTimer;
  function toast(text) {
    let el = document.getElementById('tg-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tg-toast';
      document.documentElement.append(el);
    }
    el.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 3000);
  }

  // ---------- Buttons ----------

  const ICONS = {
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    link:
      '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/>' +
      '<path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  };

  function makeButton(title, icon, action) {
    const btn = document.createElement('button');
    btn.className = 'tg-btn';
    btn.type = 'button';
    btn.title = title;
    btn.innerHTML = `<svg viewBox="0 0 24 24">${icon}</svg>`;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.dataset.busy === 'true') return;
      btn.dataset.busy = 'true';
      try {
        // Looked up now rather than when placing the buttons: the page may have moved.
        const r = btn.getBoundingClientRect();
        const media = mediaAt(r.left + r.width / 2, r.top + r.height / 2);
        if (!media) throw new Error('Could not find the photo or video');
        await action(media);
      } catch (err) {
        toast(err.message);
      } finally {
        btn.dataset.busy = 'false';
      }
    });
    return btn;
  }

  const BAR_WIDTH = BTN_SIZE * 2 + BTN_GAP;
  let bar = null;

  function placeBar(left, top) {
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'tg-bar';
      bar.append(
        makeButton('Download', ICONS.download, downloadMedia),
        makeButton('Copy link to this photo or video', ICONS.link, copyMediaLink),
      );
      document.documentElement.append(bar);
    }
    bar.style.left = `${Math.max(0, Math.min(left, innerWidth - BAR_WIDTH))}px`;
    bar.style.top = `${Math.max(0, Math.min(top, innerHeight - BTN_SIZE))}px`;
    bar.style.display = 'flex';
  }

  let pointer = null;

  function refreshButton() {
    const media = pointer && mediaAt(pointer.x, pointer.y);
    const part = media && visiblePart(media);
    if (part) {
      // Top center: the video controls are at the bottom.
      placeBar((part.left + part.right - BAR_WIDTH) / 2, part.top + BTN_MARGIN);
    } else {
      hideBar();
    }
    // X swaps thumbnails for videos without notice, so while the buttons are shown we
    // also re-check now and then. Otherwise nothing runs until the mouse moves.
    if (part && !watchTimer) watchTimer = setInterval(refreshButton, REFRESH_MS);
    if (!part && watchTimer) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
  }

  let watchTimer = null;

  function hideBar() {
    if (bar) bar.style.display = 'none';
  }

  let framePending = false;
  function scheduleRefresh() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      refreshButton();
    });
  }

  // While scrolling, the buttons are hidden and the page isn't inspected: that would make
  // the browser recalculate the layout on every frame. They come back once it stops.
  let scrollTimer = null;
  function onScroll() {
    hideBar();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      scrollTimer = null;
      scheduleRefresh();
    }, SCROLL_SETTLE_MS);
  }

  document.addEventListener(
    'mousemove',
    (e) => {
      if (pointer && pointer.x === e.clientX && pointer.y === e.clientY) return;
      pointer = { x: e.clientX, y: e.clientY };
      if (!scrollTimer) scheduleRefresh();
    },
    { passive: true },
  );
  document.addEventListener('mouseleave', () => {
    pointer = null;
    scheduleRefresh();
  });
  addEventListener('scroll', onScroll, { passive: true, capture: true });
  addEventListener('resize', scheduleRefresh, { passive: true });
})();
