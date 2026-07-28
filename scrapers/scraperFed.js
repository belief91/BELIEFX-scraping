// scrapers/scraperFed.js
// Agrège les 7 catégories pour la Fed :
// - 1-2 : FOMC statement (press_monetary.xml)
// - 3 : Minutes FOMC (même flux)
// - 4 : Transcript PDF de la conférence de presse (URL dérivée de la date du statement)
// - 5 : Discours le plus récent (speeches.xml)
// - 6 : Monetary Policy Report (page de découverte mpr_default.htm)
// - 7 : Beige Book (page de découverte beige-book-default.htm)

import * as cheerio from "cheerio";
import { createRequire } from "module";
import { fetchAvecRetry, pause } from "./fetchUtils.js";

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

/**
 * Trouve le lien vers le dernier résumé publié (MPR ou Beige Book),
 * en cherchant le premier lien d'ancre pertinent sur la page de découverte.
 */
async function trouverDernierLien(urlPageDefault, motCleHref) {
  const response = await fetchAvecRetry(urlPageDefault);
  if (!response.ok) {
    throw new Error(`Échec lecture page de découverte (${urlPageDefault}) : HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  let lien = null;
  $("a").each((_, el) => {
    if (lien) return; // premier trouvé = le plus récent sur ce type de page
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

export async function scraperFed() {
  const morceaux = [];
  const erreurs = [];

  let itemsMonetary = [];
  let itemsSpeeches = [];

  try {
    itemsMonetary = await lireItemsRSS(FED_MONETARY_RSS);
  } catch (err) {
    erreurs.push(`Flux press_monetary.xml : ${err.message}`);
  }

  try {
    itemsSpeeches = await lireItemsRSS(FED_SPEECHES_RSS);
  } catch (err) {
    erreurs.push(`Flux speeches.xml : ${err.message}`);
  }

  // Catégories 1-2 : FOMC statement
  let urlStatement = null;
  try {
    const statement = itemsMonetary.find((it) =>
      it.titre.toLowerCase().includes("fomc statement")
    );
    if (statement) {
      urlStatement = statement.lien;
      const texte = await scraperPage(statement.lien);
      if (texte) morceaux.push(`--- FOMC STATEMENT ---\n${texte}`);
    } else {
      erreurs.push("FOMC Statement : aucun item trouvé");
    }
  } catch (err) {
    erreurs.push(`FOMC Statement : ${err.message}`);
  }

  // Catégorie 3 : Minutes
  await pause();
  try {
    const minutes = itemsMonetary.find((it) =>
      it.titre.toLowerCase().includes("minutes of the federal open market committee")
    );
    if (minutes) {
      const texte = await scraperPage(minutes.lien);
      if (texte) morceaux.push(`--- MINUTES FOMC ---\n${texte}`);
    } else {
      erreurs.push("Minutes FOMC : aucun item trouvé");
    }
  } catch (err) {
    erreurs.push(`Minutes FOMC : ${err.message}`);
  }

  // Catégorie 4 : Conférence de presse (PDF, URL dérivée de la date du statement)
  await pause();
  try {
    if (!urlStatement) {
      throw new Error("Impossible de dériver la date : statement non trouvé");
    }
    const match = urlStatement.match(/monetary(\d{8})a\.htm/);
    if (!match) {
      throw new Error(`Date non extractible de l'URL statement : ${urlStatement}`);
    }
    const date = match[1];
    const urlPDF = `https://www.federalreserve.gov/mediacenter/files/FOMCpresconf${date}.pdf`;
    const texte = await extraireTextePDF(urlPDF);
    if (texte) morceaux.push(`--- CONFÉRENCE DE PRESSE (PDF) ---\n${texte}`);
  } catch (err) {
    erreurs.push(`Conférence de presse PDF : ${err.message}`);
  }

  // Catégorie 5 : Discours le plus récent
  await pause();
  try {
    if (itemsSpeeches.length > 0) {
      const texte = await scraperPage(itemsSpeeches[0].lien);
      if (texte) morceaux.push(`--- DISCOURS ---\n${texte}`);
    } else {
      erreurs.push("Discours : aucun item dans le flux");
    }
  } catch (err) {
    erreurs.push(`Discours : ${err.message}`);
  }

  // Catégorie 6 : Monetary Policy Report
  await pause();
  try {
    const urlMPR = await trouverDernierLien(FED_MPR_DEFAULT, "mpr-summary.htm");
    const texte = await scraperPage(urlMPR);
    if (texte) morceaux.push(`--- MONETARY POLICY REPORT ---\n${texte}`);
  } catch (err) {
    erreurs.push(`Monetary Policy Report : ${err.message}`);
  }

  // Catégorie 7 : Beige Book
  await pause();
  try {
    const urlBeigeBook = await trouverDernierLien(FED_BEIGE_BOOK_DEFAULT, "beigebook");
    const texte = await scraperPage(urlBeigeBook);
    if (texte) morceaux.push(`--- BEIGE BOOK ---\n${texte}`);
  } catch (err) {
    erreurs.push(`Beige Book : ${err.message}`);
  }

  if (erreurs.length > 0) {
    console.warn("--- Catégories non récupérées pour Fed ---");
    erreurs.forEach((e) => console.warn("  -", e));
  }

  if (morceaux.length === 0) {
    throw new Error("Aucun document pertinent trouvé pour Fed (toutes catégories en échec)");
  }

  return morceaux.join("\n\n");
}
