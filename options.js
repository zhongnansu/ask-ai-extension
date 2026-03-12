// options.js — Dobby AI settings page

const apiKeyInput = document.getElementById('api-key-input');
const saveBtn = document.getElementById('save-btn');
const removeBtn = document.getElementById('remove-btn');
const keyStatus = document.getElementById('key-status');
const hasKeySection = document.getElementById('has-key');
const noKeySection = document.getElementById('no-key');
const keyDisplay = document.getElementById('key-display');

function maskKey(key) {
  if (!key || key.length < 12) return '••••••••';
  return key.substring(0, 7) + '••••' + key.substring(key.length - 4);
}

function showHasKey(key) {
  hasKeySection.style.display = 'block';
  noKeySection.style.display = 'none';
  keyDisplay.textContent = maskKey(key);
}

function showNoKey() {
  hasKeySection.style.display = 'none';
  noKeySection.style.display = 'block';
  apiKeyInput.value = '';
  keyStatus.textContent = '';
  keyStatus.className = 'status';
}

// Load current state
chrome.storage.local.get(['userApiKey'], (result) => {
  if (result.userApiKey) {
    showHasKey(result.userApiKey);
  } else {
    showNoKey();
  }
});

// Save key
saveBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    keyStatus.textContent = 'Please enter an API key';
    keyStatus.className = 'status error';
    return;
  }

  if (!key.startsWith('sk-')) {
    keyStatus.textContent = 'API key should start with "sk-"';
    keyStatus.className = 'status error';
    return;
  }

  if (key.startsWith('sk-ant-')) {
    keyStatus.textContent = 'Anthropic (Claude) key support coming soon — please use an OpenAI key for now';
    keyStatus.className = 'status error';
    return;
  }

  saveBtn.disabled = true;
  keyStatus.textContent = 'Validating...';
  keyStatus.className = 'status info';

  chrome.runtime.sendMessage({ type: 'VALIDATE_API_KEY', apiKey: key }, (response) => {
    saveBtn.disabled = false;
    if (response && response.valid) {
      keyStatus.textContent = '';
      showHasKey(key);
    } else {
      keyStatus.textContent = response?.error || 'Invalid API key';
      keyStatus.className = 'status error';
    }
  });
});

// Enter key to save
apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveBtn.click();
});

// Remove key
removeBtn.addEventListener('click', () => {
  chrome.storage.local.remove('userApiKey', () => {
    showNoKey();
  });
});

// Provider tab switching
document.querySelectorAll('.provider-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.provider-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.provider-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.provider}`).classList.add('active');
  });
});
