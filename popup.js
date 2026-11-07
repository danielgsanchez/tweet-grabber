const SAMPLE = {
  username: 'username',
  fileId: 'GxK3fVbWQAAr1Zq',
  postId: '1987654321098765432',
  isVideo: false,
  ext: 'jpg',
};

const textFields = ['prefix', 'customName', 'suffix'];
const checkFields = ['includeUsername', 'includeType'];
const element = (id) => document.getElementById(id);
const modeRadios = () => [...document.querySelectorAll('input[name="nameMode"]')];

function readForm() {
  const settings = { nameMode: modeRadios().find((radio) => radio.checked)?.value || 'file' };
  for (const id of textFields) settings[id] = element(id).value;
  for (const id of checkFields) settings[id] = element(id).checked;
  return settings;
}

function fillForm(settings) {
  for (const id of textFields) element(id).value = settings[id];
  for (const id of checkFields) element(id).checked = settings[id];
  for (const radio of modeRadios()) radio.checked = radio.value === settings.nameMode;
}

function showPreview(settings) {
  const isCustom = settings.nameMode === 'custom';
  element('customName').disabled = !isCustom;
  element('note').hidden = !isCustom;
  element('preview').textContent = composeFilename(settings, SAMPLE);
}

document.addEventListener('input', () => {
  const settings = readForm();
  showPreview(settings);
  chrome.storage.local.set(settings);
});

element('reset').addEventListener('click', () => {
  fillForm(DEFAULT_SETTINGS);
  showPreview(DEFAULT_SETTINGS);
  chrome.storage.local.set(DEFAULT_SETTINGS);
});

chrome.storage.local.get(DEFAULT_SETTINGS).then((settings) => {
  fillForm(settings);
  showPreview(settings);
});
