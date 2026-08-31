# xchange

A tiny Chrome extension that converts a selected USD, JPY, or CNY amount to euros.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose this folder.
4. Select an amount on any normal web page. The euro value appears beside it.

Chrome blocks extensions on its own internal pages, including `chrome://extensions`; test it on a regular `http://` or `https://` page.

Examples: `$100`, `100usd`, `¥100`, `100 JPY`, `CN¥100`, `RMB 100`, `100 yuan`.

`¥` is treated as Japanese yen because the symbol is ambiguous. Use `CNY`, `RMB`, `CN¥`, `yuan`, or `元` for Chinese yuan.

Rates come from the free Frankfurter API and are reference rates rather than trading quotes. The extension sends only the three-letter currency code when retrieving a rate; selected page text is not sent.

## Test

```sh
node --test
```
