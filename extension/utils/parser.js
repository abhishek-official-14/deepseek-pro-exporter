const FILE_BLOCK_REGEX = /=== (.*?) ===\n([\s\S]*?)(?=\n===|$)/g;

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, '\n');
}

function cleanFileName(name) {
  return name
    .trim()
    .replace(/^['"`]|['"`]$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\s+/g, ' ');
}

function cleanContent(content) {
  return content.replace(/^\n+/, '').replace(/\n+$/, '');
}

export function extractFiles(rawText) {
  const text = normalizeLineEndings(rawText || '');
  const files = [];
  const seen = new Set();

  let match;
  while ((match = FILE_BLOCK_REGEX.exec(text)) !== null) {
    const fileName = cleanFileName(match[1]);
    const content = cleanContent(match[2]);

    if (!fileName || !content) continue;

    const key = `${fileName}::${content.length}`;
    if (seen.has(key)) continue;
    seen.add(key);

    files.push({ fileName, content });
  }

  return files;
}
