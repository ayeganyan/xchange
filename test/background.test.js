const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function worker({ targetCurrency, rate = 0.8, fail = false } = {}) {
  let listener;
  const urls = [];
  const settings = { targetCurrency };
  const context = vm.createContext({
    AbortController, setTimeout, clearTimeout,
    chrome: {
      runtime: {
        onInstalled: { addListener() {} },
        onMessage: { addListener(fn) { listener = fn; } }
      },
      storage: { local: { async get() { return settings; } } }
    },
    async fetch(url) {
      urls.push(url);
      if (fail) throw new Error("Offline");
      return { ok: true, async json() { return { rate }; } };
    },
    importScripts(...files) {
      for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../background.js"), "utf8"), context);
  return {
    settings, urls,
    request(overrides = {}) {
      return new Promise(resolve => {
        assert.equal(listener({ type: "convert", amount: 100, currency: "USD", ...overrides }, {}, resolve), true);
      });
    }
  };
}

test("defaults to EUR and uses the saved target on subsequent requests", async () => {
  const app = worker();
  const first = await app.request();
  assert.equal(first.targetCurrency, "EUR");
  assert.equal(first.value, 80);
  app.settings.targetCurrency = "GBP";
  assert.equal((await app.request()).targetCurrency, "GBP");
  assert.match(app.urls[1], /USD\/GBP$/);
});

test("rate cache separates source and target currencies and reuses a pair", async () => {
  const app = worker({ targetCurrency: "GBP" });
  await app.request();
  await app.request({ amount: 200 });
  app.settings.targetCurrency = "JPY";
  await app.request();
  await app.request({ currency: "CNY" });
  app.settings.targetCurrency = "GBP";
  await app.request();
  assert.deepEqual(app.urls.map(url => url.split("/rate/")[1]), ["USD/GBP", "USD/JPY", "CNY/JPY"]);
});

test("same-currency conversion works offline without fetching", async () => {
  const app = worker({ targetCurrency: "USD", fail: true });
  const result = await app.request();
  assert.equal(result.ok, true);
  assert.equal(result.value, 100);
  assert.equal(result.rate, 1);
  assert.equal(app.urls.length, 0);
});

test("converts every supported source, including AMD, and rejects AZN", async () => {
  const sources = "USD EUR JPY GBP CNY CHF AUD CAD HKD SGD INR KRW SEK MXN NZD NOK TWD BRL ZAR PLN AMD".split(" ");
  const app = worker({ targetCurrency: "EUR" });
  for (const currency of sources) {
    const result = await app.request({ currency });
    assert.equal(result.ok, true, currency);
    assert.equal(result.targetCurrency, "EUR");
    assert.equal(result.value, currency === "EUR" ? 100 : 80);
  }
  assert.equal((await app.request({ currency: "AZN" })).ok, false);
  assert.equal(app.urls.length, 20);
});

test("invalid saved settings fall back to EUR", async () => {
  const app = worker({ targetCurrency: "../../../bad" });
  assert.equal((await app.request()).targetCurrency, "EUR");
  assert.match(app.urls[0], /USD\/EUR$/);
});

test("old content scripts continue receiving EUR", async () => {
  const app = worker({ targetCurrency: "GBP" });
  assert.equal((await app.request({ type: "convert-to-eur" })).targetCurrency, "EUR");
});

test("invalid inputs, bad rates and network failures produce errors", async () => {
  for (const rate of [0, -1, NaN, Infinity]) {
    assert.equal((await worker({ rate }).request()).ok, false);
  }
  assert.equal((await worker({ fail: true }).request()).ok, false);
  const app = worker();
  assert.equal((await app.request({ amount: Infinity })).ok, false);
  assert.equal((await app.request({ currency: "BAD" })).ok, false);
  assert.equal(app.urls.length, 0);
});

test("range endpoints share a rate and target", async () => {
  const app = worker();
  const result = await app.request({ amount: 150, endAmount: 170 });
  assert.equal(result.value, 120);
  assert.equal(result.endValue, 136);
  assert.equal(app.urls.length, 1);
  assert.equal((await app.request({ endAmount: Infinity })).ok, false);
});
