const downloadBtn = document.getElementById('downloadBtn');
const statusEl = document.getElementById('status');

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#ffb4b4' : '#9db4ff';
}

function sendMessage(tabId, payload) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(response);
    });
  });
}

function runtimeMessage(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, resolve);
  });
}

async function onDownloadClick() {
  downloadBtn.disabled = true;
  setStatus('Scanning current tab...');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found.');

    const extraction = await sendMessage(tab.id, { type: 'EXTRACT_PROJECT_FILES' });
    if (!extraction?.ok) {
      throw new Error(extraction?.error || 'Unable to extract files from this page.');
    }

    if (!extraction.files.length) {
      throw new Error('No file blocks detected. Ensure format is: === path/file.ext ===');
    }

    setStatus(`Detected ${extraction.files.length} file(s). Building ZIP...`);

    const downloadResult = await runtimeMessage({
      type: 'DOWNLOAD_PROJECT',
      files: extraction.files
    });

    if (!downloadResult?.ok) {
      throw new Error(downloadResult?.error || 'Download failed.');
    }

    setStatus(`Downloaded ${downloadResult.filename}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    downloadBtn.disabled = false;
  }
}

downloadBtn.addEventListener('click', onDownloadClick);
