// Sestavení webu pro Vercel (buildCommand v vercel.json, výstup dist/).
//
// 1. Zkopíruje web do dist/ (bez interních souborů).
// 2. Obsah z adminu (ceník, otevírací doba, oznámení) vypíše do HTML:
//    karty ceníku (data-cena), částky v textu (data-castka), otevírací dobu
//    (data-doba), FAQ a nabídky/otevírací dobu ve strukturovaných datech,
//    llms.txt a lištu s oznámením. Google i AI to vidí přímo v HTML.
// 3. Do všech stránek kromě /admin/ vloží měřicí snippet (scripts/wz-analytics.html).
//
// Obsah: admin ho ukládá na platformu (app.webzitra.cz/api/client-content →
// client_sites.content) a platforma spustí nové nasazení. Build si ho stáhne
// z veřejného GET; co v adminu uložené není, doplní z data/obsah.json v repu.
// Na Vercelu nedostupné API = build se ZASTAVÍ (jinak by se nasadily staré
// ceny). Neplatný obsah build taky zastaví, na webu zůstane poslední verze.
// Zdrojové HTML obsahuje aktuální hodnoty jako fallback.

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
const FAQ_Z_VIDITELNE_ODPOVEDI = { "index.html": ["Kolik stojí diagnostika a hodina práce?", "Jaká je vaše otevírací doba?"] };
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

const OBSAH_API = "https://app.webzitra.cz/api/client-content?site=autoservis-pelhrimov";

