// content.js — Vinted Relist Assistant
// Primary flow: inject "Relist safely" button on item detail pages (/items/ID)
// Secondary:    collect item IDs from profile page (/member/ID)
// Requires utils.js to be loaded first (listed before this file in manifest)

// ─── Selectors ────────────────────────────────────────────────────────────────
// Multiple fallbacks per field — update these if Vinted changes their DOM.

const VR_SEL = {
  // ── Item detail page ──────────────────────────────────────────────────────
  itemTitle: [
    'h1[itemprop="name"]',
    '[data-testid="item-page-title"]',
    '[data-testid="item-title"]',
    '[class*="ItemPage"] h1',
    '[class*="item-page"] h1',
    '[class*="ItemTitle"]',
    'h1'
  ].join(', '),

  itemPrice: [
    '[data-testid="item-price"]',
    '[itemprop="price"]',
    '[class*="ItemPrice"]',
    '[class*="item-price"]',
    '[class*="Price--primary"]'
  ].join(', '),

  itemDescription: [
    '[data-testid="item-description"]',
    '[itemprop="description"]',
    '[class*="ItemDescription"]',
    '[class*="item-description"]',
    '[class*="description"]'
  ].join(', '),

  // Gallery images on the item page
  itemImages: [
    '[data-testid="item-photo"] img',
    '[class*="ItemPhoto"] img',
    '[class*="item-photo"] img',
    '[class*="PhotoSwipe"] img',
    'img[itemprop="image"]',
    '[class*="Gallery"] img',
    '[class*="gallery"] img'
  ].join(', '),

  // The right-side info panel where we inject our button
  itemInfoPanel: [
    '[data-testid="item-page-sidebar"]',
    '[data-testid="item-details"]',
    '[class*="ItemPageSidebar"]',
    '[class*="ItemSidebar"]',
    '[class*="item-details"]',
    '[class*="item-sidebar"]',
    'aside'
  ].join(', '),

  // Owner-only UI elements (only visible on your own items)
  ownerIndicators: [
    '[data-testid*="edit-item"]',
    '[data-testid*="delete-item"]',
    '[data-testid="item-action--edit"]',
    'a[href*="/edit"]',
    '[class*="EditButton"]',
    '[class*="edit-button"]'
  ].join(', '),

  // Seller profile link inside item page (used to match against stored member ID)
  sellerLink: [
    '[data-testid="seller-link"]',
    '[data-testid="user-profile-link"]',
    '[class*="SellerInfo"] a[href*="/member/"]',
    '[class*="seller"] a[href*="/member/"]',
    '[class*="UserInfo"] a[href*="/member/"]',
    'a[href*="/member/"]'
  ].join(', '),

  // Profile link in header/nav — used to auto-detect logged-in member ID
  headerProfileLink: [
    'header a[href*="/member/"]',
    'nav a[href*="/member/"]',
    '[data-testid="header-profile-link"]',
    '[class*="HeaderAvatar"] a',
    '[class*="header"] a[href*="/member/"]',
    '[class*="Avatar"] a[href*="/member/"]'
  ].join(', '),

  // ── Profile page ──────────────────────────────────────────────────────────
  // Links to individual items on the profile / member page
  profileItemLinks: [
    'a[href*="/items/"]'
  ].join(', '),

  // ── Sell page form ────────────────────────────────────────────────────────
  sellTitle: [
    'input[id*="title" i]', 'input[name="title"]',
    'input[placeholder*="title" i]', 'input[placeholder*="titlu" i]',
    '[data-testid*="title"] input'
  ].join(', '),

  sellDesc: [
    'textarea[id*="description" i]', 'textarea[name="description"]',
    'textarea[placeholder*="description" i]', 'textarea[placeholder*="descriere" i]',
    '[data-testid*="description"] textarea'
  ].join(', '),

  sellPrice: [
    'input[id*="price" i]', 'input[name="price"]',
    'input[placeholder*="price" i]', 'input[placeholder*="pret" i]',
    '[data-testid*="price"] input'
  ].join(', ')
};

// ─── Page detection ───────────────────────────────────────────────────────────

