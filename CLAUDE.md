# Demo Web — Autoservis Pelhřimov — Jan Daňhel

Toto je demo web vytvořený agenturou WebZítra.
Cíl: Ukázat firmě, jak by mohl vypadat jejich nový profesionální web.

## Čti BRIEF.md
Veškerý obsah, informace o firmě, seznam obrázků a pokyny najdeš v **BRIEF.md**.
Začni tam.

## Tech stack
- HTML5, CSS3, vanilla JavaScript — **ŽÁDNÉ frameworky**
- System fonts (Inter via Google Fonts nebo system-ui)
- Netlify hosting (auto-deploy z main branch)
- Formuláře: Netlify Forms (`data-netlify="true"`)

## Pravidla
- **Čeština**, vykání, `&nbsp;` před jednopísmennými předložkami (k, s, v, z, o, u, i, a)
- Ceny v **CZK** (realistické pro český trh a obor firmy)
- Responzivní: **mobile-first**, breakpointy 1024px, 768px, 480px
- **Dark/light mode** — CSS custom properties jsou připravené v style.css
- **WCAG AA** kontrasty — barvy v CSS proměnných jsou accessibility-safe
- Obrázky z **img/** adresáře, ne externe
- Placeholder texty (Lorem ipsum, "Vaše firma") = **zakázané** — vše přepiš reálným obsahem

## Struktura
- `index.html` — hlavní stránka (šablona firma)
- `css/style.css` — styly s CSS custom properties (barvy hotové)
- `js/main.js` — interaktivita (dark mode, hamburger, scroll)
- `img/` — stažené fotky z webu firmy
- `BRIEF.md` — obsah a pokyny

## Git workflow
```bash
# Po dokončení:
git add -A
git commit -m "Demo web — Autoservis Pelhřimov — Jan Daňhel"
git push
```
Netlify auto-deploy se postará o zbytek. Web je live za ~30s.

## Deploy URL
https://wz-demo-autoservis-pelhrimov-jan-danhe.netlify.app

## Build, ceník a měření (od 21. 9. 2026)
- Web se na Vercelu **sestavuje**: `node scripts/build.mjs` → `dist/` (vercel.json `buildCommand` + `outputDirectory`). Deploy z `main`. Lokálně: `node scripts/build.mjs` a servírovat `dist/`.
- **Ceny se mění jen v `data/obsah.json`**, normálně přes admin `/admin/` (→ `app.webzitra.cz/api/client-content` → commit do main → Vercel přestaví web). Build je vypíše do karet ceníku (`data-cena`), částek v FAQ (`data-castka`), FAQ a nabídek ve strukturovaných datech (úvod + podstránky) a do `llms.txt`. **Ceny v HTML ručně neměnit**, build je přepíše. Neplatný obsah build zastaví a na webu zůstane poslední funkční verze.
- Měření: `scripts/wz-analytics.html` vkládá build do všech stránek kromě `/admin/`, měří jen na produkční doméně. Kliky ve tvaru `skupina:typ:místo` (např. `kontakt:telefon:lista`), statistiky z `client_site_stats` (platforma webzitra-v2, tabulka `client_site_events`, slug `autoservis-pelhrimov`).
- Admin `/admin/`: přístupový kód = `client_sites.admin_key` (Lukáš má v `~/.claude/ops/klienti/autoservis-pelhrimov-admin.txt`).
