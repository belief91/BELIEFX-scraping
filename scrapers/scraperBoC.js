// scrapers/scraperBoC.js
// NOUVEAU MODÈLE : une fonction par catégorie, appelée UNE SEULE À LA FOIS.
//
// Mapping des catégories génériques vers la réalité BoC :
// - statement : Rate statement (flux content_type/press-releases)
// - presseConference : Opening statement (flux content_type/speeches)
// - minutes : Summary of Deliberations (flux content_type/summary-of-deliberations)
// - discours : discours le plus récent hors opening statement (flux speeches)
// - monetaryPolicyReport : Monetary Policy Report (flux content_type/mpr)
// - beigeBook : Business Outlook Survey (flux content_type/bos)

import * as cheerio from "cheerio";
import { fetchAvecRetry } from "./fetchUtils.js";

const BOC_PRESS_RELEASES_RSS = "https://www.bankofcanada.ca/content_type/press-releases/feed/";
const BOC_SPEECHES_RSS = "https://www.bankofcanada.ca/content_type/speeches/feed/";
const BOC_MPR_RSS = "https://www.bankofcanada.ca/content_type/mpr/feed/";
const BOC_SUMMARY_RSS = "https://www.bankofcanada.ca/content_type/summary-of-deliberations/feed/";
const BOC_BOS_RSS = "https://www.bankofcanada.ca/content_type/bos/feed/";

async function lireItemsRSS(url) {
  const response = await fetchAvecRetry(url);
  if (!response.ok) {
    throw new Error(`Échec lecture flux RSS BoC (${url}) : HTTP ${response.status}`);
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

async function scraperPage(url) {
  const response = await fetchAvecRetry(url);
  if (!response.ok) {
    throw new Error(`Échec scraping page BoC (${url}) : HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  const paragraphes = [];
  $("main p").each((_, el) => {
    const texte = $(el).text().trim();
    if (texte.length > 0) paragraphes.push(texte);
  });
  return paragraphes.join("\n\n");
}

// ─────────────────────────────────────────────────────────────
// Une fonction par catégorie
// ─────────────────────────────────────────────────────────────

async function scraperStatement() {
  const items = await lireItemsRSS(BOC_PRESS_RELEASES_RSS);
  if (items.length === 0) throw new Error("Rate Statement : aucun item dans le flux");
  return await scraperPage(items[0].lien);
}

async function scraperPresseConference() {
  const items = await lireItemsRSS(BOC_SPEECHES_RSS);
  const opening = items.find((it) =>
    it.titre.toLowerCase().includes("opening statement")
  );
  if (!opening) throw new Error("Opening Statement : aucun item trouvé dans le flux speeches");
  return await scraperPage(opening.lien);
}

async function scraperMinutes() {
  const items = await lireItemsRSS(BOC_SUMMARY_RSS);
  if (items.length === 0) throw new Error("Summary of Deliberations : aucun item dans le flux");
  return await scraperPage(items[0].lien);
}

async function scraperDiscours() {
  const items = await lireItemsRSS(BOC_SPEECHES_RSS);
  const discours = items.find(
    (it) => !it.titre.toLowerCase().includes("opening statement")
  );
  if (!discours) throw new Error("Discours : aucun item dans le flux");
  return await scraperPage(discours.lien);
}

async function scraperMonetaryPolicyReport() {
  const items = await lireItemsRSS(BOC_MPR_RSS);
  if (items.length === 0) throw new Error("Monetary Policy Report : aucun item dans le flux");
  return await scraperPage(items[0].lien);
}

async function scraperBeigeBook() {
  const items = await lireItemsRSS(BOC_BOS_RSS);
  if (items.length === 0) throw new Error("Business Outlook Survey : aucun item dans le flux");
  return await scraperPage(items[0].lien);
}

// ─────────────────────────────────────────────────────────────
// Routeur — n'exécute QUE la catégorie demandée
// ─────────────────────────────────────────────────────────────

const CATEGORIES = {
  statement: scraperStatement,
  presseConference: scraperPresseConference,
  minutes: scraperMinutes,
  discours: scraperDiscours,
  monetaryPolicyReport: scraperMonetaryPolicyReport,
  beigeBook: scraperBeigeBook,
};

export async function scraperBoC(categorie) {
  const fonction = CATEGORIES[categorie];
  if (!fonction) {
    throw new Error(`Catégorie inconnue pour BoC : "${categorie}"`);
  }
  return await fonction();
}