const VR_PAGES = {
  itemDetail:    /\/items\/\d+/,
  memberProfile: /\/member\/[^/?#]+/,
  sell:          /\/(sell|items\/new|upload)\b/
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────

let _vrBooted = false;

function vrBoot() {
  if (_vrBooted) return;
  _vrBooted = true;

  vrInjectStyles();

  // Always try to detect the logged-in user's member ID from the page header
  vrDetectMyId();
  vrDetectPage();

  // Intercept SPA navigation
  const _origPush = history.pushState.bind(history);
  history.pushState = (...args) => { _origPush(...args); window.dispatchEvent(new Event('vr:nav')); };
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('vr:nav')));
  window.addEventListener('vr:nav', () => {
    setTimeout(() => { vrDetectMyId(); vrDetectPage(); }, 800);
  });
}

function vrDetectPage() {
  const path = location.pathname;
  if      (VR_PAGES.itemDetail.test(path))    vrInitItemPage();
  else if (VR_PAGES.memberProfile.test(path)) vrInitProfilePage();
  else if (VR_PAGES.sell.test(path))          vrInitSellPage();
}

vrBoot();

// ─── Member ID detection ──────────────────────────────────────────────────────
// Reads the logged-in user's member ID from the header profile link.
// Stored in chrome.storage so item pages can check ownership.

function vrDetectMyId() {
  // Try header links first
  const links = document.querySelectorAll(VR_SEL.headerProfileLink);
  for (const link of links) {
    const m = (link.href || '').match(/\/member\/(\d+)/);
    if (m) {
      chrome.storage.local.set({ vrMyMemberId: m[1] });
      return m[1];
    }
  }

  // Also check the current URL if we're on the profile page
  const urlMatch = location.pathname.match(/\/member\/(\d+)/);
  if (urlMatch) {
    // Only store if this looks like it's the user's own profile
    // (we have no way to confirm, but the user navigated here)
    chrome.storage.local.get('vrMyMemberId', result => {
      if (!result.vrMyMemberId) {
        chrome.storage.local.set({ vrMyMemberId: urlMatch[1] });
      }
    });
  }

  return null;
}

async function vrGetMyMemberId() {
  // Also scan the page in real time in case storage is empty
  vrDetectMyId();
  return new Promise(resolve => {
    chrome.storage.local.get('vrMyMemberId', r => resolve(r.vrMyMemberId || null));
  });
}

// ─── Item detail page ─────────────────────────────────────────────────────────

async function vrInitItemPage() {
  // Avoid double-initialising on the same page
  if (document.getElementById('vr-item-btn-wrap')) return;

  // Wait a moment for the React app to render
  await vrSleep(1200);
  if (!VR_PAGES.itemDetail.test(location.pathname)) return;

  const isOwn = await vrIsOwnItem();
  if (!isOwn) return; // Not the user's listing — do nothing

  vrInjectItemPageButton();
}

// Determines whether the current item page belongs to the logged-in user.
// Uses two signals: stored member ID vs seller link, and presence of owner-only DOM elements.
async function vrIsOwnItem() {
  // Signal 1: compare seller link href against stored member ID
  const myId = await vrGetMyMemberId();
  if (myId) {
    const sellerLinks = document.querySelectorAll('a[href*="/member/"]');
    for (const link of sellerLinks) {
      if (link.href.includes(`/member/${myId}`)) return true;
    }
  }

  // Signal 2: owner-only UI elements (edit / delete buttons)
  const ownerEl = document.querySelector(VR_SEL.ownerIndicators);
  if (ownerEl) return true;

  // Signal 3: item ID present in stored profile item list
  const itemIdMatch = location.pathname.match(/\/items\/(\d+)/);
  if (itemIdMatch) {
    const itemId = itemIdMatch[1];
    const stored = await new Promise(r => chrome.storage.local.get('vrMyItemIds', d => r(d.vrMyItemIds || [])));
    if (stored.includes(itemId)) return true;
  }

  return false;
}

function vrInjectItemPageButton() {
  if (document.getElementById('vr-item-btn-wrap')) return;

  // Find the info panel (right sidebar)
  const panel = document.querySelector(VR_SEL.itemInfoPanel);
  if (!panel) {
    // Fallback: inject as a floating button
    vrInjectFloatingButton();
    return;
  }

  const wrap = document.createElement('div');
  wrap.id = 'vr-item-btn-wrap';
  wrap.className = 'vr-item-btn-wrap';
  wrap.innerHTML = `
    <button id="vr-relist-btn" class="vr-btn vr-btn-relist">
      🔄 Relist safely
    </button>
    <button id="vr-edit-btn" class="vr-btn vr-btn-edit">
      ✏️ Refresh listing
    </button>
    <p class="vr-item-note">Vinted Relist Assistant</p>
  `;

  // Insert at the top of the info panel
  panel.insertBefore(wrap, panel.firstChild);

  document.getElementById('vr-relist-btn').addEventListener('click', () => vrStartItemRelist());
  document.getElementById('vr-edit-btn').addEventListener('click', () => vrShowEditGuide());
}

