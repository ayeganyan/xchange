const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { parseSelection } = require("../parser.js");

function page(text, response) {
  const events = {};
  const hosts = [];
  const requests = [];
  function element() {
    return {
      style: {}, children: [],
      append(child) { this.children.push(child); },
      setAttribute() {}, remove() {},
      attachShadow() { return this.shadow = element(); },
      getBoundingClientRect() { return { width: 400, height: 54 }; }
    };
  }
  vm.runInNewContext(fs.readFileSync(require.resolve("../content.js"), "utf8"), {
    CurrencySelection: { parseSelection }, Intl,
    setTimeout(fn) { fn(); },
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
      runtime: { sendMessage(message, callback) { requests.push(message); callback(response); } }
    }
  });
  events.mouseup();
  const host = hosts.at(-1);
  return { requests, host, lines: host?.shadow.children[0].children.map(child => child.textContent) };
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
