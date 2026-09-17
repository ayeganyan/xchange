(function (root, factory) {
  const parser = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = parser;
  } else {
    root.CurrencySelection = parser;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

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

  const markers = currencies.flatMap(({ currency, prefix, suffix }) =>
    [...new Set([...prefix, ...suffix])].map(pattern => ({ currency, pattern }))
  );
  const markerPattern = markers.map(({ pattern }) => `(?:${pattern})`).join("|");
  const markerCurrency = text => markers.find(({ pattern }) =>
    new RegExp(`^(?:${pattern})$`, "iu").test(text)
  )?.currency;
  const separators = /^[\s]*[-‐‑‒–—―−~〜～][\s]*$/u;
  // Capture the entire numeric token before validating it, never a valid fragment.
  const numberPattern = "[+-]?\\d(?:[\\d.,'’]|[ \\u00a0\\u202f]+(?=\\d))*";
  const endpointPattern = new RegExp(
    `(?<![\\p{L}\\d.,'’])(?<sign>[+-])?(?<prefix>${markerPattern})?\\s*` +
    `(?<number>${numberPattern})\\s*(?<multiplier>k)?` +
    `(?:\\s*(?<suffix>${markerPattern}))?(?![\\p{L}\\d.,'’])`, "giu"
  );

  function parseNumber(raw) {
    let normalized = raw;
    if (/[ '’\u00a0\u202f]/u.test(raw)) {
      if (!/^[+-]?\d{1,3}([ '’\u00a0\u202f])\d{3}(?:\1\d{3})*(?:[.,]\d+)?$/u.test(raw)) return null;
      normalized = raw.replace(/[ '’\u00a0\u202f]/gu, "").replace(",", ".");
    } else if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)) {
      normalized = raw.replaceAll(",", "");
    } else if (/^[+-]?\d{1,3}(?:\.\d{3})+,\d+$/.test(raw)) {
      normalized = raw.replaceAll(".", "").replace(",", ".");
    } else if (/^[+-]?\d{1,3}(?:\.\d{3}){2,}$/.test(raw)) {
      normalized = raw.replaceAll(".", "");
    } else if (/^[+-]?\d+(?:[.,]\d+)?$/.test(raw)) {
      // A lone dot with three trailing digits could mean decimal or grouping.
      if (/^[+-]?[1-9]\d{0,2}\.\d{3}$/.test(raw)) return null;
      normalized = raw.replace(",", ".");
    } else return null;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  function parseSelection(selection) {
    const text = String(selection || "").trim();
    if (!text || text.length > 500) return null;
    const endpoints = [...text.matchAll(endpointPattern)].map(match => {
      const { prefix, suffix, number, multiplier, sign } = match.groups;
      const from = prefix && markerCurrency(prefix);
      const to = suffix && markerCurrency(suffix);
      const parsed = parseNumber(number);
      const value = parsed === null ? null : parsed * (multiplier ? 1000 : 1) * (sign === "-" ? -1 : 1);
      return {
        raw: match[0].trim(),
        currency: from || to,
        amount: value,
        valid: !(from && to && from !== to) && value !== null && Number.isFinite(value),
        index: match.index,
        end: match.index + match[0].length
      };
    });
    for (let i = 0; i < endpoints.length; i++) {
      const first = endpoints[i];
      const second = endpoints[i + 1];
      const gap = second && text.slice(first.end, second.index);
      const attachedHyphen = second && /^\s*$/.test(gap) && second.raw.startsWith("-");
      if (second && (separators.test(gap) || attachedHyphen) && (first.currency || second.currency)) {
        if (!first.valid || !second.valid || (first.currency && second.currency && first.currency !== second.currency)) return null;
        return { amount: first.amount, endAmount: attachedHyphen ? -second.amount : second.amount, currency: first.currency || second.currency };
      }
      if (first.currency) {
        return first.valid ? { amount: first.amount, currency: first.currency } : null;
      }
    }
    return null;
  }

  return { parseSelection, sourceCurrencies };
});
