// Shared by the content script and the popup, so the preview always matches the real result.

const DEFAULT_SETTINGS = {
  prefix: '',
  includeUsername: true,
  includeType: true,
  nameMode: 'file', // 'file' | 'post' | 'custom'
  customName: '',
  suffix: '',
};

// Removes characters Windows and Chrome reject in file names.
function cleanFileStem(text) {
  return text
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 200)
    .trim();
}

// fileId is the file's name on X's servers; postId is the post's number, followed by
// the item's position when the post has several photos or videos.
function composeFilename(settings, { username, fileId, postId, isVideo, ext }) {
  let name = fileId;
  if (settings.nameMode === 'post') name = postId || fileId;
  if (settings.nameMode === 'custom') name = settings.customName;

  const user = settings.includeUsername ? `${username}_` : '';
  const type = settings.includeType ? (isVideo ? 'VID' : 'IMG') : '';
  const stem = cleanFileStem(`${settings.prefix}${user}${type}${name}${settings.suffix}`);

  return `${stem || cleanFileStem(fileId) || 'x'}.${ext}`;
}