function vrInjectFloatingButton() {
  const wrap = document.createElement('div');
  wrap.id = 'vr-item-btn-wrap';
  wrap.className = 'vr-floating-wrap';
  wrap.innerHTML = `
    <button id="vr-relist-btn" class="vr-btn vr-btn-relist">🔄 Relist safely</button>
    <button id="vr-edit-btn"   class="vr-btn vr-btn-edit">✏️ Refresh</button>
  `;
  document.body.appendChild(wrap);
  document.getElementById('vr-relist-btn').addEventListener('click', () => vrStartItemRelist());
  document.getElementById('vr-edit-btn').addEventListener('click', () => vrShowEditGuide());
}

// ─── Relist flow (item detail page) ──────────────────────────────────────────

async function vrStartItemRelist() {
  const btn = document.getElementById('vr-relist-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Processing…';

  try {
    const ok = await vrShowConfirmModal();
    if (!ok) { vrResetItemBtn(); return; }

    btn.textContent = '📦 Reading listing…';

    // Extract all data directly from this item detail page
    const rawData = vrExtractItemPageData();

    // Let user review + fill in any gaps
    const confirmed = await vrShowDataModal(rawData);
    if (!confirmed) { vrResetItemBtn(); return; }

    // Download images before deletion
    btn.textContent = '🖼 Saving images…';
    let imageBlobs = [];
    if (rawData.imageUrls.length > 0) {
      const spinner = vrSpinnerOverlay('Saving images before deletion…');
      const results = await Promise.allSettled(rawData.imageUrls.slice(0, 8).map(vrImageToBase64));
      imageBlobs = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
      spinner.remove();
    }

    // Build and save the relist entry
    const settings   = await vrGetSettings();
    const delayMs    = vrRandomDelayMs(settings.minDelayMinutes, settings.maxDelayMinutes);
    const entry = {
      id:            vrGenerateId(),
      data:          { ...confirmed, imageUrls: rawData.imageUrls, imageBlobs },
      status:        'pending_deletion',
      createdAt:     Date.now(),
      delayMs,
      delayStartedAt: null,
      delayEndsAt:    null
    };
    await vrAddRelist(entry);

    // Guide the user to delete the listing
    btn.textContent = '🗑 Awaiting deletion…';
    await vrGuideDeletion(entry);

  } catch (err) {
    console.error('[VintedRelist]', err);
    vrToast(`Error: ${err.message}`, 'error');
    vrResetItemBtn();
  }
}

function vrResetItemBtn() {
  const btn = document.getElementById('vr-relist-btn');
  if (btn) { btn.disabled = false; btn.textContent = '🔄 Relist safely'; }
}

// ─── Data extraction from item detail page ────────────────────────────────────

function vrExtractItemPageData() {
  // Title
  const titleEl = document.querySelector(VR_SEL.itemTitle);
  const title   = titleEl?.textContent?.trim() || '';

  // Price — strip currency symbols, keep numbers and decimal separator
  const priceEl  = document.querySelector(VR_SEL.itemPrice);
  const priceRaw = priceEl?.textContent?.trim() || '';
  // Keep digits, commas, dots — then normalise comma→dot
  const price    = priceRaw.replace(/[^\d,.]/g, '').replace(',', '.');

  // Description
  const descEl  = document.querySelector(VR_SEL.itemDescription);
  const description = descEl?.textContent?.trim() || '';

  // Images — deduplicate, skip tiny icons/avatars (src contains "avatar" or very small)
  const imgEls   = document.querySelectorAll(VR_SEL.itemImages);
  const imageUrls = [...new Set(
    Array.from(imgEls)
      .map(img => img.src || img.dataset.src || '')
      .filter(src =>
        src &&
        !src.startsWith('data:') &&
        !src.includes('avatar') &&
        !src.includes('icon') &&
        !src.includes('logo') &&
        src.startsWith('http')
      )
  )];

  // Item URL and ID
  const itemIdMatch = location.pathname.match(/\/items\/(\d+)/);
  const listingId   = itemIdMatch?.[1] || '';
  const listingUrl  = location.href;

  return { title, price, description, imageUrls, listingId, listingUrl };
}

// ─── Deletion guide ───────────────────────────────────────────────────────────

function vrGuideDeletion(entry) {
  return new Promise(resolve => {
    // Try to find and highlight the delete button / "..." menu
    const deleteEl = document.querySelector(VR_SEL.ownerIndicators);
    if (deleteEl) deleteEl.classList.add('vr-highlight');

    const minutes = Math.round(entry.delayMs / 60_000);
    const guide   = document.createElement('div');
    guide.id = 'vr-deletion-guide';
    guide.className = 'vr-guide-modal-overlay';
    guide.innerHTML = `
      <div class="vr-guide-modal">
        <div class="vr-modal-header">
          <h2>🗑️ Step: Delete the listing</h2>
        </div>
        <div class="vr-modal-body">
          ${deleteEl
            ? '<p>The <strong>edit/delete button</strong> is highlighted on the page. Use it to delete your listing.</p>'
            : `<p>Delete this listing using Vinted's own menu or edit page. You can also navigate to
               <strong>Edit → Delete listing</strong> from the item's options.</p>`
          }
          <p style="margin-top:8px">After you have deleted it, click <strong>Deletion Done</strong> below.</p>
          <div class="vr-guide-meta">
            ⏱ Safety delay after deletion: <strong>~${minutes} minutes</strong>
          </div>
          <div class="vr-guide-meta" style="margin-top:6px;background:#fff8e1;border-color:#ffc107;">
            ⚠️ Your listing data and images have already been saved to the extension.
          </div>
        </div>
        <div class="vr-modal-footer">
          <button id="vr-guide-cancel" class="vr-btn vr-btn-secondary">Cancel relist</button>
          <button id="vr-guide-done"   class="vr-btn vr-btn-primary">✓ Deletion Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(guide);

    guide.querySelector('#vr-guide-done').addEventListener('click', async () => {
      guide.remove();
      deleteEl?.classList.remove('vr-highlight');
      await vrStartDelay(entry);
      vrResetItemBtn();
      resolve();
    });

    guide.querySelector('#vr-guide-cancel').addEventListener('click', async () => {
      guide.remove();
      deleteEl?.classList.remove('vr-highlight');
      await vrRemoveRelist(entry.id);
      vrToast('Relist cancelled. Saved data removed.', 'info');
      vrResetItemBtn();
      resolve();
    });
  });
}

