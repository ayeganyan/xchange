(function (root, factory) {
  const parser = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = parser;
  } else {
    root.CurrencySelection = parser;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const amount = "([+-]?(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d{1,3}(?:\\.\\d{3})+,\\d+|\\d+(?:[.,]\\d+)?))";
  const currencies = [
    {
      currency: "USD",
      prefix: ["US\\$", "\\$", "\\bUSD\\b", "\\bUS\\s+dollars?\\b"],
      suffix: ["USD\\b", "US\\s+dollars?\\b", "dollars?\\b", "\\$"]
    },
    {
      currency: "JPY",
      prefix: ["JP[¥￥]", "[¥￥]", "\\bJPY\\b", "\\bJapanese\\s+yen\\b"],
      suffix: ["JPY\\b", "Japanese\\s+yen\\b", "yen\\b", "[¥￥]"]
    },
    {
      currency: "CNY",
      prefix: ["CN[¥￥]", "\\bCNY\\b", "\\bRMB\\b", "\\bChinese\\s+yuan\\b"],
      suffix: ["CNY\\b", "RMB\\b", "Chinese\\s+yuan\\b", "yuan\\b", "元"]
    }
  ];

  // 20 most traded currencies in the BIS 2025 survey, plus Armenian dram.
  // Ambiguous symbols (kr, R, Fr) require a currency code or full name.
  const additional = [
    ["EUR", ["€"], "euros?"],
    ["GBP", ["£"], "(?:British\\s+)?pounds?(?:\\s+sterling)?"],
    ["CHF", [], "Swiss\\s+francs?"],
    ["AUD", ["AU\\$", "A\\$"], "Australian\\s+dollars?"],
    ["CAD", ["CA\\$", "C\\$"], "Canadian\\s+dollars?"],
    ["HKD", ["HK\\$"], "Hong\\s+Kong\\s+dollars?"],
    ["SGD", ["SG\\$", "S\\$"], "Singapore\\s+dollars?"],
    ["INR", ["₹"], "(?:Indian\\s+)?rupees?"],
    ["KRW", ["₩"], "(?:South\\s+)?Korean\\s+won"],
    ["SEK", [], "Swedish\\s+kron(?:a|or)"],
    ["MXN", ["MX\\$", "Mex\\$"], "Mexican\\s+pesos?"],
    ["NZD", ["NZ\\$"], "New\\s+Zealand\\s+dollars?"],
    ["NOK", [], "Norwegian\\s+kron(?:e|er)"],
    ["TWD", ["NT\\$"], "(?:New\\s+)?Taiwan\\s+dollars?"],
    ["BRL", ["R\\$"], "Brazilian\\s+rea(?:l|is)"],
    ["ZAR", [], "(?:South\\s+African\\s+)?rand"],
    ["PLN", ["zł"], "(?:Polish\\s+)?zloty"],
    ["AMD", ["֏", "դրամ"], "(?:Armenian\\s+)?drams?"]
  ];
  for (const [currency, symbols, name] of additional) {
    currencies.push({
      currency,
      prefix: [currency, ...symbols, name],
      suffix: [currency, ...symbols, name]
    });
  }
  const sourceCurrencies = Object.freeze(currencies.map(({ currency }) => currency));

  function parseSelection(selection) {
    const text = String(selection || "").trim();
    if (!text || text.length > 500) return null;

    const candidates = [];

    for (const definition of currencies) {
      for (const marker of definition.prefix) {
        const match = text.match(
          new RegExp(`(?<![\\p{L}\\d])(?:${marker})\\s*${amount}(?![.,]\\d)\\s*([kK])?(?![\\d\\p{L}])`, "iu")
        );
        if (match) candidates.push(result(match, definition.currency));
      }

      for (const marker of definition.suffix) {
        const match = text.match(
          new RegExp(`(?<![\\p{L}\\d.,])${amount}\\s*([kK])?\\s*(?:${marker})(?![\\p{L}\\d])`, "iu")
        );
        if (match) candidates.push(result(match, definition.currency));
      }
    }

    candidates.sort((a, b) => a.index - b.index || b.length - a.length);
    const first = candidates[0];
    return first ? { amount: first.amount, currency: first.currency } : null;
  }

  function result(match, currency) {
    const raw = match[1];
    let normalized = raw;
    if (raw.includes(",") && raw.includes(".")) {
      normalized = raw.lastIndexOf(",") > raw.lastIndexOf(".")
        ? raw.replaceAll(".", "").replace(",", ".")
        : raw.replaceAll(",", "");
    } else if (raw.includes(",")) {
      // Keep the existing interpretation of 1,234 as grouped thousands.
      normalized = /^[+-]?\d{1,3}(?:,\d{3})+$/.test(raw)
        ? raw.replaceAll(",", "")
        : raw.replace(",", ".");
    }
    const value = Number(normalized);
    return {
      amount: value * (match[2] ? 1000 : 1),
      currency,
      index: match.index,
      length: match[0].length
    };
  }

  return { parseSelection, sourceCurrencies };
});
