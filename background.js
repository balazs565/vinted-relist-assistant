// background.js — MV3 service worker: manages alarms, badge, and notifications

// ─── Installation ─────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== 'install') return;

  chrome.storage.local.set({
    vrSettings: {
      minDelayMinutes: 5,
      maxDelayMinutes: 10,
      autofillEnabled: true,
      manualOnlyMode: true
    },
    vrPendingRelists: []
  });

  console.log('[VintedRelist] Installed and ready.');
});

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {

    // Content script asks us to set an alarm for a relist delay
    case 'SET_ALARM': {
      const alarmName = `vr_${msg.id}`;
      const delayInMinutes = msg.delayMs / 60_000;
      chrome.alarms.create(alarmName, { delayInMinutes });
      console.log(`[VintedRelist] Alarm set: ${delayInMinutes.toFixed(1)} min, id=${msg.id}`);
      sendResponse({ ok: true });
      break;
    }

    // Popup or content script cancels a pending alarm
    case 'CANCEL_ALARM':
      chrome.alarms.clear(`vr_${msg.id}`);
      sendResponse({ ok: true });
      break;

    // Refresh the toolbar badge count
    case 'UPDATE_BADGE':
      refreshBadge();
      sendResponse({ ok: true });
      break;

    // Popup asks background to navigate to the sell page in an existing Vinted tab
    case 'OPEN_SELL_PAGE':
      openSellPage().then(() => sendResponse({ ok: true }));
      return true; // keep message channel open for async response

    // Popup asks for latest pending relists (so it can render countdown timers)
    case 'GET_RELISTS':
      getPending().then(relists => sendResponse({ relists }));
      return true;
  }
});

// ─── Alarm handler ────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith('vr_')) return;

  const relistId = alarm.name.slice(3); // strip "vr_" prefix
  console.log(`[VintedRelist] Delay elapsed for relist: ${relistId}`);

  await setRelistStatus(relistId, 'ready_to_repost');
  refreshBadge();
  showReadyNotification(relistId);
});

// ─── Notification interaction ─────────────────────────────────────────────────

chrome.notifications.onClicked.addListener(notificationId => {
  if (!notificationId.startsWith('vr_ready_')) return;
  chrome.notifications.clear(notificationId);
  // Try to open the popup; if it fails (e.g. no user gesture), focus a Vinted tab
  chrome.action.openPopup().catch(() => focusOrOpenVinted());
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getPending() {
  return new Promise(resolve => {
    chrome.storage.local.get('vrPendingRelists', r => resolve(r.vrPendingRelists || []));
  });
}

async function setRelistStatus(id, status) {
  return new Promise(resolve => {
    chrome.storage.local.get('vrPendingRelists', result => {
      const relists = result.vrPendingRelists || [];
      const i = relists.findIndex(r => r.id === id);
      if (i !== -1) {
        relists[i].status = status;
        if (status === 'ready_to_repost') relists[i].readyAt = Date.now();
        chrome.storage.local.set({ vrPendingRelists: relists }, resolve);
      } else {
        resolve();
      }
    });
  });
}

async function refreshBadge() {
  const relists = await getPending();
  const active = relists.filter(r => r.status !== 'completed' && r.status !== 'cancelled');
  const ready  = active.filter(r => r.status === 'ready_to_repost');

  if (active.length === 0) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  chrome.action.setBadgeText({ text: String(active.length) });
  chrome.action.setBadgeBackgroundColor({
    color: ready.length > 0 ? '#28a745' : '#1d7a8c'
  });
}

function showReadyNotification(relistId) {
  chrome.notifications.create(`vr_ready_${relistId}`, {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'Vinted Relist — Ready to repost!',
    message: 'Your safety delay is complete. Open the extension to continue.',
    requireInteraction: true
  });
}

async function openSellPage() {
  // Reuse an existing Vinted tab rather than opening a new one every time
  const tabs = await chrome.tabs.query({});
  const vintedTab = tabs.find(t => t.url && /vinted\.\w+/.test(t.url));

  if (vintedTab) {
    const origin = new URL(vintedTab.url).origin;
    await chrome.tabs.update(vintedTab.id, { url: `${origin}/sell`, active: true });
  } else {
    const stored = await new Promise(r => chrome.storage.local.get('vrSettings', r));
    const domain = stored?.vrSettings?.preferredDomain || 'vinted.ro';
    await chrome.tabs.create({ url: `https://www.${domain}/sell` });
  }
}

async function focusOrOpenVinted() {
  const tabs = await chrome.tabs.query({});
  const vintedTab = tabs.find(t => t.url && /vinted\.\w+/.test(t.url));
  if (vintedTab) {
    await chrome.tabs.update(vintedTab.id, { active: true });
    await chrome.windows.update(vintedTab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: 'https://www.vinted.com' });
  }
}

// Refresh the badge each time the service worker wakes up
refreshBadge();
