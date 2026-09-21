# xchange - Currency Converter

Select a price to see an estimate in your currency.

A tiny Chrome extension that converts selected amounts in USD, EUR, JPY, GBP, CNY, CHF, AUD, CAD, HKD, SGD, INR, KRW, SEK, MXN, NZD, NOK, TWD, BRL, ZAR, PLN, or AMD to your preferred currency.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose this folder.
4. Click xchange in Chrome’s extensions menu (or pin its icon to the toolbar). Choose your target currency under **Convert to**. EUR is the default; your choice saves automatically on this device.
5. Select an amount on any normal web page. The interpreted source and approximate conversion appear beside it with currency codes. Long results wrap onto two lines.

After updating an unpacked installation, click **Reload** in `chrome://extensions` and refresh existing web pages to load the updated content script.

The currency picker uses a bundled list of Frankfurter currencies, so settings work offline. Exchange-rate requests still require a connection unless the rate is already cached. Results use the target currency’s standard decimal precision; selecting the same source and target currency returns the original amount without a rate request.

Chrome blocks extensions on its own internal pages, including `chrome://extensions`; test it on a regular `http://` or `https://` page.

Supported sources: USD, EUR, JPY, GBP, CNY, CHF, AUD, CAD, HKD, SGD, INR, KRW, SEK, MXN, NZD, NOK, TWD, BRL, ZAR, PLN, and AMD. The first 20 are the most traded currencies by turnover in the [BIS April 2025 survey, Table 25.2](https://www.bis.org/publications/commentary-otc-derivatives/statistics-rpfx25-fx-annex.pdf); Armenian dram is included in addition.

Every source supports its currency code before or after an amount, case-insensitively: `EUR 100`, `100eur`, `50,000 AMD`. Common symbols and names also work: `€100`, `£100`, `A$100`, `HK$100`, `₹100`, `₩100`, `R$100`, `100 zł`, `֏50,000`, `50,000 դրամ`, `100 Armenian drams`.

Numbers support decimal points or decimal commas: `159,00zł`, `1,234.56 USD`, and `1.234,56 EUR`. A comma followed by exactly three digits in a valid thousands grouping keeps its existing meaning (`1,234` is 1234); a lone dot with three trailing digits and one to three nonzero-leading integer digits is rejected as ambiguous (`1.234` could mean 1.234 or 1234). Spaces, nonbreaking spaces, and apostrophes also work as thousands separators: `€1 234,56`, `CHF 1’234.50`. Malformed groupings are rejected instead of partially converted.

`k` means thousand and applies only to the number it follows. Ranges convert both endpoints: `¥150k–170k` means JPY 150,000–170,000, while `¥150–170k` means JPY 150–170,000. A currency marker on either endpoint applies to both; ranges with different explicit currencies are rejected. Supported separators are `-`, `‐`, `‑`, `‒`, `–`, `—`, `―`, `−`, `~`, `〜`, and `～`, with any amount of surrounding whitespace. If a larger selection contains unrelated prices, xchange converts the first recognized price or range.

`$` and unqualified “dollars” mean USD; `¥` means JPY. Use `CNY`, `RMB`, `CN¥`, `yuan`, or `元` for Chinese yuan. Use explicit markers such as `CA$`, `AU$`, `SG$`, `NZ$`, `MX$`, and `NT$` for other dollar currencies. Ambiguous `kr`, `R`, and `Fr` require a code or full currency name.

Rates come from the free Frankfurter API and are reference rates rather than trading quotes. The extension sends only the source and target currency codes when retrieving a rate; selected page text and amounts are not sent. Your target currency preference is stored locally using Chrome extension storage.

## Privacy

Privacy notice: [ayeganyan.github.io/xchange/privacy.html](https://ayeganyan.github.io/xchange/privacy.html).

The privacy page is published by GitHub Pages from the `docs/` directory on `main`.

## Test

```sh
node --test
```

## Package for Chrome Web Store

Run the packaging script (requires Node.js, `zip`, and `unzip`):

```sh
./scripts/package.sh
```

It reads the version from `manifest.json` and creates `dist/xchange-<version>.zip` with only runtime files and icons. The manifest is at the ZIP root. Running it again replaces the archive for that version. The `dist/` folder is ignored by Git.

## Release

After the [one-time publishing setup](docs/releases.md), run
`./scripts/release.sh patch` (or `minor` / `major`) from a clean, synchronized
`main` branch. The script tests, bumps and commits the manifest version, then
pushes a numbered tag. GitHub Actions packages and submits the update to Chrome
Web Store for automatic publishing after approval. See the release guide for
configuration and recovery instructions.
