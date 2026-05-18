# Decorafit · Orçamento FF&E

Chrome extension for interior designers to capture products from Brazilian e-commerce stores and generate professional PDF quotations.

## What it does

The extension injects a floating **"⊕ Orçamento"** button on every webpage. On supported product pages it automatically extracts the product name, brand, SKU, price, and image. Captured items are organized by category in a popup interface, and can be exported as a formatted A4 PDF quotation under the Decorafit visual identity. Projects can be saved to an in-browser library and reloaded at any time.

## Features

- One-click product capture from 18+ Brazilian retailers
- Automatic extraction of name, brand, SKU, price, and image
- Smart category auto-detection based on product name
- Popup interface with per-item quantity controls and manual entry form
- Budget total calculated in real time, grouped by category
- Professional PDF generation (A4, multi-page, Decorafit branding)
- Project library: save, reload, rename, and delete past quotations

## Supported stores

| Store | Domain |
|-------|--------|
| Leroy Merlin | leroymerlin.com.br |
| Telhanorte | telhanorte.com.br |
| Obra Fácil | obrafacil.com.br |
| ABC Construção | abcconstrucao.com.br |
| Andra | andra.com.br |
| Inspire Home | inspirehome.com.br |
| Yamamura | yamamura.com.br |
| Bela Metais | belametais.com.br |
| Tok&Stok | tokstok.com.br |
| WestWing | westwing.com.br |
| Boobam | boobam.com.br |
| Camicado | camicado.com.br |
| Muma | muma.com.br |
| Dexco | dexco.com.br |
| Deca | deca.com.br |
| Electrolux | electrolux.com.br |
| FastShop | fastshop.com.br |
| Brastemp | brastemp.com.br |
| Samsung | samsung.com/br |

The extraction pipeline also works on any site via JSON-LD, Open Graph meta tags, and text-node price scanning as fallbacks.

## Installation

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the `decorafit-ffe/` directory inside this repo.
6. The extension icon appears in the Chrome toolbar.

## Usage

1. Click the extension icon and enter a **project name** (e.g. *Sala de estar – Cliente X*).
2. Browse to a product page on any supported store.
3. Click the **⊕ Orçamento** button that appears at the bottom-right of the page.
4. The product is captured and added to the popup list automatically.
5. In the popup, adjust **category**, **quantity**, or any field as needed.
6. Repeat for all products in your specification.
7. Click **Gerar PDF** to open a print-ready PDF quotation in a new tab.
8. Click **📂** to open the project library where you can save, reload, or delete projects.

## Product categories

| Key | Label |
|-----|-------|
| `revestimentos` | Revestimentos |
| `loucas-metais` | Louças & Metais |
| `iluminacao` | Iluminação |
| `eletros` | Eletros |
| `moveis` | Móveis |
| `decoracao-enxoval` | Decoração e Enxoval |
| `outros` | Outros |

## Project structure

```
decorafit-ffe/
├── manifest.json   # Extension manifest (Manifest V3)
├── background.js   # Service worker — handles extension lifecycle events
├── content.js      # Injected on every page — floating button and product extraction
├── content.css     # Styles for the floating button and toast notifications
├── popup.html      # Popup UI markup
├── popup.js        # Popup logic — product list, manual entry, totals, PDF trigger
├── print.html      # PDF template
├── print.js        # PDF rendering — loads products and formats the quotation
├── library.html    # Project library UI markup
├── library.js      # Library logic — save, load, rename, delete projects
└── icons/          # Extension icons (16 × 16, 48 × 48, 128 × 128)
```

## Tech stack

- **Vanilla JavaScript** (ES6+), HTML5, CSS3 — no build tools or bundlers
- **Chrome Extension Manifest V3** — service worker, content scripts, storage API
- **Chrome Storage API** — persists products and projects locally in the browser
- **Google Fonts** — Cormorant Garamond, Jost, Poppins