"use strict";

const currencySelect = document.getElementById("target-currency");
const saveStatus = document.getElementById("save-status");
let savedCurrency = "EUR";

for (const [code, name] of Object.entries(XchangeCurrencies)) {
  const option = document.createElement("option");
  option.value = code;
  option.textContent = `${code} — ${name}`;
  currencySelect.append(option);
}
currencySelect.value = savedCurrency;

async function initialize() {
  try {
    const { targetCurrency } = await chrome.storage.local.get("targetCurrency");
    if (Object.hasOwn(XchangeCurrencies, targetCurrency)) savedCurrency = targetCurrency;
    currencySelect.value = savedCurrency;
    saveStatus.textContent = "Changes save automatically.";
    currencySelect.disabled = false;
  } catch {
    saveStatus.classList.add("error");
    saveStatus.textContent = "Couldn’t load settings. Reopen xchange to try again.";
  }
}

currencySelect.addEventListener("change", async () => {
  const targetCurrency = currencySelect.value;
  currencySelect.disabled = true;
  saveStatus.classList.remove("error");
  saveStatus.textContent = "Saving…";
  try {
    await chrome.storage.local.set({ targetCurrency });
    savedCurrency = targetCurrency;
    saveStatus.textContent = `Saved. Converting to ${targetCurrency}.`;
  } catch {
    currencySelect.value = savedCurrency;
    saveStatus.classList.add("error");
    saveStatus.textContent = "Couldn’t save. Please try again.";
  } finally {
    currencySelect.disabled = false;
    currencySelect.focus();
  }
});

initialize();