// ─── Delay & countdown ────────────────────────────────────────────────────────

async function vrStartDelay(entry) {
  const now         = Date.now();
  const delayEndsAt = now + entry.delayMs;

  await vrUpdateRelist(entry.id, {
    status:         'waiting_delay',
    delayStartedAt: now,
    delayEndsAt
  });

  chrome.runtime.sendMessage({ type: 'SET_ALARM',     id: entry.id, delayMs: entry.delayMs });
  chrome.runtime.sendMessage({ type: 'UPDATE_BADGE' });

  vrShowCountdownToast(entry.id, delayEndsAt);
  vrToast('Delay started! Open the extension popup to monitor progress.', 'success', 6000);
}

function vrShowCountdownToast(id, delayEndsAt) {
  document.getElementById(`vr-toast-${id}`)?.remove();

  const toast = document.createElement('div');
  toast.className = 'vr-countdown-toast';
  toast.id = `vr-toast-${id}`;
  toast.innerHTML = `
    <div class="vr-ct-header">
      <span>🔄 Vinted Relist</span>
      <button class="vr-ct-close" title="Hide">×</button>
    </div>
    <div class="vr-ct-body">
      <p>Listing deleted ✓ — safety delay running…</p>
      <div class="vr-ct-time">--:--</div>
      <p class="vr-ct-hint">Open the extension popup to monitor or start reposting</p>
    </div>`;

  document.body.appendChild(toast);

  const timeEl = toast.querySelector('.vr-ct-time');
  toast.querySelector('.vr-ct-close').addEventListener('click', () => toast.remove());

  const tick = setInterval(() => {
    const remaining = delayEndsAt - Date.now();
    if (remaining <= 0) {
      clearInterval(tick);
      timeEl.textContent = '✓ Ready!';
      toast.classList.add('vr-ct-ready');
      setTimeout(() => toast.remove(), 8_000);
    } else {
      timeEl.textContent = vrFormatCountdown(remaining);
    }
  }, 1_000);
}

// ─── Profile page ─────────────────────────────────────────────────────────────
// Collect item IDs from listing cards so item pages can verify ownership.

