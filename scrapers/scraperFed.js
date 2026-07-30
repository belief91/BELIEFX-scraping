// scrapers/scraperFed.js
// NOUVEAU MODÈLE : une fonction par catégorie, appelée UNE SEULE À LA FOIS
// selon la catégorie détectée dans le calendrier économique (voir
// EVENT_TO_CATEGORY dans lib/central-bank-keywords.js). Plus de scraping
// simultané des 7 catégories — on ne récupère que celle qui correspond
// exactement à l'événement du jour.

import * as cheerio from "cheerio";
import { createRequire } from "module";
import { fetchAvecRetry } from "./fetchUtils.js";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const FED_MONETARY_RSS = "https://www.federalreserve.gov/feeds/press_monetary.xml";
const FED_SPEECHES_RSS = "https://www.federalreserve.gov/feeds/speeches.xml";
const FED_MPR_DEFAULT = "https://www.federalreserve.gov/monetarypolicy/publications/mpr_default.htm";
const FED_BEIGE_BOOK_DEFAULT = "https://www.federalreserve.gov/monetarypolicy/beige-book-default.htm";

async function lireItemsRSS(url) {
  const response = await fetchAvecRetry(url);
  if (!response.ok) {
    throw new Error(`Échec lecture flux RSS Fed (${url}) : HTTP ${response.status}`);
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

async function scraperPage(url, selecteur = "#article p") {
  const response = await fetchAvecRetry(url);
  if (!response.ok) {
    throw new Error(`Échec scraping page Fed (${url}) : HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  const paragraphes = [];
  $(selecteur).each((_, el) => {
    const texte = $(el).text().trim();
    if (texte.length > 0) paragraphes.push(texte);
  });
  return paragraphes.join("\n\n");
}

async function extraireTextePDF(url) {
  const response = await fetchAvecRetry(url);
  if (!response.ok) {
    throw new Error(`Échec téléchargement PDF (${url}) : HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  const parser = new PDFParse({ data: buffer });
  try {
    const resultat = await parser.getText();
    return resultat.text.trim();
  } finally {
    await parser.destroy();
  }
}

async function trouverDernierLien(urlPageDefault, motCleHref) {
  const response = await fetchAvecRetry(urlPageDefault);
  if (!response.ok) {
    throw new Error(`Échec lecture page de découverte (${urlPageDefault}) : HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  let lien = null;
  $("a").each((_, el) => {
    if (lien) return;
    const href = $(el).attr("href") || "";
    if (href.includes(motCleHref)) {
      lien = href.startsWith("http") ? href : `https://www.federalreserve.gov${href}`;
    }
  });

  if (!lien) {
    throw new Error(`Aucun lien trouvé contenant "${motCleHref}" sur ${urlPageDefault}`);
  }
  return lien;
}

// ─────────────────────────────────────────────────────────────
// Une fonction par catégorie — chacune est indépendante et ne fait
// AUCUN appel réseau vers les autres catégories.
// ─────────────────────────────────────────────────────────────

async function scraperStatement() {
  const items = await lireItemsRSS(FED_MONETARY_RSS);
  const statement = items.find((it) => it.titre.toLowerCase().includes("fomc statement"));
  if (!statement) throw new Error("FOMC Statement : aucun item trouvé dans le flux");
  return await scraperPage(statement.lien);
}

async function scraperMinutes() {
  const items = await lireItemsRSS(FED_MONETARY_RSS);
  const minutes = items.find((it) =>
    it.titre.toLowerCase().includes("minutes of the federal open market committee")
  );
  if (!minutes) throw new Error("Minutes FOMC : aucun item trouvé dans le flux");
  return await scraperPage(minutes.lien);
}

async function scraperPresseConference() {
  const items = await lireItemsRSS(FED_MONETARY_RSS);
  const statement = items.find((it) => it.titre.toLowerCase().includes("fomc statement"));
  if (!statement) throw new Error("Impossible de dériver la date : FOMC Statement non trouvé");

  const match = statement.lien.match(/monetary(\d{8})a\.htm/);
  if (!match) throw new Error(`Date non extractible de l'URL statement : ${statement.lien}`);

  const date = match[1];
  const urlPDF = `https://www.federalreserve.gov/mediacenter/files/FOMCpresconf${date}.pdf`;
  return await extraireTextePDF(urlPDF);
}

async function scraperDiscours() {
  const items = await lireItemsRSS(FED_SPEECHES_RSS);
  if (items.length === 0) throw new Error("Discours : aucun item dans le flux");
  return await scraperPage(items[0].lien);
}

async function scraperMonetaryPolicyReport() {
  const url = await trouverDernierLien(FED_MPR_DEFAULT, "mpr-summary.htm");
  return await scraperPage(url);
}

async function scraperBeigeBook() {
  const url = await trouverDernierLien(FED_BEIGE_BOOK_DEFAULT, "beigebook");
  return await scraperPage(url);
}

// ─────────────────────────────────────────────────────────────
// Routeur — n'exécute QUE la catégorie demandée
// ─────────────────────────────────────────────────────────────

const CATEGORIES = {
  statement: scraperStatement,
  minutes: scraperMinutes,
  presseConference: scraperPresseConference,
  discours: scraperDiscours,
  monetaryPolicyReport: scraperMonetaryPolicyReport,
  beigeBook: scraperBeigeBook,
};

export async function scraperFed(categorie) {
  const fonction = CATEGORIES[categorie];
  if (!fonction) {
    throw new Error(`Catégorie inconnue pour Fed : "${categorie}"`);
  }
  return await fonction();
}
