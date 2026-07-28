// scrapers/scraperBoE.js
// Agrège les 7 catégories pour la BoE :
// - 1-2-3 : Décision + Monetary Policy Summary and Minutes (/rss/news)
// - 4 : conférence de presse MPR, transcript PDF (sitemap statique + pdf-parse)
// - 5 : discours le plus récent (/rss/news, titre "speech by")
// - 6 : Monetary Policy Report, trimestriel (page HTML, via sitemap statique)
// - 7 : Agents' summary of business conditions (/rss/publications)

import * as cheerio from "cheerio";
import { createRequire } from "module";
import { fetchAvecRetry, pause } from "./fetchUtils.js";

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

/**
 * Trouve le dernier Monetary Policy Report DÉJÀ publié (pas "to be published")
 * en parcourant le sitemap statique, qui liste tous les rapports par année/mois.
 */
async function trouverDernierMPR() {
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
    // Les liens du sitemap sont des URLs ABSOLUES (confirmé par diagnostic),
    // pas relatives. Cible uniquement les pages HTML (pas les PDF/zip),
    // et exclut les rapports pas encore publiés ("to be published").
    if (
      texte.startsWith("Monetary Policy Report - ") &&
      !texte.includes("to be published") &&
      href.includes("bankofengland.co.uk/monetary-policy-report/") &&
      !href.includes(".pdf") &&
      !href.includes(".zip")
    ) {
      dernierLien = href; // le sitemap liste du plus ancien au plus récent
    }
  });

  if (!dernierLien) {
    throw new Error("Aucun Monetary Policy Report publié trouvé dans le sitemap");
  }

  return dernierLien;
}

/**
 * Trouve l'URL du PDF de transcript de la conférence de presse la plus
 * récente (catégorie 4), en excluant les slides et opening remarks.
 */
async function trouverDernierTranscriptPDF() {
  const response = await fetchAvecRetry(BOE_MPR_SITEMAP);
  if (!response.ok) {
    throw new Error(`Échec lecture sitemap MPR BoE : HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  let dernierLien = null;
  $("a").each((_, el) => {
    const texte = $(el).text().trim().toLowerCase();
    const href = $(el).attr("href") || "";
    if (
      texte.includes("press conference transcript") &&
      href.includes(".pdf")
    ) {
      dernierLien = href;
    }
  });

  return dernierLien; // peut être null si pas encore publié ce trimestre
}

/**
 * Télécharge un PDF et en extrait le texte brut avec pdf-parse v2.
 */
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

export async function scraperBoE() {
  const morceaux = [];
  const erreurs = [];

  let itemsNews = [];
  let itemsPublications = [];

  try {
    itemsNews = await lireItemsRSS(BOE_NEWS_RSS);
  } catch (err) {
    erreurs.push(`Flux /rss/news : ${err.message}`);
  }

  await pause();
  try {
    itemsPublications = await lireItemsRSS(BOE_PUBLICATIONS_RSS);
  } catch (err) {
    erreurs.push(`Flux /rss/publications : ${err.message}`);
  }

  // Catégories 1-3 : Décision / Minutes
  await pause();
  try {
    const decision = itemsNews.find((it) =>
      it.titre.toLowerCase().includes("monetary policy summary")
    );
    if (decision) {
      const texte = await scraperPage(decision.lien);
      if (texte) morceaux.push(`--- DÉCISION / MINUTES ---\n${texte}`);
    } else {
      erreurs.push("Décision/Minutes : aucun item trouvé dans le flux");
    }
  } catch (err) {
    erreurs.push(`Décision/Minutes : ${err.message}`);
  }

  // Catégorie 5 : Discours
  await pause();
  try {
    const discours = itemsNews.find(
      (it) =>
        it.titre.toLowerCase().includes("speech by") ||
        it.titre.toLowerCase().includes("speech at")
    );
    if (discours) {
      const texte = await scraperPage(discours.lien);
      if (texte) morceaux.push(`--- DISCOURS ---\n${texte}`);
    } else {
      erreurs.push("Discours : aucun item trouvé dans le flux");
    }
  } catch (err) {
    erreurs.push(`Discours : ${err.message}`);
  }

  // Catégorie 6 : Monetary Policy Report (trimestriel)
  await pause();
  try {
    const urlMPR = await trouverDernierMPR();
    const texte = await scraperPage(urlMPR);
    if (texte) morceaux.push(`--- MONETARY POLICY REPORT ---\n${texte}`);
  } catch (err) {
    erreurs.push(`Monetary Policy Report : ${err.message}`);
  }

  // Catégorie 4 : transcript PDF de la conférence de presse MPR
  await pause();
  try {
    const urlPDF = await trouverDernierTranscriptPDF();
    if (urlPDF) {
      const texte = await extraireTextePDF(urlPDF);
      if (texte) morceaux.push(`--- CONFÉRENCE DE PRESSE (PDF) ---\n${texte}`);
    } else {
      erreurs.push("Conférence de presse PDF : aucun transcript trouvé dans le sitemap");
    }
  } catch (err) {
    erreurs.push(`Conférence de presse PDF : ${err.message}`);
  }

  // Catégorie 7 : Agents' summary
  await pause();
  try {
    const enquete = itemsPublications.find((it) =>
      it.titre.toLowerCase().includes("agents' summary")
    );
    if (enquete) {
      const texte = await scraperPage(enquete.lien);
      if (texte) morceaux.push(`--- AGENTS' SUMMARY ---\n${texte}`);
    } else {
      erreurs.push("Agents' summary : aucun item trouvé dans le flux");
    }
  } catch (err) {
    erreurs.push(`Agents' summary : ${err.message}`);
  }

  if (erreurs.length > 0) {
    console.warn("--- Catégories non récupérées pour BoE ---");
    erreurs.forEach((e) => console.warn("  -", e));
  }

  if (morceaux.length === 0) {
    throw new Error("Aucun document pertinent trouvé pour BoE (toutes catégories en échec)");
  }

  return morceaux.join("\n\n");
}
