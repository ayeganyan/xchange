(function () {
  "use strict";

  const loadedFlag = "__selectToEurLoaded";
  if (globalThis[loadedFlag]) return;
  globalThis[loadedFlag] = true;

  let tooltip;
  let requestId = 0;

  document.addEventListener("mouseup", handleSelection);
  document.addEventListener("keyup", (event) => {
    if (event.key === "Shift" || event.key.startsWith("Arrow")) handleSelection();
  });
  document.addEventListener("mousedown", (event) => {
    if (tooltip && !event.composedPath().includes(tooltip)) hideTooltip();
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

    setTimeout(() => {
      const selection = window.getSelection();
      const parsed = globalThis.CurrencySelection.parseSelection(selection?.toString());
      if (!parsed || !selection.rangeCount) {
        hideTooltip();
        return;
      }

      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) return;

      const currentRequest = ++requestId;
      showTooltip(rect, "Converting…");

      chrome.runtime.sendMessage(
        { type: "convert", ...parsed },
        (response) => {
          if (currentRequest !== requestId) return;

          if (chrome.runtime.lastError || !response?.ok) {
            showTooltip(rect, "Rate unavailable");
            return;
          }

          const formatted = new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: response.targetCurrency,
            currencyDisplay: "code"
          }).format(response.value);
          showTooltip(rect, formatted);
        }
      );
    }, 0);
  }

  function showTooltip(rect, label) {
    hideTooltip(false);

    tooltip = document.createElement("span");
    tooltip.style.cssText = [
      "all: initial",
      "position: fixed",
      "z-index: 2147483647",
      `left: ${Math.min(Math.max(8, rect.left), window.innerWidth - 160)}px`,
      `top: ${Math.min(window.innerHeight - 48, rect.bottom + 8)}px`
    ].join(";");

    const shadow = tooltip.attachShadow({ mode: "closed" });
    const result = document.createElement("div");
    result.setAttribute("role", "status");
    result.textContent = label;
    result.style.cssText = [
      "border-radius: 8px",
      "background: #172019",
      "color: #f4f7f4",
      "box-shadow: 0 4px 16px rgba(0,0,0,.24)",
      "font: 600 14px/1.2 system-ui, sans-serif",
      "padding: 9px 11px",
      "white-space: nowrap"
    ].join(";");

    shadow.append(result);
    document.documentElement.append(tooltip);
  }

  function hideTooltip(cancelRequest = true) {
    tooltip?.remove();
    tooltip = undefined;
    if (cancelRequest) requestId += 1;
  }
})();
