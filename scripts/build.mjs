// Sestavení webu pro Vercel (buildCommand v vercel.json, výstup dist/).
//
// 1. Zkopíruje web do dist/ (bez interních souborů).
// 2. Ceník z data/obsah.json vypíše do HTML: karty ceníku (data-cena),
//    částky v textu (data-castka), FAQ ve strukturovaných datech a ceny
//    v nabídkách JSON-LD (úvod + podstránky služeb) a do llms.txt.
//    Ceny tak vidí Google i AI přímo v HTML, bez JavaScriptu.
// 3. Do všech stránek kromě /admin/ vloží měřicí snippet (scripts/wz-analytics.html).
//
// data/obsah.json upravuje admin (/admin/ → app.webzitra.cz/api/client-content
// → commit do main). Neplatný obsah build ZASTAVÍ s chybou a Vercel nechá na
// webu poslední funkční verzi. Zdrojové HTML obsahuje aktuální ceny jako
// fallback, takže i bez buildu je web správně.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "dist");
const VYNECHAT = new Set([
  ".git", ".github", ".claude", ".netlify", "node_modules", "dist", "scripts",
  "BRIEF.md", "CLAUDE.md", "README.md", "netlify.toml", "vercel.json",
  ".vercelignore", ".gitignore", "package.json", ".DS_Store",
]);

// Položky ceníku: pevné názvy a jednotky; admin mění jen cenu / „od“ / text.
const POLOZKY = {
  "mechanicke-prace": { jednotka: "Kč/hod", jenCislo: true,
    llms: "Mechanické práce: {cena}, díly a náplně zvlášť" },
  diagnostika: { jednotka: "Kč", jenCislo: true,
    llms: "Diagnostika: {cena} (vyčtení chybových kódů řídicích jednotek všech značek a návrh řešení)" },
  prezuti: { jednotka: "Kč",
    llms: "Přezutí a vyvážení osobního vozu: {cena}, konečná cena podle počtu vyvažovacích závaží" },
  geometrie: { jednotka: "Kč", llms: "Geometrie kol laserovým přístrojem: {cena}" },
  klimatizace: { jednotka: "Kč", llms: "Servis klimatizace: {cena}, cenu řekneme vždy předem" },
  stk: { jednotka: "Kč",
    llms: "Příprava na STK: {cena}; vůz převezmeme, připravíme, odvezeme na STK a přivezeme zpět" },
};
// Pořadí řádků ceníku v llms.txt.
const LLMS_PORADI = ["mechanicke-prace", "diagnostika", "prezuti", "geometrie", "klimatizace", "stk"];

// Nabídky v JSON-LD: cesta služby → položka ceníku.
const SLUZBA_POLOZKA = {
  "/udrzba-a-servis/": "mechanicke-prace",
  "/diagnostika/": "diagnostika",
  "/pneuservis/": "prezuti",
  "/geometrie/": "geometrie",
  "/priprava-stk/": "stk",
};
const KLIMATIZACE_NAZEV = "Servis klimatizace";

// FAQ ve strukturovaných datech, jejichž odpověď závisí na ceníku.
const FAQ_Z_VIDITELNE_ODPOVEDI = { "index.html": "Kolik stojí diagnostika a hodina práce?" };
const FAQ_SABLONY = {
  "pneuservis/index.html": {
    "Kolik stojí přezutí pneumatik?": (c) =>
      `Přezutí a vyvážení osobního vozu stojí ${c.text("prezuti")}, konečná cena závisí na počtu vyvažovacích závaží. ` +
      "Pro přesnou kalkulaci nás kontaktujte telefonicky nebo se zastavte přímo v servisu.",
  },
};

const MESICE = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
const TEXT_RE = /^[\p{L}\p{N} .,:;()/+–-]{1,30}$/u;

function chyba(zprava) {
  throw new Error(`Obsah webu (data/obsah.json): ${zprava}`);
}

function nactiObsah() {
  let obsah;
  try {
    obsah = JSON.parse(readFileSync(join(ROOT, "data/obsah.json"), "utf8"));
  } catch (e) {
    chyba(`nejde přečíst (${e.message})`);
  }
  const upraveno = new Date(obsah?.upraveno);
  if (Number.isNaN(upraveno.getTime())) chyba("chybí nebo je neplatné „upraveno“");
  const ceny = obsah?.ceny;
  if (!ceny || typeof ceny !== "object") chyba("chybí „ceny“");
  for (const klic of Object.keys(ceny)) if (!POLOZKY[klic]) chyba(`neznámá položka „${klic}“`);
  for (const [klic, def] of Object.entries(POLOZKY)) {
    const p = ceny[klic];
    if (!p || typeof p !== "object") chyba(`chybí položka „${klic}“`);
    if (typeof p.od !== "boolean") chyba(`„${klic}.od“ musí být ano/ne`);
    if (p.cena === null) {
      if (def.jenCislo) chyba(`„${klic}“ musí mít cenu v Kč`);
      if (typeof p.text !== "string" || !TEXT_RE.test(p.text.trim())) {
        chyba(`„${klic}“ bez ceny potřebuje krátký text (max 30 znaků, bez speciálních znaků)`);
      }
    } else if (!Number.isInteger(p.cena) || p.cena < 1 || p.cena > 1_000_000) {
      chyba(`„${klic}.cena“ musí být celé číslo 1–1 000 000`);
    }
  }
  return { upraveno, ceny };
}

