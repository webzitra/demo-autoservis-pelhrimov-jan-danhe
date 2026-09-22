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

## Build, obsah z adminu, poptávky a měření (od 22. 9. 2026)
- Web se na Vercelu **sestavuje**: `node scripts/build.mjs` → `dist/` (vercel.json `buildCommand` + `outputDirectory`). Deploy z `main`. Lokálně: `node scripts/build.mjs` a servírovat `dist/`.
- **Ceník, otevírací dobu a oznámení mění klient v `/admin/`** → uloží se na platformu (`client_sites.content`) → platforma spustí nové nasazení → build si obsah stáhne z `https://app.webzitra.cz/api/client-content?site=autoservis-pelhrimov` a vypíše ho do karet ceníku (`data-cena`), částek (`data-castka`), otevírací doby (`data-doba`), FAQ a strukturovaných dat, `llms.txt` a lišty s oznámením. `data/obsah.json` v repu = jen výchozí hodnoty pro sekce, které v adminu uložené nejsou. **Ceny ani dobu v HTML ručně neměnit**, build je přepíše. Na Vercelu nedostupné API nebo neplatný obsah build zastaví, na webu zůstane poslední verze.
- **Formulář** posílá poptávky na `app.webzitra.cz/api/client-leads` (WZ-LEADS): uloží se do DB (`client_site_leads`) a pak odejdou e-mailem na `client_sites.notify_email`. Klient je vidí v `/admin/` → Poptávky.
- Měření: `scripts/wz-analytics.html` vkládá build do všech stránek kromě `/admin/`, měří jen na produkční doméně. Kliky `skupina:typ:místo` (např. `kontakt:telefon:lista`), sekce se počítá po 1 s na obrazovce.
- Admin `/admin/`: heslo = `client_sites.admin_key` (Lukáš má v `~/.claude/ops/klienti/autoservis-pelhrimov-admin.txt`).
