(function () {
  "use strict";

  const loadedFlag = "__selectToEurLoaded";
  if (globalThis[loadedFlag]) return;
  globalThis[loadedFlag] = true;

  let tooltip;
  let requestId = 0;
  let selectedText;

  document.addEventListener("mouseup", handleSelection);
  document.addEventListener("keyup", (event) => {
    if (event.key === "Shift" || event.key.startsWith("Arrow")) handleSelection();
  });
  document.addEventListener("mousedown", (event) => {
    if (tooltip && !event.composedPath().includes(tooltip)) hideTooltip();
  });
  document.addEventListener("selectionchange", () => {
    if (selectedText !== undefined && window.getSelection()?.toString() !== selectedText) {
      hideTooltip();
    }
  });
  window.addEventListener("scroll", hideTooltip, true);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.targetCurrency) {
      hideTooltip();
      handleSelection();
    }
  });

  function handleSelection(event) {
    if (tooltip && event?.composedPath().includes(tooltip)) return;

    const currentRequest = ++requestId;
    setTimeout(() => {
      if (currentRequest !== requestId) return;
      const selection = window.getSelection();
      const text = selection?.toString();
      const parsed = globalThis.CurrencySelection.parseSelection(text);
      if (!parsed || !selection.rangeCount) {
        hideTooltip();
        return;
      }

      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) {
        hideTooltip();
        return;
      }

      selectedText = text;
      showTooltip(rect, "Converting…");

      chrome.runtime.sendMessage(
        { type: "convert", ...parsed },
        (response) => {
          if (currentRequest !== requestId) return;
          if (window.getSelection()?.toString() !== text) {
            hideTooltip();
            return;
          }

          if (chrome.runtime.lastError || !response?.ok) {
            showTooltip(rect, "Rate unavailable");
            return;
          }

          const sourceFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 20 });
          const targetFormat = new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: response.targetCurrency,
            currencyDisplay: "code"
          });
          const source = `${parsed.currency} ${sourceFormat.format(parsed.amount)}` +
            (parsed.endAmount === undefined ? "" : `–${sourceFormat.format(parsed.endAmount)}`);
          const target = targetFormat.format(response.value) +
            (response.endValue === undefined ? "" : `–${targetFormat.format(response.endValue)}`);
          showTooltip(rect, source, `≈ ${target}`);
        }
      );
    }, 0);
  }

  function showTooltip(rect, label, converted) {
    hideTooltip(false);

    tooltip = document.createElement("span");
    tooltip.style.cssText = [
      "all: initial",
      "user-select: none",
      "pointer-events: none",
      "position: fixed",
      "z-index: 2147483647",
      `left: ${Math.min(Math.max(8, rect.left), window.innerWidth - 160)}px`,
      `top: ${Math.min(window.innerHeight - 48, rect.bottom + 8)}px`
    ].join(";");

    const shadow = tooltip.attachShadow({ mode: "closed" });
    const result = document.createElement("div");
    result.setAttribute("role", "status");
    for (const text of converted ? [label, converted] : [label]) {
      const line = document.createElement("span");
      line.textContent = text;
      result.append(line);
    }
    result.style.cssText = [
      "border-radius: 8px",
      "background: #172019",
      "color: #f4f7f4",
      "box-shadow: 0 4px 16px rgba(0,0,0,.24)",
      "font: 600 14px/1.2 system-ui, sans-serif",
      "user-select: none",
      "padding: 9px 11px",
      "display: flex",
      "flex-wrap: wrap",
      "gap: 4px 6px",
      "width: max-content",
      "box-sizing: border-box",
      `max-width: ${Math.max(0, Math.min(420, window.innerWidth - 16))}px`,
      "overflow-wrap: anywhere"
    ].join(";");

    shadow.append(result);
    document.documentElement.append(tooltip);
    const bounds = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - bounds.width - 8))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - bounds.height - 8))}px`;
  }

  function hideTooltip(cancelRequest = true) {
    tooltip?.remove();
    tooltip = undefined;
    if (cancelRequest) {
      requestId += 1;
      selectedText = undefined;
    }
  }
})();
