class JSZip {
  constructor() {
    this.entries = [];
  }

  file(path, content) {
    this.entries.push({ path, content: String(content) });
    return this;
  }

  async generateAsync({ type } = { type: 'blob' }) {
    const blob = buildZipBlob(this.entries);
    if (type === 'blob') return blob;
    if (type === 'uint8array') return new Uint8Array(await blob.arrayBuffer());
    throw new Error(`Unsupported output type: ${type}`);
  }
}

const encoder = new TextEncoder();

function sanitizePath(inputPath) {
  return inputPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f);
  return { dosDate, dosTime };
}

function u16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function buildZipBlob(entries) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  const now = dosDateTime(new Date());

  entries.forEach((entry) => {
    const path = sanitizePath(entry.path);
    if (!path) return;

    const nameBytes = encoder.encode(path);
    const dataBytes = encoder.encode(entry.content);
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04,
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(now.dosTime),
      ...u16(now.dosDate),
      ...u32(crc),
      ...u32(dataBytes.length),
      ...u32(dataBytes.length),
      ...u16(nameBytes.length),
      ...u16(0)
    ]);

    localChunks.push(localHeader, nameBytes, dataBytes);

    const centralHeader = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02,
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(now.dosTime),
      ...u16(now.dosDate),
      ...u32(crc),
      ...u32(dataBytes.length),
      ...u32(dataBytes.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset)
    ]);

    centralChunks.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + dataBytes.length;
  });

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const endHeader = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06,
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(centralSize),
    ...u32(offset),
    ...u16(0)
  ]);

  return new Blob([...localChunks, ...centralChunks, endHeader], { type: 'application/zip' });
}

async function createProjectZip(files) {
  const zip = new JSZip();
  files.forEach((file) => {
    const cleanPath = sanitizePath(file.fileName);
    if (cleanPath) {
      zip.file(cleanPath, file.content);
    }
  });
  return zip.generateAsync({ type: 'blob' });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'DOWNLOAD_PROJECT') return false;

  (async () => {
    try {
      const files = Array.isArray(message.files) ? message.files : [];
      if (!files.length) {
        sendResponse({ ok: false, error: 'No files detected.' });
        return;
      }

      const zipBlob = await createProjectZip(files);
      const zipUrl = URL.createObjectURL(zipBlob);
      const filename = `ai-project-${timestamp()}.zip`;

      chrome.downloads.download(
        {
          url: zipUrl,
          filename,
          saveAs: true
        },
        () => {
          URL.revokeObjectURL(zipUrl);
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            sendResponse({ ok: false, error: runtimeError.message });
            return;
          }
          sendResponse({ ok: true, filename });
        }
      );
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();

  return true;
});