const tisice = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const escHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function formatovac(ceny) {
  const p = (k) => ceny[k];
  return {
    // „od 1 000 Kč“, „550 Kč/hod“, „dle opravy“ — v HTML s nezlomitelnými mezerami
    html(k) {
      const x = p(k);
      if (x.cena === null) return escHtml(x.text.trim());
      return `${x.od ? "od " : ""}${tisice(x.cena).replace(/ /g, "&nbsp;")}&nbsp;${POLOZKY[k].jednotka}`;
    },
    text(k) {
      const x = p(k);
      if (x.cena === null) return x.text.trim();
      return `${x.od ? "od " : ""}${tisice(x.cena)} ${POLOZKY[k].jednotka}`;
    },
    // částka bez jednotky za hodinu („Diagnostika stojí 1 000 Kč“)
    castkaHtml(k) {
      const x = p(k);
      if (x.cena === null) return escHtml(x.text.trim());
      return `${x.od ? "od " : ""}${tisice(x.cena).replace(/ /g, "&nbsp;")}&nbsp;Kč`;
    },
  };
}

function nahradSpany(html, atribut, render, soubor) {
  let pocet = 0;
  const re = new RegExp(`(<span\\b[^>]*\\b${atribut}="([a-z-]+)"[^>]*>)([^<]*)(</span>)`, "g");
  const out = html.replace(re, (_, open, klic, _stary, close) => {
    if (!POLOZKY[klic]) throw new Error(`${soubor}: ${atribut}="${klic}" není v ceníku`);
    pocet++;
    return open + render(klic) + close;
  });
  return { out, pocet };
}

function textZHtml(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function viditelnaOdpoved(html, otazka) {
  for (const m of html.matchAll(/<summary class="faq-question">([\s\S]*?)<\/summary>\s*<div class="faq-answer">([\s\S]*?)<\/div>/g)) {
    if (textZHtml(m[1]) === otazka) return textZHtml(m[2]);
  }
  throw new Error(`index.html: viditelná FAQ „${otazka}“ nenalezena`);
}

function nastavCenu(offer, klic, ceny) {
  const { price, priceCurrency, priceSpecification, ...zbytek } = offer;
  const x = ceny[klic];
  if (x.cena === null) return zbytek;
  const cena = String(x.cena);
  if (klic === "mechanicke-prace") {
    return {
      ...zbytek, priceCurrency: "CZK",
      priceSpecification: {
        "@type": "UnitPriceSpecification", [x.od ? "minPrice" : "price"]: cena, priceCurrency: "CZK",
        unitCode: "HUR", unitText: "hodina", valueAddedTaxIncluded: true,
      },
    };
  }
  if (x.od) {
    return {
      ...zbytek, priceCurrency: "CZK",
      priceSpecification: { "@type": "PriceSpecification", minPrice: cena, priceCurrency: "CZK", valueAddedTaxIncluded: true },
    };
  }
  return { ...zbytek, price: cena, priceCurrency: "CZK" };
}

function cestaZUrl(url) {
  try { return new URL(url).pathname; } catch { return null; }
}

function upravJsonLd(data, ceny, soubor, faqTexty) {
  let nabidek = 0;
  const walk = (v, hloubka) => {
    if (Array.isArray(v)) return v.map((x) => walk(x, hloubka + 1));
    if (!v || typeof v !== "object") return v;
    let o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, hloubka + 1)]));
    if (o["@type"] === "Offer") {
      const cesta = cestaZUrl(o.itemOffered?.url);
      const klic = cesta ? SLUZBA_POLOZKA[cesta] : o.itemOffered?.name === KLIMATIZACE_NAZEV ? "klimatizace" : null;
      if (klic) { o = nastavCenu(o, klic, ceny); nabidek++; }
    }
    // Kořenová služba podstránky (ne vnořená itemOffered v nabídkách úvodu):
    // nabídku s cenou má, jen když má služba v ceníku cenu.
    if (hloubka === 0 && o["@type"] === "Service" && !Array.isArray(o.offers)) {
      const klic = SLUZBA_POLOZKA[cestaZUrl(o.url)];
      if (klic && (o.offers || ceny[klic].cena !== null)) {
        const offer = nastavCenu(o.offers ?? { "@type": "Offer" }, klic, ceny);
        if (Object.keys(offer).length > 1) o.offers = offer;
        else delete o.offers;
        nabidek++;
      }
    }
    if (o["@type"] === "Question" && faqTexty[o.name] !== undefined) {
      o.acceptedAnswer = { ...o.acceptedAnswer, text: faqTexty[o.name] };
      faqTexty[o.name] = null; // označit jako použité
    }
    return o;
  };
  return { data: walk(data, 0), nabidek };
}

