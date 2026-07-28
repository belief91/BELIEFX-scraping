// scrapers/scraperRBNZ.js
// Agrège les catégories pour la RBNZ, via la page statique et fiable
// "monetary-policy-decisions" qui liste toutes les décisions, la plus
// récente en première ligne du tableau :
// - 1-2-3 : Media release (décision + résumé des discussions, combinés
//   dans un seul document selon la description officielle RBNZ)
// - 6 : Statement (Monetary Policy Statement complet), présent uniquement
//   les mois où un MPS est publié (4x/an sur les 8 réunions annuelles)
//
// ⚠️ Catégories 5 (discours) et 7 (Financial Stability Review) : AUCUNE
// page de découverte statique fiable trouvée cette session — la page de
// recherche FSR de RBNZ retourne une erreur ("An error has occurred..."),
// signe qu'elle dépend d'un moteur de recherche JS, pas d'un listing
// statique. Non implémentées pour l'instant, documentées comme limite
// honnête plutôt que best-effort fragile.
//
// Catégorie 4 (conférence de presse) : conférences vidéo YouTube
// uniquement, pas de transcript texte officiel — non applicable en l'état.

import * as cheerio from "cheerio";
import { fetchAvecRetry } from "./fetchUtils.js";

const HEADERS_NAVIGATEUR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Referer": "https://www.rbnz.govt.nz/",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
};

const RBNZ_DECISIONS_PAGE = "https://www.rbnz.govt.nz/monetary-policy/monetary-policy-decisions";

async function scraperPage(url, selecteur = "main p") {
  const response = await fetchAvecRetry(url, { headers: HEADERS_NAVIGATEUR });
  if (!response.ok) {
    throw new Error(`Échec scraping page RBNZ (${url}) : HTTP ${response.status}`);
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

/**
 * Parcourt le tableau statique des décisions, retourne les liens
 * "Media release" et "Statement" (si présent) de la ligne la plus récente.
 */
async function trouverLiensDerniereDecision() {
  const response = await fetchAvecRetry(RBNZ_DECISIONS_PAGE, { headers: HEADERS_NAVIGATEUR });
  if (!response.ok) {
    throw new Error(`Échec lecture page décisions RBNZ : HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  let lienMediaRelease = null;
  let lienStatement = null;

  // La première ligne <tr> du tableau (hors en-têtes) correspond à la
  // décision la plus récente.
  const premiereLigne = $("table tr").filter((_, el) => {
    return $(el).find("a").length > 0;
  }).first();

  premiereLigne.find("a").each((_, el) => {
    const texte = $(el).text().trim().toLowerCase();
    const href = $(el).attr("href") || "";
    if (texte.includes("media release") && !lienMediaRelease) {
      lienMediaRelease = href;
    }
    if (texte.includes("statement") && !texte.includes("media") && !lienStatement) {
      lienStatement = href;
    }
  });

  return { lienMediaRelease, lienStatement };
}

export async function scraperRBNZ() {
  const morceaux = [];
  const erreurs = [];

  let liens = { lienMediaRelease: null, lienStatement: null };
  try {
    liens = await trouverLiensDerniereDecision();
  } catch (err) {
    erreurs.push(`Tableau des décisions : ${err.message}`);
  }

  // Catégories 1-2-3 : Media release (décision + résumé des discussions)
  try {
    if (liens.lienMediaRelease) {
      const texte = await scraperPage(liens.lienMediaRelease);
      if (texte) {
        morceaux.push(`--- MEDIA RELEASE (DÉCISION + RECORD OF MEETING) ---\n${texte}`);
      } else {
        erreurs.push(`Media Release : 0 paragraphe extrait de ${liens.lienMediaRelease}`);
      }
    } else {
      erreurs.push("Media Release : aucun lien trouvé dans la dernière ligne du tableau");
    }
  } catch (err) {
    erreurs.push(`Media Release : ${err.message}`);
  }

  // Catégorie 6 : Monetary Policy Statement complet (si publié ce mois-ci)
  try {
    if (liens.lienStatement) {
      const texte = await scraperPage(liens.lienStatement);
      if (texte) {
        morceaux.push(`--- MONETARY POLICY STATEMENT ---\n${texte}`);
      } else {
        erreurs.push(`Monetary Policy Statement : 0 paragraphe extrait de ${liens.lienStatement}`);
      }
    } else {
      erreurs.push("Monetary Policy Statement : pas de MPS ce mois-ci (publié seulement 4x/an)");
    }
  } catch (err) {
    erreurs.push(`Monetary Policy Statement : ${err.message}`);
  }

  // Catégories 5 et 7 : non implémentées, limite honnête documentée en en-tête
  erreurs.push("Discours : aucune source de découverte fiable identifiée cette session");
  erreurs.push("Financial Stability Review : aucune source de découverte fiable identifiée cette session");

  if (erreurs.length > 0) {
    console.warn("--- Catégories non récupérées pour RBNZ ---");
    erreurs.forEach((e) => console.warn("  -", e));
  }

  if (morceaux.length === 0) {
    throw new Error("Aucun document pertinent trouvé pour RBNZ (toutes catégories en échec)");
  }

  return morceaux.join("\n\n");
}