function vrInitProfilePage() {
  // Store this member ID if it's the user's own profile
  vrDetectMyId();

  clearTimeout(window._vrProfileTimer);
  window._vrProfileTimer = setTimeout(vrCollectProfileItemIds, 1000);

  // Re-scan on scroll/dynamic load
  const obs = new MutationObserver(() => {
    clearTimeout(window._vrProfileScanTimer);
    window._vrProfileScanTimer = setTimeout(vrCollectProfileItemIds, 400);
  });
  obs.observe(document.querySelector('main') || document.body, { childList: true, subtree: true });
}

function vrCollectProfileItemIds() {
  const links  = document.querySelectorAll(VR_SEL.profileItemLinks);
  const newIds = new Set();

  links.forEach(link => {
    const m = (link.href || '').match(/\/items\/(\d+)/);
    if (m) newIds.add(m[1]);
  });

  if (newIds.size === 0) return;

  chrome.storage.local.get('vrMyItemIds', result => {
    const existing = new Set(result.vrMyItemIds || []);
    newIds.forEach(id => existing.add(id));
    // Keep the list manageable (last 200 items)
    const trimmed = [...existing].slice(-200);
    chrome.storage.local.set({ vrMyItemIds: trimmed });
  });
}

// ─── Sell page (repost assist) ────────────────────────────────────────────────

async function vrInitSellPage() {
  const relists = await vrGetPendingRelists();
  const ready   = relists.find(r => r.status === 'ready_to_repost');
  if (!ready) return;

  try {
    await vrWaitForElement(VR_SEL.sellTitle, 12_000);
  } catch {
    console.warn('[VintedRelist] Sell form did not appear.');
    return;
  }

  vrShowRepostBanner(ready);
}

