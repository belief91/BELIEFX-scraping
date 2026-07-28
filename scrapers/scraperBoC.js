// scrapers/scraperBoC.js
// Agrège les catégories pour la BoC, via 5 flux RSS dédiés (WordPress
// content_type feeds — structure propre, similaire à la Fed) :
// - 1-2 : Press releases (rate statement)
// - 3 : Summary of deliberations (minutes)
// - 4 : Opening statement (conférence de presse), trouvé dans le flux Speeches
// - 5 : Speeches and appearances
// - 6 : Monetary Policy Report
// - 7 : Business Outlook Survey

import * as cheerio from "cheerio";
import { fetchAvecRetry, pause } from "./fetchUtils.js";

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

async function scraperPage(url, selecteur = "main p") {
  const response = await fetchAvecRetry(url);
  if (!response.ok) {
    throw new Error(`Échec scraping page BoC (${url}) : HTTP ${response.status}`);
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

export async function scraperBoC() {
  const morceaux = [];
  const erreurs = [];

  let itemsPress = [];
  let itemsSpeeches = [];
  let itemsMPR = [];
  let itemsSummary = [];
  let itemsBOS = [];

  try {
    itemsPress = await lireItemsRSS(BOC_PRESS_RELEASES_RSS);
  } catch (err) {
    erreurs.push(`Flux press-releases : ${err.message}`);
  }

  await pause();
  try {
    itemsSpeeches = await lireItemsRSS(BOC_SPEECHES_RSS);
  } catch (err) {
    erreurs.push(`Flux speeches : ${err.message}`);
  }

  await pause();
  try {
    itemsMPR = await lireItemsRSS(BOC_MPR_RSS);
  } catch (err) {
    erreurs.push(`Flux mpr : ${err.message}`);
  }

  await pause();
  try {
    itemsSummary = await lireItemsRSS(BOC_SUMMARY_RSS);
  } catch (err) {
    erreurs.push(`Flux summary-of-deliberations : ${err.message}`);
  }

  await pause();
  try {
    itemsBOS = await lireItemsRSS(BOC_BOS_RSS);
  } catch (err) {
    erreurs.push(`Flux bos : ${err.message}`);
  }

  // Catégories 1-2 : Rate statement (item le plus récent du flux press-releases)
  await pause();
  try {
    if (itemsPress.length > 0) {
      const texte = await scraperPage(itemsPress[0].lien);
      if (texte) morceaux.push(`--- RATE STATEMENT ---\n${texte}`);
    } else {
      erreurs.push("Rate Statement : aucun item dans le flux");
    }
  } catch (err) {
    erreurs.push(`Rate Statement : ${err.message}`);
  }

  // Catégorie 4 : Opening statement (conférence de presse), dans le flux Speeches
  await pause();
  try {
    const opening = itemsSpeeches.find((it) =>
      it.titre.toLowerCase().includes("opening statement")
    );
    if (opening) {
      const texte = await scraperPage(opening.lien);
      if (texte) morceaux.push(`--- CONFÉRENCE DE PRESSE (OPENING STATEMENT) ---\n${texte}`);
    } else {
      erreurs.push("Opening Statement : aucun item trouvé dans le flux speeches");
    }
  } catch (err) {
    erreurs.push(`Opening Statement : ${err.message}`);
  }

  // Catégorie 5 : Discours le plus récent (hors opening statement)
  await pause();
  try {
    const discours = itemsSpeeches.find(
      (it) => !it.titre.toLowerCase().includes("opening statement")
    );
    if (discours) {
      const texte = await scraperPage(discours.lien);
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
    if (itemsMPR.length > 0) {
      const texte = await scraperPage(itemsMPR[0].lien);
      if (texte) morceaux.push(`--- MONETARY POLICY REPORT ---\n${texte}`);
    } else {
      erreurs.push("Monetary Policy Report : aucun item dans le flux");
    }
  } catch (err) {
    erreurs.push(`Monetary Policy Report : ${err.message}`);
  }

  // Catégorie 3 : Summary of Governing Council Deliberations
  await pause();
  try {
    if (itemsSummary.length > 0) {
      const texte = await scraperPage(itemsSummary[0].lien);
      if (texte) morceaux.push(`--- SUMMARY OF DELIBERATIONS ---\n${texte}`);
    } else {
      erreurs.push("Summary of Deliberations : aucun item dans le flux");
    }
  } catch (err) {
    erreurs.push(`Summary of Deliberations : ${err.message}`);
  }

  // Catégorie 7 : Business Outlook Survey
  await pause();
  try {
    if (itemsBOS.length > 0) {
      const texte = await scraperPage(itemsBOS[0].lien);
      if (texte) morceaux.push(`--- BUSINESS OUTLOOK SURVEY ---\n${texte}`);
    } else {
      erreurs.push("Business Outlook Survey : aucun item dans le flux");
    }
  } catch (err) {
    erreurs.push(`Business Outlook Survey : ${err.message}`);
  }

  if (erreurs.length > 0) {
    console.warn("--- Catégories non récupérées pour BoC ---");
    erreurs.forEach((e) => console.warn("  -", e));
  }

  if (morceaux.length === 0) {
    throw new Error("Aucun document pertinent trouvé pour BoC (toutes catégories en échec)");
  }

  return morceaux.join("\n\n");
}
