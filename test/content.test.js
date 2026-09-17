const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { parseSelection } = require("../parser.js");

function page(text, response, { deferResponse = false, deferSelection = false } = {}) {
  const events = {};
  const hosts = [];
  const requests = [];
  const callbacks = [];
  const timers = [];
  function element() {
    return {
      style: {}, children: [],
      append(child) { this.children.push(child); },
      setAttribute() {}, remove() { this.removed = true; },
      attachShadow() { return this.shadow = element(); },
      getBoundingClientRect() { return { width: 400, height: 54 }; }
    };
  }
  vm.runInNewContext(fs.readFileSync(require.resolve("../content.js"), "utf8"), {
    CurrencySelection: { parseSelection }, Intl,
    setTimeout(fn) { if (deferSelection) timers.push(fn); else fn(); },
    document: {
      addEventListener(name, fn) { events[name] = fn; },
      createElement: element,
      documentElement: { append(host) { hosts.push(host); } }
    },
    window: {
      innerWidth: 800, innerHeight: 600, addEventListener() {},
      getSelection() {
        return { toString: () => text, rangeCount: 1,
          getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 750, bottom: 590, width: 80, height: 20 }) }) };
      }
    },
    chrome: {
      storage: { onChanged: { addListener() {} } },
      runtime: { sendMessage(message, callback) {
        requests.push(message);
        callbacks.push(callback);
        if (!deferResponse) callback(response);
      } }
    }
  });
  events.mouseup();
  return {
    requests, callbacks,
    get host() { return hosts.findLast(host => !host.removed); },
    get lines() { return this.host?.shadow.children[0].children.map(child => child.textContent); },
    select(value, notify = true) {
      text = value;
      if (notify) events.selectionchange();
    },
    mouseup() { events.mouseup(); },
    flush() { while (timers.length) timers.shift()(); }
  };
}

test("selection displays source and both converted range endpoints", () => {
  const app = page("¥150k–170k", { ok: true, value: 900, endValue: 1020, targetCurrency: "EUR" });
  assert.equal(app.requests[0].endAmount, 170000);
  assert.match(app.lines[0], /^JPY .*150.*170/);
  assert.match(app.lines[1], /^≈ .*900.*1.*020/);
  assert.equal(app.host.style.left, "392px");
  assert.equal(app.host.style.top, "538px");
});

test("failed rates stay simple and invalid selections make no request", () => {
  assert.deepEqual(page("$100", { ok: false }).lines, ["Rate unavailable"]);
  assert.equal(page("CHF 1’23.50", {}).requests.length, 0);
});

test("Polish decimal price displays loading, then its original PLN amount", () => {
  const app = page("77,35zł ", undefined, { deferResponse: true });
  assert.equal(app.requests[0].currency, "PLN");
  assert.equal(app.requests[0].amount, 77.35);
  assert.deepEqual(app.lines, ["Converting…"]);
  app.callbacks[0]({ ok: true, value: 17.75, targetCurrency: "EUR" });
  assert.match(app.lines[0], /^PLN 77[.,]35$/);
  assert.match(app.lines[1], /^≈ EUR\s*17[.,]75$/);
  assert.match(app.host.style.cssText, /user-select: none/);
  assert.match(app.host.style.cssText, /pointer-events: none/);
  assert.match(app.host.shadow.children[0].style.cssText, /user-select: none/);
});

test("changing selection invalidates a pending EUR result before the next mouseup", () => {
  const app = page("EUR 17.75", undefined, { deferResponse: true });
  app.select("77,35zł ");
  app.callbacks[0]({ ok: true, value: 17.75, targetCurrency: "EUR" });
  assert.equal(app.host, undefined);
  app.mouseup();
  assert.deepEqual(app.lines, ["Converting…"]);
  app.callbacks[1]({ ok: true, value: 17.75, targetCurrency: "EUR" });
  assert.match(app.lines[0], /^PLN /);
  // An old response must not overwrite the new conversion either.
  app.callbacks[0]({ ok: true, value: 17.75, targetCurrency: "EUR" });
  assert.match(app.lines[0], /^PLN /);
});

test("changed selection rejects a response even before selectionchange fires", () => {
  const app = page("EUR 17.75", undefined, { deferResponse: true });
  app.select("77,35zł ", false);
  app.callbacks[0]({ ok: true, value: 17.75, targetCurrency: "EUR" });
  assert.equal(app.host, undefined);
});

test("selectionchange hides an old result but preserves it when the text is unchanged", () => {
  const app = page("EUR 17.75", { ok: true, value: 17.75, targetCurrency: "EUR" });
  app.select("EUR 17.75");
  assert.ok(app.host);
  app.select("77,35zł ");
  assert.equal(app.host, undefined);
});

test("only the newest queued selection handler can request a conversion", () => {
  const app = page("EUR 17.75", undefined, { deferResponse: true, deferSelection: true });
  app.select("77,35zł ");
  app.mouseup();
  app.flush();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].currency, "PLN");
});