function vrShowRepostBanner(entry) {
  document.getElementById('vr-repost-banner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'vr-repost-banner';
  banner.className = 'vr-repost-banner';
  banner.innerHTML = `
    <div class="vr-banner-inner">
      <h3>🔄 Repost Assistant</h3>
      <p>Saved: <strong>${vrEscape(entry.data.title)}</strong> — ${vrEscape(entry.data.price)} RON</p>
      <p>${entry.data.imageBlobs?.length || 0} image(s) saved</p>
      <div class="vr-banner-actions">
        <button id="vr-do-autofill" class="vr-btn vr-btn-primary">✏️ Autofill form</button>
        <button id="vr-skip-fill"   class="vr-btn vr-btn-secondary">Skip</button>
        <button id="vr-discard"     class="vr-btn vr-btn-danger">✗ Discard</button>
      </div>
      <p class="vr-banner-note">⚠️ You must click <strong>Publish</strong> yourself.</p>
    </div>`;

  document.body.prepend(banner);

  banner.querySelector('#vr-do-autofill').addEventListener('click', async () => {
    const b = banner.querySelector('#vr-do-autofill');
    b.disabled = true; b.textContent = '⏳ Filling…';
    const errors = await vrAutofillForm(entry.data);
    if (errors.length) vrToast(`Partial fill — ${errors.join('; ')}`, 'error', 8000);
    else vrToast('Form filled! Review and click Publish yourself.', 'success', 6000);
    await vrUpdateRelist(entry.id, { status: 'reposting' });
    banner.remove();
  });

  banner.querySelector('#vr-skip-fill').addEventListener('click', () => {
    banner.remove();
    vrToast('Data still saved in extension popup.', 'info');
  });

  banner.querySelector('#vr-discard').addEventListener('click', async () => {
    if (!confirm('Discard all saved data for this relist?')) return;
    await vrRemoveRelist(entry.id);
    chrome.runtime.sendMessage({ type: 'UPDATE_BADGE' });
    banner.remove();
  });
}

async function vrAutofillForm(data) {
  const errors = [];
  async function fill(selector, value, label) {
    const el = document.querySelector(selector);
    if (!el) { errors.push(`${label} not found`); return; }
    await vrSleep(vrRandomIntBetween(600, 1200));
    await vrHumanType(el, value);
  }
  if (data.title)       await fill(VR_SEL.sellTitle, data.title,       'Title');
  if (data.description) await fill(VR_SEL.sellDesc,  data.description, 'Description');
  if (data.price)       await fill(VR_SEL.sellPrice, data.price,       'Price');
  return errors;
}

// ─── Edit-instead guide ───────────────────────────────────────────────────────

function vrShowEditGuide() {
  const itemId  = location.pathname.match(/\/items\/(\d+)/)?.[1] || '';
  const editUrl = itemId ? `${location.origin}/items/${itemId}/edit` : '';

  const overlay = vrModal(`
    <div class="vr-modal-header">
      <h2>✏️ Refresh listing (safer)</h2>
      <button class="vr-modal-x" data-vr-close>×</button>
    </div>
    <div class="vr-modal-body">
      <div class="vr-info-box">
        Editing is safer than deleting and reposting — it bumps the listing's
        timestamp without deletion risk.
      </div>
      <ol>
        <li>Open the edit page</li>
        <li>Make a small change to the description (add/remove a word)</li>
        <li>Save</li>
      </ol>
    </div>
    <div class="vr-modal-footer">
      <button class="vr-btn vr-btn-secondary" data-vr-close>Close</button>
      ${editUrl ? `<a href="${vrEscape(editUrl)}" target="_blank" class="vr-btn vr-btn-primary" data-vr-close>Open Edit Page ↗</a>` : ''}
    </div>
  `);

  overlay.querySelectorAll('[data-vr-close]').forEach(el =>
    el.addEventListener('click', () => overlay.remove())
  );
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function vrShowConfirmModal() {
  return new Promise(resolve => {
    const overlay = vrModal(`
      <div class="vr-modal-header">
        <h2>🔄 Relist this item?</h2>
        <button class="vr-modal-x" data-vr-close>×</button>
      </div>
      <div class="vr-modal-body">
        <div class="vr-warn-box">
          <strong>⚠️ Platform policy notice</strong><br>
          Relisting may violate Vinted's terms of service. Use this tool sparingly and at your own risk.
        </div>
        <p>What will happen:</p>
        <ol>
          <li>All listing data + images will be saved now</li>
          <li>You delete the listing using Vinted's own option</li>
          <li>A randomized delay of 5–10 minutes passes</li>
          <li>The extension helps fill in the new listing form</li>
          <li><strong>You</strong> click Publish — never auto-submitted</li>
        </ol>
      </div>
      <div class="vr-modal-footer">
        <button class="vr-btn vr-btn-secondary" id="vr-cf-no">Cancel</button>
        <button class="vr-btn vr-btn-primary"   id="vr-cf-yes">Yes, relist</button>
      </div>
    `);

    const close = result => { overlay.remove(); resolve(result); };
    overlay.querySelector('#vr-cf-yes').addEventListener('click', () => close(true));
    overlay.querySelector('#vr-cf-no' ).addEventListener('click', () => close(false));
    overlay.querySelectorAll('[data-vr-close]').forEach(el => el.addEventListener('click', () => close(false)));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
  });
}

function vrShowDataModal(data) {
  return new Promise(resolve => {
    const imgHtml = data.imageUrls.length
      ? `<div class="vr-img-strip">${data.imageUrls.slice(0, 6).map(u => `<img src="${vrEscape(u)}">`).join('')}</div>
         <p class="vr-note">${data.imageUrls.length} image(s) found — will be downloaded before deletion</p>`
      : '<p class="vr-warn-inline">⚠️ No images found — you will need to re-upload photos manually.</p>';

    const overlay = vrModal(`
      <div class="vr-modal-header">
        <h2>📦 Confirm listing data</h2>
        <button class="vr-modal-x" data-vr-close>×</button>
      </div>
      <div class="vr-modal-body">
        <p class="vr-help">Review the extracted data. Edit anything before saving.</p>
        <div class="vr-field">
          <label>Title <span class="vr-req">*</span></label>
          <input id="vr-d-title" type="text" value="${vrEscape(data.title)}" placeholder="Item title" />
        </div>
        <div class="vr-field">
          <label>Description</label>
          <textarea id="vr-d-desc" rows="4" placeholder="Item description">${vrEscape(data.description)}</textarea>
        </div>
        <div class="vr-field">
          <label>Price (RON)</label>
          <input id="vr-d-price" type="text" value="${vrEscape(data.price)}" placeholder="e.g. 400" />
        </div>
        <div class="vr-field">${imgHtml}</div>
      </div>
      <div class="vr-modal-footer">
        <button class="vr-btn vr-btn-secondary" id="vr-d-cancel">Cancel</button>
        <button class="vr-btn vr-btn-primary"   id="vr-d-save">Save & continue</button>
      </div>
    `, 'vr-modal-lg');

    overlay.querySelector('#vr-d-save').addEventListener('click', () => {
      const title = overlay.querySelector('#vr-d-title').value.trim();
      if (!title) {
        overlay.querySelector('#vr-d-title').classList.add('vr-field-error');
        vrToast('Please enter a title.', 'error');
        return;
      }
      overlay.remove();
      resolve({
        title,
        description: overlay.querySelector('#vr-d-desc').value.trim(),
        price:       overlay.querySelector('#vr-d-price').value.trim()
      });
    });

    const cancel = () => { overlay.remove(); resolve(null); };
    overlay.querySelector('#vr-d-cancel').addEventListener('click', cancel);
    overlay.querySelectorAll('[data-vr-close]').forEach(el => el.addEventListener('click', cancel));
    overlay.addEventListener('click', e => { if (e.target === overlay) cancel(); });
  });
}

function vrModal(innerHtml, extraClass = '') {
  const overlay = document.createElement('div');
  overlay.className = 'vr-overlay';
  const modal = document.createElement('div');
  modal.className = `vr-modal ${extraClass}`;
  modal.innerHTML = innerHtml;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  return overlay;
}

// ─── Toasts & spinners ────────────────────────────────────────────────────────

function vrToast(msg, type = 'info', duration = 5000) {
  const t = document.createElement('div');
  t.className = `vr-toast vr-toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.classList.add('vr-toast-out'); setTimeout(() => t.remove(), 500); }, duration);
}

function vrSpinnerOverlay(msg) {
  const el = document.createElement('div');
  el.className = 'vr-spinner-overlay';
  el.textContent = msg;
  document.body.appendChild(el);
  return el;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function vrInjectStyles() {
  if (document.getElementById('vr-styles')) return;
  const s = document.createElement('style');
  s.id = 'vr-styles';
  s.textContent = `
:root {
  --vr-primary: #1d7a8c;
  --vr-primary-dark: #155f6e;
  --vr-primary-light: #d0edf1;
  --vr-danger: #dc3545;
  --vr-success: #28a745;
  --vr-warn: #ffc107;
  --vr-text: #222;
  --vr-muted: #666;
  --vr-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* Button group injected into item info panel */
.vr-item-btn-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  margin-bottom: 12px;
  background: #f0f9fb;
  border: 1.5px solid var(--vr-primary);
  border-radius: 10px;
}
.vr-item-note {
  width: 100%;
  font-size: 10px;
  color: var(--vr-muted);
  margin: 0;
  font-family: var(--vr-font);
}

/* Floating fallback (when sidebar not found) */
.vr-floating-wrap {
  position: fixed;
  bottom: 80px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 2147483646;
}

.vr-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 9px 16px;
  border-radius: 20px;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  font-family: var(--vr-font);
  transition: filter .15s, transform .1s;
  text-decoration: none;
  white-space: nowrap;
}
.vr-btn:hover:not(:disabled) { filter: brightness(.88); transform: translateY(-1px); }
.vr-btn:disabled { opacity: .55; cursor: not-allowed; transform: none; }
.vr-btn-relist   { background: var(--vr-primary); color: #fff; }
.vr-btn-edit     { background: #eee; color: #333; border: 1px solid #ccc; }
.vr-btn-primary  { background: var(--vr-primary); color: #fff; }
.vr-btn-secondary{ background: #eee; color: #333; border: 1px solid #ccc; }
.vr-btn-danger   { background: var(--vr-danger); color: #fff; }

/* Modal */
.vr-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.55);
  z-index: 2147483647;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--vr-font);
}
.vr-guide-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.55);
  z-index: 2147483647;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--vr-font);
}
.vr-modal, .vr-guide-modal {
  background: #fff;
  border-radius: 12px;
  max-width: 480px;
  width: calc(100% - 32px);
  max-height: 90vh;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0,0,0,.3);
  display: flex; flex-direction: column;
}
.vr-modal-lg { max-width: 580px; }

