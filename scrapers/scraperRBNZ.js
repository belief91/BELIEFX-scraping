// scrapers/scraperRBNZ.js
//
// FIX : ajout du parametre categorie, absent jusqu'ici. L'ancienne
// version renvoyait TOUJOURS media release + MPS combines, ignorant la
// categorie demandee. Mapping deduit des commentaires d'origine :
//   - statement / minutes : Media release (meme document)
//   - monetaryPolicyReport : Monetary Policy Statement complet
//   - discours / presseConference / beigeBook : non implementees

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
    throw new Error(`Echec scraping page RBNZ (${url}) : HTTP ${response.status}`);
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

async function trouverLiensDerniereDecision() {
  const response = await fetchAvecRetry(RBNZ_DECISIONS_PAGE, { headers: HEADERS_NAVIGATEUR });
  if (!response.ok) {
    throw new Error(`Echec lecture page decisions RBNZ : HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  let lienMediaRelease = null;
  let lienStatement = null;

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

async function scraperMediaRelease() {
  const { lienMediaRelease } = await trouverLiensDerniereDecision();
  if (!lienMediaRelease) {
    throw new Error("Media Release : aucun lien trouve dans la derniere ligne du tableau");
  }
  const texte = await scraperPage(lienMediaRelease);
  if (!texte) {
    throw new Error(`Media Release : 0 paragraphe extrait de ${lienMediaRelease}`);
  }
  return texte;
}

async function scraperMonetaryPolicyStatement() {
  const { lienStatement } = await trouverLiensDerniereDecision();
  if (!lienStatement) {
    throw new Error("Monetary Policy Statement : pas de MPS ce mois-ci (publie seulement 4x/an)");
  }
  const texte = await scraperPage(lienStatement);
  if (!texte) {
    throw new Error(`Monetary Policy Statement : 0 paragraphe extrait de ${lienStatement}`);
  }
  return texte;
}

async function nonImplemente(nomCategorie, raison) {
  throw new Error(`${nomCategorie} : non implemente pour RBNZ - ${raison}`);
}

const CATEGORIES = {
  statement: scraperMediaRelease,
  minutes: scraperMediaRelease,
  monetaryPolicyReport: scraperMonetaryPolicyStatement,
  discours: () => nonImplemente("Discours", "aucune source de decouverte fiable identifiee"),
  presseConference: () =>
    nonImplemente("Conference de presse", "video YouTube uniquement, pas de transcript texte officiel"),
  beigeBook: () =>
    nonImplemente("Financial Stability Review", "page de recherche dependante de JS, pas de listing statique fiable"),
};

export async function scraperRBNZ(categorie) {
  const fonction = CATEGORIES[categorie];
  if (!fonction) {
    throw new Error(`Categorie inconnue pour RBNZ : "${categorie}"`);
  }
  return await fonction();
}
