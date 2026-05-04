// utils.js — Shared utilities loaded before content.js and in popup.html

// ─── Constants ────────────────────────────────────────────────────────────────

const VR_DEFAULTS = {
  minDelayMinutes: 5,
  maxDelayMinutes: 10,
  autofillEnabled: true,
  manualOnlyMode: true,
  preferredDomain: 'vinted.ro'   // change to your country's domain
};

// ─── Timing helpers ───────────────────────────────────────────────────────────

function vrRandomIntBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Returns a random delay in milliseconds within the given minute range
function vrRandomDelayMs(minMinutes, maxMinutes) {
  const minMs = minMinutes * 60 * 1000;
  const maxMs = maxMinutes * 60 * 1000;
  return vrRandomIntBetween(minMs, maxMs);
}

function vrSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Format milliseconds as M:SS
function vrFormatCountdown(ms) {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function vrGenerateId() {
  return `vr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ─── Human-like typing ────────────────────────────────────────────────────────

// Types text character by character with randomized delays.
// Uses the native input value setter so React's synthetic events fire correctly.
async function vrHumanType(element, text) {
  if (!element || !text) return;

  element.focus();
  element.click();

  // Access the native setter so React state updates alongside DOM value
  const inputProto = window.HTMLInputElement.prototype;
  const textareaProto = window.HTMLTextAreaElement.prototype;
  const nativeSetter =
    Object.getOwnPropertyDescriptor(inputProto, 'value')?.set ||
    Object.getOwnPropertyDescriptor(textareaProto, 'value')?.set;

  const setValue = (val) => {
    if (nativeSetter) {
      nativeSetter.call(element, val);
    } else {
      element.value = val;
    }
  };

  // Clear field first
  setValue('');
  element.dispatchEvent(new Event('input', { bubbles: true }));

  for (const char of text) {
    await vrSleep(vrRandomIntBetween(45, 130));

    setValue(element.value + char);
    element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

    // Occasional natural pause (~8% of characters) simulating brief hesitation
    if (Math.random() < 0.08) {
      await vrSleep(vrRandomIntBetween(250, 600));
    }
  }

  element.dispatchEvent(new Event('change', { bubbles: true }));
}

// ─── Image helpers ────────────────────────────────────────────────────────────

// Fetches an image URL and returns a base64 data-URL string for local storage
async function vrImageToBase64(url) {
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('[VintedRelist] Could not download image:', url, err.message);
    return null;
  }
}

// ─── Chrome storage helpers ───────────────────────────────────────────────────

async function vrGetSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get('vrSettings', result => {
      resolve({ ...VR_DEFAULTS, ...(result.vrSettings || {}) });
    });
  });
}

async function vrSaveSettings(settings) {
  return new Promise(resolve => {
    chrome.storage.local.set({ vrSettings: settings }, resolve);
  });
}

async function vrGetPendingRelists() {
  return new Promise(resolve => {
    chrome.storage.local.get('vrPendingRelists', result => {
      resolve(result.vrPendingRelists || []);
    });
  });
}

async function vrSavePendingRelists(relists) {
  return new Promise(resolve => {
    chrome.storage.local.set({ vrPendingRelists: relists }, resolve);
  });
}

async function vrAddRelist(entry) {
  const relists = await vrGetPendingRelists();
  relists.push(entry);
  await vrSavePendingRelists(relists);
  return entry;
}

async function vrUpdateRelist(id, updates) {
  const relists = await vrGetPendingRelists();
  const i = relists.findIndex(r => r.id === id);
  if (i === -1) return null;
  relists[i] = { ...relists[i], ...updates };
  await vrSavePendingRelists(relists);
  return relists[i];
}

async function vrRemoveRelist(id) {
  const relists = await vrGetPendingRelists();
  await vrSavePendingRelists(relists.filter(r => r.id !== id));
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function vrEscape(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Waits for a DOM element matching `selector` to appear, up to `timeout` ms
function vrWaitForElement(selector, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { observer.disconnect(); resolve(el); }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => { observer.disconnect(); reject(new Error(`Timeout waiting for: ${selector}`)); }, timeout);
  });
}