function zpracujHtml(soubor, html, ceny, fmt, snippet) {
  let out = html;
  const a = nahradSpany(out, "data-cena", fmt.html, soubor); out = a.out;
  const b = nahradSpany(out, "data-castka", fmt.castkaHtml, soubor); out = b.out;

  const faqTexty = {};
  if (FAQ_Z_VIDITELNE_ODPOVEDI[soubor]) {
    const otazka = FAQ_Z_VIDITELNE_ODPOVEDI[soubor];
    faqTexty[otazka] = viditelnaOdpoved(out, otazka);
  }
  for (const [otazka, sablona] of Object.entries(FAQ_SABLONY[soubor] ?? {})) faqTexty[otazka] = sablona(fmt);

  let nabidek = 0;
  out = out.replace(/(<script type="application\/ld\+json">\n)([\s\S]*?)(\n[ \t]*<\/script>)/g, (_, open, json, close) => {
    const r = upravJsonLd(JSON.parse(json), ceny, soubor, faqTexty);
    nabidek += r.nabidek;
    const text = JSON.stringify(r.data, null, 4).replace(/</g, "\\u003c");
    return open + text.split("\n").map((l) => `    ${l}`).join("\n") + close;
  });
  for (const [otazka, zbyva] of Object.entries(faqTexty)) {
    if (zbyva !== null) throw new Error(`${soubor}: FAQ „${otazka}“ ve strukturovaných datech nenalezena`);
  }

  if (snippet) {
    if (!out.includes("</body>")) throw new Error(`${soubor}: chybí </body>`);
    out = out.replace("</body>", `${snippet}\n</body>`);
  }
  return { out, ceny: a.pocet, castky: b.pocet, nabidek };
}

function llmsTxt(text, ceny, fmt, upraveno) {
  const a = text.indexOf("## Ceník");
  const b = text.indexOf("\n## ", a + 1);
  if (a < 0 || b < 0) throw new Error("llms.txt: sekce „## Ceník“ nenalezena");
  const stav = `${MESICE[upraveno.getUTCMonth()]} ${upraveno.getUTCFullYear()}`;
  const radky = [
    `## Ceník (orientační, včetně DPH, stav ${stav})`,
    ...LLMS_PORADI.map((k) => `- ${POLOZKY[k].llms.replace("{cena}", fmt.text(k))}`),
    "- Cenová kalkulace je zdarma, konečnou cenu vždy potvrdíme předem.",
  ];
  return `${text.slice(0, a)}${radky.join("\n")}\n${text.slice(b)}`;
}

function* soubory(dir) {
  for (const jmeno of readdirSync(dir)) {
    const cesta = join(dir, jmeno);
    if (statSync(cesta).isDirectory()) yield* soubory(cesta);
    else yield cesta;
  }
}

// ── běh ──
const { upraveno, ceny } = nactiObsah();
const fmt = formatovac(ceny);
const snippet = readFileSync(join(ROOT, "scripts/wz-analytics.html"), "utf8").trim();

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const jmeno of readdirSync(ROOT)) {
  if (VYNECHAT.has(jmeno)) continue;
  cpSync(join(ROOT, jmeno), join(OUT, jmeno), {
    recursive: true,
    filter: (src) => !src.endsWith("/.DS_Store"),
  });
}

const souhrn = { ceny: 0, castky: 0, nabidek: 0, stranek: 0 };
for (const cesta of soubory(OUT)) {
  const rel = relative(OUT, cesta);
  if (rel.endsWith(".html")) {
    const jeAdmin = rel.startsWith("admin/");
    const r = zpracujHtml(rel, readFileSync(cesta, "utf8"), ceny, fmt, jeAdmin ? null : snippet);
    writeFileSync(cesta, r.out);
    souhrn.ceny += r.ceny; souhrn.castky += r.castky; souhrn.nabidek += r.nabidek; souhrn.stranek++;
  } else if (rel === "llms.txt") {
    writeFileSync(cesta, llmsTxt(readFileSync(cesta, "utf8"), ceny, fmt, upraveno));
  }
}
// Pojistka proti tiché ztrátě napojení: tolik míst musí build vždy najít.
if (souhrn.ceny !== 6) throw new Error(`čekal jsem 6 cen v ceníku, našel jsem ${souhrn.ceny}`);
if (souhrn.castky !== 2) throw new Error(`čekal jsem 2 částky ve FAQ, našel jsem ${souhrn.castky}`);
if (souhrn.nabidek < 10) throw new Error(`čekal jsem aspoň 10 nabídek v JSON-LD, našel jsem ${souhrn.nabidek}`);

console.log(`Build OK: ${souhrn.stranek} stránek, ceník ${souhrn.ceny}×, částky ${souhrn.castky}×, nabídky JSON-LD ${souhrn.nabidek}×`);
for (const k of LLMS_PORADI) console.log(`  ${k}: ${fmt.text(k)}`);
