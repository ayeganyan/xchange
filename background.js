"use strict";

const API_ROOT = "https://api.frankfurter.dev/v2/rate";
const CACHE_TIME_MS = 6 * 60 * 60 * 1000;
const rateCache = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;

      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          files: ["parser.js", "content.js"]
        })
        .catch(() => {
          // Chrome pages and other protected tabs cannot run extensions.
        });
    }
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "convert-to-eur") return false;

  convert(message.amount, message.currency)
    .then((conversion) => sendResponse({ ok: true, ...conversion }))
    .catch(() => sendResponse({ ok: false, error: "Rate unavailable" }));

  return true;
});

async function convert(amount, currency) {
  if (!Number.isFinite(amount) || !["USD", "JPY", "CNY"].includes(currency)) {
    throw new Error("Invalid conversion request");
  }

  const rate = await getRate(currency);
  return { value: amount * rate, rate };
}

async function getRate(currency) {
  const cached = rateCache.get(currency);
  if (cached && Date.now() - cached.savedAt < CACHE_TIME_MS) return cached.rate;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${API_ROOT}/${currency}/EUR`, {
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Rate request failed: ${response.status}`);

    const data = await response.json();
    if (!Number.isFinite(data.rate)) throw new Error("Invalid rate response");

    rateCache.set(currency, { rate: data.rate, savedAt: Date.now() });
    return data.rate;
  } finally {
    clearTimeout(timeout);
  }
}
