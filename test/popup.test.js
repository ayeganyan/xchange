const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function popup(storage = {}, failSave = false) {
  let change;
  const select = { disabled: true, options: [], append(option) { this.options.push(option); },
    addEventListener(_event, fn) { change = fn; }, focus() {} };
  const status = { classList: { add() {}, remove() {} } };
  const context = vm.createContext({
    document: {
      getElementById(id) { return id === "target-currency" ? select : status; },
      createElement() { return {}; }
    },
    chrome: { storage: { local: {
      async get() { return storage; },
      async set(value) {
        if (failSave) throw new Error("Storage unavailable");
        Object.assign(storage, value);
      }
    } } }
  });
  for (const file of ["currencies.js", "popup.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  await new Promise(resolve => setImmediate(resolve));
  return { select, status, async choose(code) { select.value = code; await change(); } };
}

test("picker defaults to EUR, saves selection, and restores it on reopen", async () => {
  const storage = {};
  const first = await popup(storage);
  assert.equal(first.select.value, "EUR");
  assert.equal(first.select.disabled, false);
  assert.ok(first.select.options.some(option => option.value === "AMD"));
  await first.choose("AMD");
  assert.equal(storage.targetCurrency, "AMD");
  assert.match(first.status.textContent, /Saved/);
  assert.equal((await popup(storage)).select.value, "AMD");
});

test("failed save restores the previous selection and allows retry", async () => {
  const storage = { targetCurrency: "JPY" };
  const app = await popup(storage, true);
  await app.choose("GBP");
  assert.equal(storage.targetCurrency, "JPY");
  assert.equal(app.select.value, "JPY");
  assert.equal(app.select.disabled, false);
  assert.match(app.status.textContent, /Couldn’t save/);
});