async function stahniObsah() {
  let zRepa;
  try {
    zRepa = JSON.parse(readFileSync(join(ROOT, "data/obsah.json"), "utf8"));
  } catch (e) {
    chyba(`nejde přečíst (${e.message})`);
  }
  let zAdminu = null;
  try {
    const res = await fetch(OBSAH_API, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    zAdminu = (await res.json()).obsah ?? null;
  } catch (e) {
    if (process.env.VERCEL) {
      throw new Error(`Obsah z adminu nejde stáhnout (${e.message}). Build zastaven, na webu zůstává poslední verze.`);
    }
    console.warn(`⚠ obsah z adminu nedostupný (${e.message}), beru data/obsah.json z repa`);
  }
  // Po sekcích: co je uložené v adminu, přebije výchozí hodnoty z repa.
  const obsah = zAdminu && typeof zAdminu === "object" ? { ...zRepa, ...zAdminu } : zRepa;
  return { obsah, zdroj: zAdminu ? "admin" : "repo" };
}

const CAS_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;
const POZNAMKA_RE = /^[\p{L}\p{N} .,:;!?()/+–„“"'-]{0,120}$/u;
const OZNAMENI_RE = /^[\p{L}\p{N} .,:;!?()/+%–„“"'&-]{1,160}$/u;
const DNY = ["po", "ut", "st", "ct", "pa", "so", "ne"];
const DEN = {
  po: { zkr: "Po", nom: "pondělí", lok: "v pondělí", en: "Monday" },
  ut: { zkr: "Út", nom: "úterý", lok: "v úterý", en: "Tuesday" },
  st: { zkr: "St", nom: "středa", lok: "ve středu", en: "Wednesday" },
  ct: { zkr: "Čt", nom: "čtvrtek", lok: "ve čtvrtek", en: "Thursday" },
  pa: { zkr: "Pá", nom: "pátek", lok: "v pátek", en: "Friday" },
  so: { zkr: "So", nom: "sobota", lok: "v sobotu", en: "Saturday" },
  ne: { zkr: "Ne", nom: "neděle", lok: "v neděli", en: "Sunday" },
};

function platneDatum(s) {
  if (!DATUM_RE.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function overDobu(doba) {
  if (!doba || typeof doba !== "object") chyba("chybí „oteviraci_doba“");
  for (const d of DNY) {
    const x = doba[d];
    if (!x || typeof x.otevreno !== "boolean") chyba(`otevírací doba: chybí den „${d}“`);
    if (x.otevreno) {
      if (!CAS_RE.test(x.od) || !CAS_RE.test(x.do)) chyba(`otevírací doba „${d}“: čas musí být ve tvaru 07:30`);
      if (x.od >= x.do) chyba(`otevírací doba „${d}“: zavírá dřív, než otevírá`);
    }
  }
  if (typeof doba.poznamka !== "string" || !POZNAMKA_RE.test(doba.poznamka.trim())) {
    chyba("poznámka k otevírací době: max 120 znaků, bez speciálních znaků");
  }
  return doba;
}

function overOznameni(o) {
  if (!o || typeof o !== "object") chyba("chybí „oznameni“");
  const text = typeof o.text === "string" ? o.text.trim() : "";
  if (text && !OZNAMENI_RE.test(text)) chyba("oznámení: max 160 znaků, bez < a >");
  for (const k of ["od", "do"]) {
    if (typeof o[k] !== "string" || (o[k] && !platneDatum(o[k]))) chyba(`oznámení „${k}“: datum ve tvaru 2026-12-24 nebo prázdné`);
  }
  if (o.od && o.do && o.od > o.do) chyba("oznámení: „od“ je po „do“");
  return { text, od: o.od, do: o.do };
}

function overObsah(obsah) {
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
  return { upraveno, ceny, doba: overDobu(obsah.oteviraci_doba), oznameni: overOznameni(obsah.oznameni) };
}

// ── otevírací doba ──
function skupiny(doba) {
  // po sobě jdoucí dny se stejnou dobou: Po–Pá 7:00–15:30
  const out = [];
  DNY.forEach((d, i) => {
    const x = doba[d];
    if (!x.otevreno) return;
    const posl = out[out.length - 1];
    if (posl && posl.od === x.od && posl.do === x.do && posl.konec === i - 1) {
      posl.dny.push(d);
      posl.konec = i;
    } else {
      out.push({ dny: [d], od: x.od, do: x.do, konec: i });
    }
  });
  return out;
}
const cas = (t) => t.replace(/^0(\d)/, "$1");
const rozsah = (s, forma) => (s.dny.length > 1 ? `${DEN[s.dny[0]][forma]}–${DEN[s.dny.at(-1)][forma]}` : DEN[s.dny[0]][forma]);

function dobaKratce(doba) {
  const g = skupiny(doba);
  return g.length ? g.map((s) => `${rozsah(s, "zkr")} ${cas(s.od)}–${cas(s.do)}`).join(", ") : "zavřeno";
}
function dobaVeta(doba) {
  const g = skupiny(doba);
  const casti = g.map((s) =>
    `${s.dny.length > 1 ? `${DEN[s.dny[0]].nom} až ${DEN[s.dny.at(-1)].nom}` : DEN[s.dny[0]].lok} od ${cas(s.od)} do ${cas(s.do)}`);
  const zaklad = casti.length ? `Otevřeno máme ${casti.join(", ")}.` : "Momentálně máme zavřeno.";
  const pozn = doba.poznamka.trim();
  return pozn ? `${zaklad} ${pozn}` : zaklad;
}
function dobaLlms(doba) {
  const g = skupiny(doba);
  const casti = g.map((s) =>
    `${s.dny.length > 1 ? `${DEN[s.dny[0]].nom} až ${DEN[s.dny.at(-1)].nom}` : DEN[s.dny[0]].nom} ${cas(s.od)}–${cas(s.do)}`);
  const zaklad = casti.length ? casti.join(", ") : "zavřeno";
  const pozn = doba.poznamka.trim();
  return pozn ? `${zaklad}. ${pozn}` : zaklad;
}
function dobaSpec(doba) {
  return skupiny(doba).map((s) => ({
    "@type": "OpeningHoursSpecification", dayOfWeek: s.dny.map((d) => DEN[d].en), opens: s.od, closes: s.do,
  }));
}
// česká typografie v HTML: nezlomitelná mezera po jednopísmenných předložkách
function typoHtml(s) {
  let out = escHtml(s);
  for (let i = 0; i < 2; i++) out = out.replace(/(^|[\s(;])([KkSsVvZzOoUuIiAa]) /g, "$1$2&nbsp;");
  return out;
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

function nahradSpany(html, atribut, render, soubor, klice = POLOZKY) {
  let pocet = 0;
  const re = new RegExp(`(<span\\b[^>]*\\b${atribut}="([a-z-]+)"[^>]*>)([^<]*)(</span>)`, "g");
  const out = html.replace(re, (_, open, klic, _stary, close) => {
    if (!klice[klic]) throw new Error(`${soubor}: ${atribut}="${klic}" neznám`);
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

function upravJsonLd(data, ceny, doba, faqTexty) {
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
    if (hloubka === 0 && o["@type"] === "AutoRepair") o.openingHoursSpecification = dobaSpec(doba);
    if (o["@type"] === "Question" && faqTexty[o.name] !== undefined) {
      o.acceptedAnswer = { ...o.acceptedAnswer, text: faqTexty[o.name] };
      faqTexty[o.name] = null; // označit jako použité
    }
    return o;
  };
  return { data: walk(data, 0), nabidek };
}

const DOBA_KLICE = { kratce: true, veta: true };

function zpracujHtml(soubor, html, ctx, snippet, oznameni) {
  const { ceny, doba, fmt } = ctx;
  let out = html;
  const a = nahradSpany(out, "data-cena", fmt.html, soubor); out = a.out;
  const b = nahradSpany(out, "data-castka", fmt.castkaHtml, soubor); out = b.out;
  const c = nahradSpany(out, "data-doba", (k) => (k === "veta" ? typoHtml(dobaVeta(doba)) : escHtml(dobaKratce(doba))), soubor, DOBA_KLICE);
  out = c.out;

  const faqTexty = {};
  for (const otazka of FAQ_Z_VIDITELNE_ODPOVEDI[soubor] ?? []) faqTexty[otazka] = viditelnaOdpoved(out, otazka);
  for (const [otazka, sablona] of Object.entries(FAQ_SABLONY[soubor] ?? {})) faqTexty[otazka] = sablona(fmt);

  let nabidek = 0;
  out = out.replace(/(<script type="application\/ld\+json">\n)([\s\S]*?)(\n[ \t]*<\/script>)/g, (_, open, json, close) => {
    const r = upravJsonLd(JSON.parse(json), ceny, doba, faqTexty);
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
  if (oznameni) {
    const m = /<body[^>]*>/.exec(out);
    if (!m) throw new Error(`${soubor}: chybí <body>`);
    out = out.slice(0, m.index + m[0].length) + "\n" + oznameni + out.slice(m.index + m[0].length);
  }
  return { out, ceny: a.pocet, castky: b.pocet, doba: c.pocet, nabidek };
}

function llmsTxt(text, ceny, fmt, upraveno, doba) {
  const radekDoby = /^- Otevírací doba: .*$/m;
  if (!radekDoby.test(text)) throw new Error("llms.txt: řádek „- Otevírací doba:“ nenalezen");
  text = text.replace(radekDoby, `- Otevírací doba: ${dobaLlms(doba)}`);
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

function dnesPraha() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
}

function oznameniHtml(o) {
  if (!o.text) return null;
  if (o.do && o.do < dnesPraha()) return null; // prošlé oznámení do stránky vůbec nedáváme
  return `<!-- WZ-OZNAMENI (vkládá build z adminu) -->
<style>.wz-oznameni{position:fixed;top:0;left:0;right:0;z-index:1100;background:#c9a227;color:#1a1a2e;font:600 14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;text-align:center;padding:9px 46px}
.wz-oznameni button{position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:0;color:inherit;font-size:22px;line-height:1;padding:4px 10px;cursor:pointer}
body.ma-oznameni{padding-top:var(--wz-oznameni-h,0px)}body.ma-oznameni .navbar{top:var(--wz-oznameni-h,0px)}</style>
<div class="wz-oznameni" role="status" data-od="${o.od}" data-do="${o.do}"><span>${typoHtml(o.text)}</span><button type="button" aria-label="Zavřít oznámení">×</button></div>
<script>(function(){var e=document.querySelector('.wz-oznameni');if(!e)return;
var n=new Date(),t=n.getFullYear()+'-'+('0'+(n.getMonth()+1)).slice(-2)+'-'+('0'+n.getDate()).slice(-2);
if((e.dataset.od&&t<e.dataset.od)||(e.dataset.do&&t>e.dataset.do)){e.remove();return}
function h(){document.documentElement.style.setProperty('--wz-oznameni-h',e.offsetHeight+'px')}
h();document.body.classList.add('ma-oznameni');window.addEventListener('resize',h);
e.querySelector('button').addEventListener('click',function(){e.remove();document.body.classList.remove('ma-oznameni')})})();</script>`;
}

function* soubory(dir) {
  for (const jmeno of readdirSync(dir)) {
    const cesta = join(dir, jmeno);
    if (statSync(cesta).isDirectory()) yield* soubory(cesta);
    else yield cesta;
  }
}

// ── běh ──
const { obsah, zdroj } = await stahniObsah();
const { upraveno, ceny, doba, oznameni } = overObsah(obsah);
const fmt = formatovac(ceny);
const ctx = { ceny, doba, fmt };
const lista = oznameniHtml(oznameni);
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

// admin čte /data/obsah.json, aby poznal, že je nový obsah nasazený
writeFileSync(join(OUT, "data/obsah.json"), `${JSON.stringify(obsah, null, 2)}\n`);

const souhrn = { ceny: 0, castky: 0, doba: 0, nabidek: 0, stranek: 0 };
for (const cesta of soubory(OUT)) {
  const rel = relative(OUT, cesta);
  if (rel.endsWith(".html")) {
    const jeAdmin = rel.startsWith("admin/");
    const r = zpracujHtml(rel, readFileSync(cesta, "utf8"), ctx, jeAdmin ? null : snippet, jeAdmin ? null : lista);
    writeFileSync(cesta, r.out);
    souhrn.ceny += r.ceny; souhrn.castky += r.castky; souhrn.doba += r.doba; souhrn.nabidek += r.nabidek; souhrn.stranek++;
  } else if (rel === "llms.txt") {
    writeFileSync(cesta, llmsTxt(readFileSync(cesta, "utf8"), ceny, fmt, upraveno, doba));
  }
}
// Pojistka proti tiché ztrátě napojení: tolik míst musí build vždy najít.
if (souhrn.ceny !== 6) throw new Error(`čekal jsem 6 cen v ceníku, našel jsem ${souhrn.ceny}`);
if (souhrn.castky !== 2) throw new Error(`čekal jsem 2 částky ve FAQ, našel jsem ${souhrn.castky}`);
if (souhrn.nabidek < 10) throw new Error(`čekal jsem aspoň 10 nabídek v JSON-LD, našel jsem ${souhrn.nabidek}`);
if (souhrn.doba < 3) throw new Error(`čekal jsem aspoň 3 místa s otevírací dobou, našel jsem ${souhrn.doba}`);

console.log(`Build OK (obsah: ${zdroj}): ${souhrn.stranek} stránek, ceník ${souhrn.ceny}×, částky ${souhrn.castky}×, doba ${souhrn.doba}×, nabídky JSON-LD ${souhrn.nabidek}×`);
console.log(`  otevírací doba: ${dobaKratce(doba)}${lista ? ` | oznámení: ${oznameni.text}` : ""}`);
for (const k of LLMS_PORADI) console.log(`  ${k}: ${fmt.text(k)}`);
