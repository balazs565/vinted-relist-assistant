// popup.js — Popup UI logic: renders pending relists, countdowns, and settings

// ─── Tab switching ────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab, .panel').forEach(el => el.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
  });
});

// ─── Open Vinted links ────────────────────────────────────────────────────────

async function openVinted() {
  const tabs = await chrome.tabs.query({});
  const vTab = tabs.find(t => t.url && /vinted\.\w+/.test(t.url));
  if (vTab) {
    await chrome.tabs.update(vTab.id, { active: true });
    await chrome.windows.update(vTab.windowId, { focused: true });
  } else {
    const settings = await vrGetSettings();
    const domain = settings.preferredDomain || 'vinted.ro';
    // /my/items redirects to the user's own member profile page on all Vinted locales
    chrome.tabs.create({ url: `https://www.${domain}/my/items` });
  }
  window.close();
}

document.getElementById('open-vinted')?.addEventListener('click', e => { e.preventDefault(); openVinted(); });
document.getElementById('open-vinted-footer')?.addEventListener('click', e => { e.preventDefault(); openVinted(); });

// ─── Relist list rendering ────────────────────────────────────────────────────

let _countdownIntervals = {};

async function renderRelists() {
  const relists = await vrGetPendingRelists();
  const list    = document.getElementById('relist-list');
  const empty   = document.getElementById('empty-state');
  const badge   = document.getElementById('active-count');

  // Clear previous countdown intervals
  Object.values(_countdownIntervals).forEach(clearInterval);
  _countdownIntervals = {};

  const active = relists.filter(r => r.status !== 'completed' && r.status !== 'cancelled');
  badge.textContent = `${active.length} active`;
  list.innerHTML = '';

  if (active.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  active.forEach(entry => {
    const card = buildRelistCard(entry);
    list.appendChild(card);
  });
}

function buildRelistCard(entry) {
  const card = document.createElement('div');
  card.className = 'relist-card';
  card.id = `card-${entry.id}`;

  const statusLabels = {
    pending_deletion: '🗑 Awaiting deletion',
    waiting_delay:    '⏳ Waiting…',
    ready_to_repost:  '✅ Ready to repost!',
    reposting:        '✏️ Reposting'
  };

  const title = entry.data?.title || 'Untitled item';
  const price = entry.data?.price ? `€${entry.data.price}` : '';

  card.innerHTML = `
    <div class="relist-card-header">
      <span class="relist-title" title="${escapePopup(title)}">${escapePopup(title)}</span>
      <span class="relist-price">${escapePopup(price)}</span>
    </div>
    <span class="status-badge status-${entry.status}">${statusLabels[entry.status] || entry.status}</span>

    ${entry.status === 'waiting_delay' ? buildCountdownHtml(entry) : ''}
    ${entry.status === 'ready_to_repost' ? '<p style="font-size:12px;color:#155724;margin:8px 0;">Safety delay complete — click below to start reposting.</p>' : ''}
    ${entry.status === 'pending_deletion' ? '<p style="font-size:12px;color:#856404;margin:8px 0;">Delete the listing on Vinted, then confirm deletion in the page overlay.</p>' : ''}

    <div class="card-actions" id="actions-${entry.id}"></div>
  `;

  const actions = card.querySelector(`#actions-${entry.id}`);
  buildCardActions(entry, actions);

  // Start countdown ticker for waiting entries
  if (entry.status === 'waiting_delay' && entry.delayEndsAt) {
    startCountdownTick(entry);
  }

  return card;
}

function buildCountdownHtml(entry) {
  const remaining = entry.delayEndsAt ? Math.max(0, entry.delayEndsAt - Date.now()) : 0;
  const totalDelay = entry.delayMs || 1;
  const pct = Math.max(0, Math.min(100, ((totalDelay - remaining) / totalDelay) * 100));

  return `
    <div class="countdown-row">
      <span class="countdown-label">Time remaining</span>
      <span class="countdown-val" id="cd-${entry.id}">${vrFormatCountdown(remaining)}</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" id="prog-${entry.id}" style="width:${pct}%"></div>
    </div>
  `;
}

function startCountdownTick(entry) {
  const cdEl   = document.getElementById(`cd-${entry.id}`);
  const progEl = document.getElementById(`prog-${entry.id}`);
  if (!cdEl) return;

  const tick = setInterval(async () => {
    const remaining = entry.delayEndsAt - Date.now();

    if (remaining <= 0) {
      clearInterval(tick);
      // Delay ended — re-render the whole list to show the updated status
      await renderRelists();
      return;
    }

    const pct = Math.max(0, Math.min(100, ((entry.delayMs - remaining) / entry.delayMs) * 100));
    cdEl.textContent = vrFormatCountdown(remaining);
    if (progEl) progEl.style.width = `${pct}%`;
  }, 1_000);

  _countdownIntervals[entry.id] = tick;
}

function buildCardActions(entry, container) {
  switch (entry.status) {

    case 'pending_deletion':
      // User may want to cancel entirely if they changed their mind
      addBtn(container, 'btn-danger', '✗ Cancel', async () => {
        if (!confirm('Cancel this relist? The saved data will be deleted.')) return;
        await vrRemoveRelist(entry.id);
        chrome.runtime.sendMessage({ type: 'CANCEL_ALARM', id: entry.id });
        chrome.runtime.sendMessage({ type: 'UPDATE_BADGE' });
        renderRelists();
      });
      break;

    case 'waiting_delay':
      addBtn(container, 'btn-danger', '✗ Cancel', async () => {
        if (!confirm('Cancel the relist? Saved data will be deleted.')) return;
        await vrRemoveRelist(entry.id);
        chrome.runtime.sendMessage({ type: 'CANCEL_ALARM', id: entry.id });
        chrome.runtime.sendMessage({ type: 'UPDATE_BADGE' });
        renderRelists();
      });
      break;

    case 'ready_to_repost': {
      addBtn(container, 'btn-success', '🚀 Start reposting', async () => {
        // Navigate to the sell page; the content script will show the repost banner
        chrome.runtime.sendMessage({ type: 'OPEN_SELL_PAGE' });
        window.close();
      });

      addBtn(container, 'btn-secondary', '📋 View data', () => {
        showDataPreview(entry);
      });

      addBtn(container, 'btn-danger', '✗ Discard', async () => {
        if (!confirm('Discard all saved data for this relist?')) return;
        await vrRemoveRelist(entry.id);
        chrome.runtime.sendMessage({ type: 'UPDATE_BADGE' });
        renderRelists();
      });
      break;
    }

    case 'reposting':
      addBtn(container, 'btn-primary', '↩ Retry autofill', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_SELL_PAGE' });
        window.close();
      });

      addBtn(container, 'btn-success', '✓ Mark complete', async () => {
        await vrUpdateRelist(entry.id, { status: 'completed' });
        chrome.runtime.sendMessage({ type: 'UPDATE_BADGE' });
        renderRelists();
        toast('Relist marked as complete!', 'success');
      });

      addBtn(container, 'btn-danger', '✗ Discard', async () => {
        if (!confirm('Discard this relist?')) return;
        await vrRemoveRelist(entry.id);
        chrome.runtime.sendMessage({ type: 'UPDATE_BADGE' });
        renderRelists();
      });
      break;
  }
}

