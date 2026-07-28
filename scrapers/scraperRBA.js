// scrapers/scraperRBA.js
// Agrège les catégories pour la RBA :
// - 1-2-3 : Décision + Minutes, via scraping direct de la page de listing
//   /media-releases/ (le flux RSS media-releases est trop étroit, ne
//   contenait que 2 items au moment du diagnostic — non fiable pour
//   retrouver la décision de politique monétaire)
// - 5 : Speeches (flux RSS dédié, fiable)
// - 6 : Statement on Monetary Policy (flux RSS dédié, fiable)
// - 7 : Financial Stability Review (flux RSS dédié, fiable)
// Catégorie 4 (conférence de presse) : non applicable — RBA fait partie
// des exceptions confirmées par le référentiel.
//
// Le site RBA protège ses pages/flux par un WAF — un User-Agent de
// navigateur est nécessaire pour éviter d'être bloqué.

import * as cheerio from "cheerio";
import { fetchAvecRetry, pause } from "./fetchUtils.js";

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

/**
 * Scrape la page de listing complète des Media Releases (plus fiable
 * que le flux RSS, trop étroit — 2 items seulement au moment du
 * diagnostic). Retourne tous les liens avec leur texte, ordre :
 * plus récent en premier (confirmé par diagnostic).
 */
async function lireListingMediaReleases(url) {
  const response = await fetchAvecRetry(url, { headers: HEADERS_NAVIGATEUR });
  if (!response.ok) {
    throw new Error(`Échec lecture listing RBA (${url}) : HTTP ${response.status}`);
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

async function scraperPage(url, selecteur = "#content p") {
  const response = await fetchAvecRetry(url, { headers: HEADERS_NAVIGATEUR });
  if (!response.ok) {
    throw new Error(`Échec scraping page RBA (${url}) : HTTP ${response.status}`);
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

async function traiterCategorie(nomCategorie, items, trouverItem, morceaux, erreurs) {
  const item = trouverItem(items);
  if (!item) {
    erreurs.push(`${nomCategorie} : aucun item trouvé`);
    return;
  }
  try {
    const texte = await scraperPage(item.lien);
    if (texte) {
      morceaux.push(`--- ${nomCategorie} ---\n${texte}`);
    } else {
      erreurs.push(`${nomCategorie} : 0 paragraphe extrait de ${item.lien}`);
    }
  } catch (err) {
    erreurs.push(`${nomCategorie} : ${err.message}`);
  }
}

export async function scraperRBA() {
  const morceaux = [];
  const erreurs = [];

  let itemsListing = [];
  let itemsSpeeches = [];
  let itemsSMP = [];
  let itemsFSR = [];

  try {
    itemsListing = await lireListingMediaReleases(RBA_MEDIA_RELEASES_LISTING);
  } catch (err) {
    erreurs.push(`Listing Media Releases : ${err.message}`);
  }

  await pause();
  try {
    itemsSpeeches = await lireItemsRSS(RBA_SPEECHES_RSS);
  } catch (err) {
    erreurs.push(`Flux speeches : ${err.message}`);
  }

  await pause();
  try {
    itemsSMP = await lireItemsRSS(RBA_SMP_RSS);
  } catch (err) {
    erreurs.push(`Flux smp : ${err.message}`);
  }

  await pause();
  try {
    itemsFSR = await lireItemsRSS(RBA_FSR_RSS);
  } catch (err) {
    erreurs.push(`Flux fsr : ${err.message}`);
  }

  // Catégories 1-2 : Décision (titre exact confirmé par diagnostic)
  await pause();
  await traiterCategorie(
    "MEDIA RELEASE (DÉCISION)",
    itemsListing,
    (items) => items.find((it) => it.titre.toLowerCase().includes("monetary policy decision")),
    morceaux,
    erreurs
  );

  // Catégorie 3 : Minutes (recherché dans le même listing)
  await pause();
  await traiterCategorie(
    "MINUTES",
    itemsListing,
    (items) => items.find((it) => it.titre.toLowerCase().includes("minutes")),
    morceaux,
    erreurs
  );

  // Catégorie 5 : Discours le plus récent
  await pause();
  await traiterCategorie(
    "DISCOURS",
    itemsSpeeches,
    (items) => items[0],
    morceaux,
    erreurs
  );

  // Catégorie 6 : Statement on Monetary Policy
  await pause();
  await traiterCategorie(
    "STATEMENT ON MONETARY POLICY",
    itemsSMP,
    (items) => items[0],
    morceaux,
    erreurs
  );

  // Catégorie 7 : Financial Stability Review
  await pause();
  await traiterCategorie(
    "FINANCIAL STABILITY REVIEW",
    itemsFSR,
    (items) => items[0],
    morceaux,
    erreurs
  );

  if (erreurs.length > 0) {
    console.warn("--- Catégories non récupérées pour RBA ---");
    erreurs.forEach((e) => console.warn("  -", e));
  }

  if (morceaux.length === 0) {
    throw new Error("Aucun document pertinent trouvé pour RBA (toutes catégories en échec)");
  }

  return morceaux.join("\n\n");
}
