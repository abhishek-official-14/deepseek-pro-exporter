async function loadParser() {
  const parserUrl = chrome.runtime.getURL('utils/parser.js');
  return import(parserUrl);
}

function getVisibleChatText() {
  const candidates = [
    '[data-message-author-role="assistant"]',
    '[data-testid*="conversation"]',
    'main',
    'article',
    '.markdown',
    '.message',
    'body'
  ];

  for (const selector of candidates) {
    const nodes = document.querySelectorAll(selector);
    if (!nodes.length) continue;

    const text = Array.from(nodes)
      .map((node) => node.innerText || '')
      .join('\n\n')
      .trim();

    if (text.length > 0) {
      return text;
    }
  }

  return document.body?.innerText?.trim() || '';
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'EXTRACT_PROJECT_FILES') return false;

  (async () => {
    try {
      const chatText = getVisibleChatText();
      const { extractFiles } = await loadParser();
      const files = extractFiles(chatText);
      sendResponse({ ok: true, files, rawLength: chatText.length });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();

  return true;
});