function addBtn(container, cls, label, handler) {
  const btn = document.createElement('button');
  btn.className = `btn ${cls}`;
  btn.textContent = label;
  btn.addEventListener('click', handler);
  container.appendChild(btn);
}

// ─── Data preview modal ───────────────────────────────────────────────────────

function showDataPreview(entry) {
  const d = entry.data || {};
  const existing = document.getElementById('vr-popup-preview');
  existing?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'vr-popup-preview';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.55);
    z-index:999;display:flex;align-items:center;justify-content:center;
    font-family:inherit;
  `;

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:10px;max-width:340px;width:92%;
                max-height:90%;overflow:auto;box-shadow:0 16px 48px rgba(0,0,0,.3);">
      <div style="background:#1d7a8c;color:#fff;padding:12px 16px;border-radius:10px 10px 0 0;
                  display:flex;justify-content:space-between;align-items:center;">
        <strong>Saved listing data</strong>
        <button id="vr-preview-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">×</button>
      </div>
      <div style="padding:14px 16px;font-size:13px;line-height:1.5;">
        <p><strong>Title:</strong> ${escapePopup(d.title || '—')}</p>
        <p style="margin-top:8px"><strong>Description:</strong></p>
        <p style="background:#f5f5f5;border-radius:6px;padding:8px;white-space:pre-wrap;font-size:12px;margin-top:4px;">${escapePopup(d.description || '(none)')}</p>
        <p style="margin-top:8px"><strong>Price:</strong> ${escapePopup(d.price || '—')}</p>
        <p style="margin-top:8px"><strong>Images saved:</strong> ${d.imageBlobs?.length || 0} / ${d.imageUrls?.length || 0}</p>
        ${d.listingUrl ? `<p style="margin-top:8px"><strong>Original URL:</strong> <a href="${escapePopup(d.listingUrl)}" target="_blank" style="color:#1d7a8c;">${escapePopup(d.listingUrl)}</a></p>` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#vr-preview-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function loadSettings() {
  const s = await vrGetSettings();

  const minEl     = document.getElementById('s-min');
  const maxEl     = document.getElementById('s-max');
  const minValEl  = document.getElementById('s-min-val');
  const maxValEl  = document.getElementById('s-max-val');
  const autofill  = document.getElementById('s-autofill');
  const manual    = document.getElementById('s-manual');

  const domainEl  = document.getElementById('s-domain');

  minEl.value     = s.minDelayMinutes;
  maxEl.value     = s.maxDelayMinutes;
  minValEl.textContent = s.minDelayMinutes;
  maxValEl.textContent = s.maxDelayMinutes;
  autofill.checked = s.autofillEnabled;
  manual.checked   = s.manualOnlyMode;
  domainEl.value   = s.preferredDomain || 'vinted.ro';

  const updateMin = () => {
    let v = parseInt(minEl.value);
    if (v > parseInt(maxEl.value)) { maxEl.value = v; maxValEl.textContent = v; }
    minValEl.textContent = v;
  };
  const updateMax = () => {
    let v = parseInt(maxEl.value);
    if (v < parseInt(minEl.value)) { minEl.value = v; minValEl.textContent = v; }
    maxValEl.textContent = v;
  };

  minEl.addEventListener('input', updateMin);
  maxEl.addEventListener('input', updateMax);

  document.getElementById('save-settings').addEventListener('click', async () => {
    const rawDomain = domainEl.value.trim()
      .replace(/^https?:\/\/(www\.)?/i, '')  // strip protocol/www if pasted
      .replace(/\/$/, '');                    // strip trailing slash

    const newSettings = {
      minDelayMinutes: parseInt(minEl.value),
      maxDelayMinutes: parseInt(maxEl.value),
      autofillEnabled: autofill.checked,
      manualOnlyMode:  manual.checked,
      preferredDomain: rawDomain || 'vinted.ro'
    };
    await vrSaveSettings(newSettings);
    toast('Settings saved!', 'success');
    document.getElementById('footer-status').textContent = 'Settings saved';
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────────

let _toastTimer = null;

function toast(msg, type = 'info') {
  const el = document.getElementById('popup-toast');
  el.textContent = msg;
  el.className   = `show toast-${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = ''; }, 3_000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapePopup(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Storage change listener ─────────────────────────────────────────────────
// Re-render if another tab/background changes the relist list while popup is open

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.vrPendingRelists) {
    renderRelists();
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

renderRelists();
loadSettings();