.vr-modal-header {
  background: var(--vr-primary); color: #fff;
  padding: 14px 18px;
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
.vr-modal-header h2 { margin: 0; font-size: 15px; font-weight: 700; }
.vr-modal-x {
  background: none; border: none; color: #fff;
  font-size: 22px; cursor: pointer; padding: 0; line-height: 1; opacity: .75;
}
.vr-modal-x:hover { opacity: 1; }
.vr-modal-body {
  padding: 18px 20px; font-size: 13.5px; color: var(--vr-text);
  line-height: 1.55; overflow-y: auto; flex: 1;
}
.vr-modal-body ol { padding-left: 20px; }
.vr-modal-body li { margin-bottom: 5px; }
.vr-modal-footer {
  padding: 14px 18px; display: flex; gap: 8px;
  justify-content: flex-end; border-top: 1px solid #eee; flex-shrink: 0;
}

.vr-warn-box  { background: #fff8e1; border: 1px solid var(--vr-warn);  border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; font-size: 13px; }
.vr-info-box  { background: var(--vr-primary-light); border: 1px solid var(--vr-primary); border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; font-size: 13px; }
.vr-guide-meta{ background: #f0f8ff; border: 1px solid #bee3f8; border-radius: 6px; padding: 8px 10px; font-size: 12.5px; margin: 10px 0; }
.vr-warn-inline{ color: var(--vr-danger); font-size: 13px; }
.vr-help { color: var(--vr-muted); margin-bottom: 14px; }
.vr-note { font-size: 11px; color: var(--vr-muted); margin-top: 4px; }
.vr-req  { color: var(--vr-danger); }

.vr-field { margin-bottom: 14px; }
.vr-field label { display: block; font-weight: 600; font-size: 12px; color: #555; margin-bottom: 5px; }
.vr-field input, .vr-field textarea {
  width: 100%; padding: 8px 10px;
  border: 1px solid #ccc; border-radius: 6px;
  font-size: 13.5px; font-family: var(--vr-font);
  box-sizing: border-box; resize: vertical;
}
.vr-field input:focus, .vr-field textarea:focus { outline: none; border-color: var(--vr-primary); }
.vr-field-error { border-color: var(--vr-danger) !important; }
.vr-img-strip { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.vr-img-strip img { width: 72px; height: 72px; object-fit: cover; border-radius: 6px; border: 1px solid #ddd; }

.vr-highlight {
  outline: 3px solid var(--vr-danger) !important;
  outline-offset: 3px;
  animation: vrPulse 1.4s ease-in-out infinite;
}
@keyframes vrPulse { 0%,100% { outline-color: var(--vr-danger); } 50% { outline-color: #ff8a8a; } }

.vr-countdown-toast {
  position: fixed; bottom: 20px; right: 20px;
  width: 272px; background: #fff;
  border-radius: 12px; border: 2px solid var(--vr-primary);
  box-shadow: 0 8px 32px rgba(0,0,0,.18);
  z-index: 2147483646; overflow: hidden;
  font-family: var(--vr-font);
}
.vr-ct-header {
  background: var(--vr-primary); color: #fff;
  padding: 9px 13px; display: flex; justify-content: space-between; align-items: center;
  font-weight: 600; font-size: 13px;
}
.vr-ct-close { background: none; border: none; color: #fff; font-size: 18px; cursor: pointer; padding: 0; line-height: 1; opacity: .75; }
.vr-ct-close:hover { opacity: 1; }
.vr-ct-body { padding: 12px 14px; }
.vr-ct-body p { margin: 0 0 6px; font-size: 12.5px; color: var(--vr-text); }
.vr-ct-time { font-size: 36px; font-weight: 700; color: var(--vr-primary); text-align: center; margin: 8px 0; font-variant-numeric: tabular-nums; }
.vr-ct-ready .vr-ct-time { color: var(--vr-success); }
.vr-ct-hint { font-size: 11px !important; color: var(--vr-muted) !important; }

.vr-repost-banner { background: #edfbf0; border: 2px solid var(--vr-success); border-radius: 12px; margin: 12px 16px; overflow: hidden; font-family: var(--vr-font); }
.vr-banner-inner  { padding: 14px 18px; }
.vr-banner-inner h3 { margin: 0 0 6px; color: #155724; font-size: 14px; }
.vr-banner-inner p  { margin: 0 0 5px; font-size: 12.5px; color: #1c4a25; }
.vr-banner-actions  { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.vr-banner-note  { font-size: 11px !important; margin-top: 10px !important; color: #555 !important; }

.vr-toast {
  position: fixed; top: 18px; right: 18px;
  max-width: 360px; padding: 11px 16px;
  border-radius: 8px; color: #fff;
  font-size: 13.5px; font-weight: 500;
  font-family: var(--vr-font);
  box-shadow: 0 4px 16px rgba(0,0,0,.2);
  z-index: 2147483647; transition: opacity .4s;
}
.vr-toast-error   { background: var(--vr-danger); }
.vr-toast-success { background: var(--vr-success); }
.vr-toast-info    { background: var(--vr-primary); }
.vr-toast-out     { opacity: 0; }

.vr-spinner-overlay {
  position: fixed; top: 50%; left: 50%;
  transform: translate(-50%,-50%);
  background: rgba(0,0,0,.78); color: #fff;
  padding: 14px 22px; border-radius: 10px;
  font-family: var(--vr-font); font-size: 14px;
  z-index: 2147483647;
}
  `;
  document.head.appendChild(s);
}
