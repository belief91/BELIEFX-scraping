// scrapers/scraperRBA.js
// NOUVEAU MODÈLE : une fonction par catégorie, appelée UNE SEULE À LA FOIS.
//
// Mapping des catégories génériques vers la réalité RBA :
// - statement : Media Release décision (page de listing HTML, filtrée par titre)
// - minutes : Media Release "minutes" (même listing, titre différent)
// - discours : discours le plus récent (flux dédié /rss/rss-cb-speeches.xml)
// - monetaryPolicyReport : Statement on Monetary Policy (flux dédié /rss-cb-smp.xml)
// - beigeBook : Financial Stability Review (flux dédié /rss-cb-fsr.xml)
// - presseConference : NON APPLICABLE — RBA fait partie des exceptions
//   confirmées par le référentiel (pas de conférence de presse systématique)
//
// Le site RBA protège ses flux RSS par un WAF — un User-Agent de
// navigateur est nécessaire pour éviter d'être bloqué.

import * as cheerio from "cheerio";
import { fetchAvecRetry } from "./fetchUtils.js";

const HEADERS_NAVIGATEUR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

const RBA_MEDIA_RELEASES_LISTING = "https://www.rba.gov.au/media-releases/";
const RBA_SPEECHES_RSS = "https://www.rba.gov.au/rss/rss-cb-speeches.xml";
const RBA_SMP_RSS = "https://www.rba.gov.au/rss/rss-cb-smp.xml";
const RBA_FSR_RSS = "https://www.rba.gov.au/rss/rss-cb-fsr.xml";

async function lireItemsRSS(url) {
  const response = await fetchAvecRetry(url, { headers: HEADERS_NAVIGATEUR });
  if (!response.ok) {
    throw new Error(`Échec lecture flux RSS RBA (${url}) : HTTP ${response.status}`);
  }
  const xml = await response.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const items = [];
  $("item").each((_, el) => {
    items.push({
      titre: $(el).find("title").text().trim(),
      lien: $(el).find("link").text().trim(),
    });
  });
  return items;
}

async function lireListingMediaReleases() {
  const response = await fetchAvecRetry(RBA_MEDIA_RELEASES_LISTING, {
    headers: HEADERS_NAVIGATEUR,
  });
  if (!response.ok) {
    throw new Error(`Échec lecture listing RBA : HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  const items = [];
  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const titre = $(el).text().trim();
    if (href.includes("/media-releases/") && /mr-\d{2}-\d{2}\.html/.test(href)) {
      items.push({
        titre,
        lien: href.startsWith("http") ? href : `https://www.rba.gov.au${href}`,
      });
    }
  });
  return items;
}

async function scraperPage(url) {
  const response = await fetchAvecRetry(url, { headers: HEADERS_NAVIGATEUR });
  if (!response.ok) {
    throw new Error(`Échec scraping page RBA (${url}) : HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  const paragraphes = [];
  $("#content p").each((_, el) => {
    const texte = $(el).text().trim();
    if (texte.length > 0) paragraphes.push(texte);
  });
  return paragraphes.join("\n\n");
}

// ─────────────────────────────────────────────────────────────
// Une fonction par catégorie
// ─────────────────────────────────────────────────────────────

async function scraperStatement() {
  const items = await lireListingMediaReleases();
  const decision = items.find((it) =>
    ["monetary policy decision", "reserve bank board", "cash rate"].some((mot) =>
      it.titre.toLowerCase().includes(mot)
    )
  );
  if (!decision) throw new Error("Media Release (décision) : aucun item trouvé");
  return await scraperPage(decision.lien);
}

async function scraperMinutes() {
  const items = await lireListingMediaReleases();
  const minutes = items.find((it) => it.titre.toLowerCase().includes("minutes"));
  if (!minutes) throw new Error("Minutes : aucun item trouvé");
  return await scraperPage(minutes.lien);
}

async function scraperDiscours() {
  const items = await lireItemsRSS(RBA_SPEECHES_RSS);
  if (items.length === 0) throw new Error("Discours : aucun item dans le flux");
  return await scraperPage(items[0].lien);
}

async function scraperMonetaryPolicyReport() {
  const items = await lireItemsRSS(RBA_SMP_RSS);
  if (items.length === 0) throw new Error("Statement on Monetary Policy : aucun item dans le flux");
  return await scraperPage(items[0].lien);
}

async function scraperBeigeBook() {
  const items = await lireItemsRSS(RBA_FSR_RSS);
  if (items.length === 0) throw new Error("Financial Stability Review : aucun item dans le flux");
  return await scraperPage(items[0].lien);
}

async function scraperPresseConference() {
  throw new Error("Catégorie non applicable pour la RBA (pas de conférence de presse systématique)");
}

// ─────────────────────────────────────────────────────────────
// Routeur — n'exécute QUE la catégorie demandée
// ─────────────────────────────────────────────────────────────

const CATEGORIES = {
  statement: scraperStatement,
  minutes: scraperMinutes,
  discours: scraperDiscours,
  monetaryPolicyReport: scraperMonetaryPolicyReport,
  beigeBook: scraperBeigeBook,
  presseConference: scraperPresseConference,
};

export async function scraperRBA(categorie) {
  const fonction = CATEGORIES[categorie];
  if (!fonction) {
    throw new Error(`Catégorie inconnue pour RBA : "${categorie}"`);
  }
  return await fonction();
}
