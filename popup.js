const toggle = document.getElementById('enabled');
const status = document.getElementById('status');
const settingsLink = document.getElementById('settings');

chrome.storage.local.get('dobbyEnabled', (data) => {
  const enabled = data.dobbyEnabled !== false; // default: enabled
  toggle.checked = enabled;
  status.textContent = enabled ? 'Enabled' : 'Disabled';
});

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ dobbyEnabled: enabled });
  status.textContent = enabled ? 'Enabled' : 'Disabled';
  // Notify all tabs to update state
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, { type: 'DOBBY_TOGGLE', enabled }).catch(() => {});
    });
  });
});

settingsLink.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
