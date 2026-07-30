// scrapers/scraperBoE.js
// NOUVEAU MODÈLE : une fonction par catégorie, appelée UNE SEULE À LA FOIS.
//
// Mapping des catégories génériques vers la réalité BoE :
// - statement / minutes : même document ("Monetary Policy Summary and
//   Minutes" combine décision + minutes en une seule page pour la BoE)
// - presseConference : transcript PDF (trimestriel, via sitemap MPR)
// - discours : discours le plus récent (/rss/news)
// - monetaryPolicyReport : Monetary Policy Report (trimestriel, page HTML
//   via sitemap MPR)
// - beigeBook : "Agents' summary of business conditions" (équivalent
//   enquête le plus proche pour la BoE)

import * as cheerio from "cheerio";
import { createRequire } from "module";
import { fetchAvecRetry } from "./fetchUtils.js";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const BOE_NEWS_RSS = "https://www.bankofengland.co.uk/rss/news";
const BOE_PUBLICATIONS_RSS = "https://www.bankofengland.co.uk/rss/publications";
const BOE_MPR_SITEMAP = "https://www.bankofengland.co.uk/sitemap/monetary-policy-report";

async function lireItemsRSS(url) {
  const response = await fetchAvecRetry(url);
  if (!response.ok) {
    throw new Error(`Échec lecture flux RSS BoE (${url}) : HTTP ${response.status}`);
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
    throw new Error(`Échec scraping page BoE (${url}) : HTTP ${response.status}`);
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

async function trouverDernierLienSitemap(motCleTexte, { requirePdf = false } = {}) {
  const response = await fetchAvecRetry(BOE_MPR_SITEMAP);
  if (!response.ok) {
    throw new Error(`Échec lecture sitemap MPR BoE : HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  let dernierLien = null;
  $("a").each((_, el) => {
    const texte = $(el).text().trim();
    const href = $(el).attr("href") || "";
    const estPdf = href.includes(".pdf");

    if (
      texte.toLowerCase().startsWith(motCleTexte) &&
      !texte.toLowerCase().includes("to be published") &&
      (requirePdf ? estPdf : !estPdf)
    ) {
      dernierLien = href;
    }
  });

  if (!dernierLien) {
    throw new Error(`Aucun lien trouvé pour "${motCleTexte}" dans le sitemap MPR`);
  }
  return dernierLien;
}

// ─────────────────────────────────────────────────────────────
// Une fonction par catégorie
// ─────────────────────────────────────────────────────────────

async function scraperStatementOuMinutes() {
  const items = await lireItemsRSS(BOE_NEWS_RSS);
  const decision = items.find((it) =>
    it.titre.toLowerCase().includes("monetary policy summary")
  );
  if (!decision) {
    throw new Error("Décision/Minutes : aucun item trouvé dans le flux");
  }
  return await scraperPage(decision.lien);
}

async function scraperDiscours() {
  const items = await lireItemsRSS(BOE_NEWS_RSS);
  const discours = items.find(
    (it) =>
      it.titre.toLowerCase().includes("speech by") ||
      it.titre.toLowerCase().includes("speech at")
  );
  if (!discours) {
    throw new Error("Discours : aucun item trouvé dans le flux");
  }
  return await scraperPage(discours.lien);
}

async function scraperPresseConference() {
  const url = await trouverDernierLienSitemap(
    "monetary policy report press conference transcript",
    { requirePdf: true }
  );
  return await extraireTextePDF(url);
}

async function scraperMonetaryPolicyReport() {
  const url = await trouverDernierLienSitemap("monetary policy report - ", { requirePdf: false });
  return await scraperPage(url);
}

async function scraperBeigeBook() {
  const items = await lireItemsRSS(BOE_PUBLICATIONS_RSS);
  const enquete = items.find((it) =>
    it.titre.toLowerCase().includes("agents' summary")
  );
  if (!enquete) {
    throw new Error("Agents' summary : aucun item trouvé dans le flux");
  }
  return await scraperPage(enquete.lien);
}

// ─────────────────────────────────────────────────────────────
// Routeur — n'exécute QUE la catégorie demandée
// ─────────────────────────────────────────────────────────────

const CATEGORIES = {
  statement: scraperStatementOuMinutes,
  minutes: scraperStatementOuMinutes, // même document pour la BoE
  discours: scraperDiscours,
  presseConference: scraperPresseConference,
  monetaryPolicyReport: scraperMonetaryPolicyReport,
  beigeBook: scraperBeigeBook,
};

export async function scraperBoE(categorie) {
  const fonction = CATEGORIES[categorie];
  if (!fonction) {
    throw new Error(`Catégorie inconnue pour BoE : "${categorie}"`);
  }
  return await fonction();
}
