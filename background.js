// Toggle timer visibility when the toolbar icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_TIMER' });
  } catch (e) {
    // Content script might not be injected yet (e.g., chrome:// pages)
    console.log('Could not toggle timer on this page:', e.message);
  }
});
