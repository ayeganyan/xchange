const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSelection } = require("../parser.js");

const examples = [
  ["100usd", 100, "USD"],
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
  ["100元", 100, "CNY"]
];

for (const [input, amount, currency] of examples) {
  test(`parses ${input}`, () => {
    assert.deepEqual(parseSelection(input), { amount, currency });
  });
}

test("rejects text without a supported currency", () => {
  assert.equal(parseSelection("100"), null);
  assert.equal(parseSelection("100 EUR"), null);
  assert.equal(parseSelection("price is $100"), null);
});
