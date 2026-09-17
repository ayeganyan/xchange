const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSelection, sourceCurrencies } = require("../parser.js");

const examples = [
  ["100usd", 100, "USD"],
  ["159,00zł", 159, "PLN"],
  ["159,99 zł", 159.99, "PLN"],
  ["zł159,99", 159.99, "PLN"],
  ["PLN -159,50", -159.5, "PLN"],
  ["1.234,56zł", 1234.56, "PLN"],
  ["€1.234,56", 1234.56, "EUR"],
  ["1.234.567,89 EUR", 1234567.89, "EUR"],
  ["2,5k PLN", 2500, "PLN"],
  ["USD 1,234", 1234, "USD"],
  ["USD 1,234,567.89", 1234567.89, "USD"],
  ["€0,99", 0.99, "EUR"],
  ["USD 100", 100, "USD"],
  ["$100", 100, "USD"],
  ["US$ 1,234.56", 1234.56, "USD"],
  ["100 dollars", 100, "USD"],
  ["100JPY", 100, "JPY"],
  ["JPY 100", 100, "JPY"],
  ["¥100", 100, "JPY"],
  ["100 yen", 100, "JPY"],
  ["CN¥100", 100, "CNY"],
  ["100 CNY", 100, "CNY"],
  ["RMB 100", 100, "CNY"],
  ["100 yuan", 100, "CNY"],
  ["100元", 100, "CNY"],
  ["¥150k", 150000, "JPY"],
  ["$1.5K", 1500, "USD"],
  ["250k CNY", 250000, "CNY"],
  ["about RMB 2.5k or $500", 2500, "CNY"],
  ["prices are $300 and ¥150k", 300, "USD"]
];

for (const [input, amount, currency] of examples) {
  test(`parses ${input}`, () => {
    assert.deepEqual(parseSelection(input), { amount, currency });
  });
}

test("rejects text without a supported currency", () => {
  assert.equal(parseSelection("100"), null);
  assert.equal(parseSelection("100 AZN"), null);
  assert.equal(parseSelection("nothing to convert here"), null);
});

const expectedSources = "USD EUR JPY GBP CNY CHF AUD CAD HKD SGD INR KRW SEK MXN NZD NOK TWD BRL ZAR PLN AMD".split(" ");
test("supports exactly the top 20 currencies plus AMD", () => {
  assert.deepEqual([...sourceCurrencies].sort(), [...expectedSources].sort());
});
for (const currency of expectedSources) {
  test(`parses ${currency} before and after amounts`, () => {
    for (const text of [`${currency} 1,234.50`, `1,234.50 ${currency}`, `1234.50${currency.toLowerCase()}`]) {
      assert.deepEqual(parseSelection(text), { amount: 1234.5, currency });
    }
    assert.deepEqual(parseSelection(`2.5k ${currency}`), { amount: 2500, currency });
  });
}

for (const [marker, currency] of [
  ["€", "EUR"], ["£", "GBP"], ["A$", "AUD"], ["AU$", "AUD"],
  ["C$", "CAD"], ["CA$", "CAD"], ["HK$", "HKD"], ["S$", "SGD"],
  ["SG$", "SGD"], ["₹", "INR"], ["₩", "KRW"], ["MX$", "MXN"],
  ["NZ$", "NZD"], ["NT$", "TWD"], ["R$", "BRL"], ["zł", "PLN"],
  ["֏", "AMD"], ["դրամ", "AMD"], ["Armenian drams", "AMD"],
  ["Swiss francs", "CHF"], ["Swedish kronor", "SEK"],
  ["Norwegian kroner", "NOK"], ["South African rand", "ZAR"]
]) {
  test(`recognizes ${marker} without confusing dollar symbols`, () => {
    assert.deepEqual(parseSelection(`${marker} 100`), { amount: 100, currency });
    assert.deepEqual(parseSelection(`100 ${marker}`), { amount: 100, currency });
  });
}

test("ignores ambiguous markers and currency codes embedded in words", () => {
  for (const text of ["100 kr", "R 100", "100 Fr", "xAMD 100", "100 AMDfoo", "100 դրամական", "100 AZN", "₼100"]) {
    assert.equal(parseSelection(text), null, text);
  }
});

test("keeps the first amount and understands Armenian thousands", () => {
  assert.deepEqual(parseSelection("price ֏150k or €350"), { amount: 150000, currency: "AMD" });
});

test("does not truncate malformed decimal-comma amounts after a currency", () => {
  assert.equal(parseSelection("PLN 159,00,50"), null);
  assert.equal(parseSelection("159,00,50zł"), null);
});

for (const input of ["€1 234,56", "1 234,56 EUR", "€1\u00a0234,56", "€1\u202f234,56"]) {
  test(`parses grouped amount ${input}`, () => {
    assert.deepEqual(parseSelection(input), { amount: 1234.56, currency: "EUR" });
  });
}
test("handles apostrophe grouping and leading signs", () => {
  assert.deepEqual(parseSelection("CHF 1’234.50"), { amount: 1234.5, currency: "CHF" });
  assert.deepEqual(parseSelection("-$100"), { amount: -100, currency: "USD" });
});
for (const symbol of "-‐‑‒–—―−~〜～") {
  for (const space of ["", " ", "   ", "\t\n"]) {
    test(`range separator ${JSON.stringify(symbol + space)}`, () => {
      assert.deepEqual(parseSelection(`around ¥150k${space}${symbol}${space}170k`),
        { amount: 150000, endAmount: 170000, currency: "JPY" });
    });
  }
}
for (const [input, amount, endAmount, currency] of [
  ["¥150–170k", 150, 170000, "JPY"],
  ["150,000 - 170,000 JPY", 150000, 170000, "JPY"],
  ["€1 234,56–€2 345,67", 1234.56, 2345.67, "EUR"],
  ["CHF 1’234.50 - 2’345.50 CHF", 1234.5, 2345.5, "CHF"],
  ["USD -100--50", -100, -50, "USD"]
]) {
  test(`converts range ${input}`, () => {
    assert.deepEqual(parseSelection(input), { amount, endAmount, currency });
  });
}
test("rejects ambiguous, malformed and mixed-currency prices", () => {
  for (const input of ["€1.234", "€12 34,56", "12 34,56 EUR", "CHF 1’23.50", "$100–€200", "¥100–170,00,50", "€1.234–2.345"]) {
    assert.equal(parseSelection(input), null, input);
  }
});
