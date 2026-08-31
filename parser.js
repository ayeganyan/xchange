(function (root, factory) {
  const parser = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = parser;
  } else {
    root.CurrencySelection = parser;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const amount = "([+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)";
  const currencies = [
    {
      currency: "USD",
      prefix: ["US\\$", "\\$", "USD\\b", "US\\s+dollars?\\b"],
      suffix: ["USD\\b", "US\\s+dollars?\\b", "dollars?\\b", "\\$"]
    },
    {
      currency: "JPY",
      prefix: ["JP[¥￥]", "[¥￥]", "JPY\\b", "Japanese\\s+yen\\b"],
      suffix: ["JPY\\b", "Japanese\\s+yen\\b", "yen\\b", "[¥￥]"]
    },
    {
      currency: "CNY",
      prefix: ["CN[¥￥]", "CNY\\b", "RMB\\b", "Chinese\\s+yuan\\b"],
      suffix: ["CNY\\b", "RMB\\b", "Chinese\\s+yuan\\b", "yuan\\b", "元"]
    }
  ];

  function parseSelection(selection) {
    const text = String(selection || "").trim();
    if (!text || text.length > 80) return null;

    for (const definition of currencies) {
      for (const marker of definition.prefix) {
        const match = text.match(new RegExp(`^(?:${marker})\\s*${amount}$`, "i"));
        if (match) return result(match[1], definition.currency);
      }

      for (const marker of definition.suffix) {
        const match = text.match(new RegExp(`^${amount}\\s*(?:${marker})$`, "i"));
        if (match) return result(match[1], definition.currency);
      }
    }

    return null;
  }

  function result(rawAmount, currency) {
    const value = Number(rawAmount.replaceAll(",", ""));
    return Number.isFinite(value) ? { amount: value, currency } : null;
  }

  return { parseSelection };
});
