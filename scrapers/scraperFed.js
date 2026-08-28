// scrapers/scraperFed.js
// FIX : scraperMinutes() récupérait le communiqué ANNONÇANT la
// publication des minutes (692 caractères, confirmé par test réel), pas
// les minutes elles-mêmes. Corrigé — voir trouverLienMinutesReel().
//
// FIX ARCHITECTURE (28/08) : lireItemsRSS() ne capturait pas pubDate, et
// scraperStatement/scraperMinutes/scraperDiscours prenaient le premier
// item TROUVÉ dans le flux SANS jamais vérifier qu'il correspond à
// AUJOURD'HUI. Confirmé en production : scraperDiscours() a renvoyé un
// discours de plusieurs jours (Alaska, tarifs douaniers) comme
// "status: ok" alors que le discours attendu du jour ("fed chair warsh
// speech", 17h GMT+3) n'avait pas encore eu lieu — le flux RSS Fed
// contenait encore l'ancien discours comme item le plus récent, et rien
// ne vérifiait sa date.
//
// Architecture voulue : événement bancaire du jour trouvé via le
// calendrier BC => on scrape et on n'accepte QUE le contenu réellement
// publié aujourd'hui ; sinon c'est une erreur explicite (retry au
// prochain cron), jamais un ancien contenu accepté comme valide.
//
// estPublieAujourdhui() compare la date du pubDate RSS à la date du
// jour en GMT+3 (Indian/Antananarivo), cohérent avec la convention de
// date déjà utilisée partout ailleurs dans le projet (test-trade-).

import * as cheerio from "cheerio";
import { createRequire } from "module";
import { fetchAvecRetry } from "./fetchUtils.js";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const FED_MONETARY_RSS = "https://www.federalreserve.gov/feeds/press_monetary.xml";
const FED_SPEECHES_RSS = "https://www.federalreserve.gov/feeds/speeches.xml";
const FED_MPR_DEFAULT = "https://www.federalreserve.gov/monetarypolicy/publications/mpr_default.htm";
const FED_BEIGE_BOOK_DEFAULT = "https://www.federalreserve.gov/monetarypolicy/beige-book-default.htm";

function dateGMT3(date) {
  const options = { timeZone: "Indian/Antananarivo" };
  const y = date.toLocaleDateString("en-CA", { ...options, year: "numeric" });
  const m = date.toLocaleDateString("en-CA", { ...options, month: "2-digit" });
  const d = date.toLocaleDateString("en-CA", { ...options, day: "2-digit" });
  return `${y}-${m}-${d}`;
}

/**
 * Vérifie qu'un pubDate RSS correspond au jour courant en GMT+3. Un
 * pubDate absent ou illisible est traité comme "pas aujourd'hui" (échec
 * explicite plutôt que d'accepter par défaut un contenu non daté).
 */
function estPublieAujourdhui(pubDateStr) {
  if (!pubDateStr) return false;
  const date = new Date(pubDateStr);
  if (isNaN(date.getTime())) return false;
  return dateGMT3(date) === dateGMT3(new Date());
}

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
      pubDate: $(el).find("pubDate").first().text().trim() || null,
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

async function trouverLienMinutesReel(urlAnnonce) {
  const response = await fetchAvecRetry(urlAnnonce);
  if (!response.ok) {
    throw new Error(`Échec lecture page annonce minutes (${urlAnnonce}) : HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  let lien = null;
  $("a").each((_, el) => {
    if (lien) return;
    const texte = $(el).text().trim().toUpperCase();
    const href = $(el).attr("href") || "";
    if (texte === "HTML" && href.toLowerCase().includes("fomcminutes")) {
      lien = href.startsWith("http") ? href : `https://www.federalreserve.gov${href}`;
    }
  });

  if (!lien) {
    throw new Error(`Lien HTML des minutes introuvable sur la page d'annonce : ${urlAnnonce}`);
  }
  return lien;
}

// ─────────────────────────────────────────────────────────────
// Une fonction par catégorie
// ─────────────────────────────────────────────────────────────

async function scraperStatement() {
  const items = await lireItemsRSS(FED_MONETARY_RSS);
  const statement = items.find((it) => it.titre.toLowerCase().includes("fomc statement"));
  if (!statement) throw new Error("FOMC Statement : aucun item trouvé dans le flux");
  if (!estPublieAujourdhui(statement.pubDate)) {
    throw new Error(`FOMC Statement : le dernier item du flux date du ${statement.pubDate}, pas d'aujourd'hui — pas encore publié.`);
  }
  return await scraperPage(statement.lien);
}

async function scraperMinutes() {
  const items = await lireItemsRSS(FED_MONETARY_RSS);
  const minutes = items.find((it) =>
    it.titre.toLowerCase().includes("minutes of the federal open market committee")
  );
  if (!minutes) throw new Error("Minutes FOMC : aucun item trouvé dans le flux");
  if (!estPublieAujourdhui(minutes.pubDate)) {
    throw new Error(`Minutes FOMC : le dernier item du flux date du ${minutes.pubDate}, pas d'aujourd'hui — pas encore publié.`);
  }

  const lienReel = await trouverLienMinutesReel(minutes.lien);
  const texte = await scraperPage(lienReel);

  if (texte.length < 1000) {
    throw new Error(
      `Minutes FOMC : contenu récupéré trop court (${texte.length} caractères) sur ${lienReel} — le sélecteur CSS "#article p" ne correspond probablement pas à cette page, à vérifier manuellement.`
    );
  }

  return texte;
}

async function scraperPresseConference() {
  const items = await lireItemsRSS(FED_MONETARY_RSS);
  const statement = items.find((it) => it.titre.toLowerCase().includes("fomc statement"));
  if (!statement) throw new Error("Impossible de dériver la date : FOMC Statement non trouvé");
  if (!estPublieAujourdhui(statement.pubDate)) {
    throw new Error(`Conférence de presse FOMC : statement associé date du ${statement.pubDate}, pas d'aujourd'hui — pas encore publié.`);
  }

  const match = statement.lien.match(/monetary(\d{8})a\.htm/);
  if (!match) throw new Error(`Date non extractible de l'URL statement : ${statement.lien}`);

  const date = match[1];
  const urlPDF = `https://www.federalreserve.gov/mediacenter/files/FOMCpresconf${date}.pdf`;
  return await extraireTextePDF(urlPDF);
}

/**
 * FIX ARCHITECTURE (28/08) : vérifie désormais que le discours le plus
 * récent du flux date bien d'aujourd'hui avant de le retourner. Avant
 * ce fix, un discours vieux de plusieurs jours pouvait être renvoyé
 * comme "status: ok" simplement parce que l'événement du jour n'avait
 * pas encore eu lieu au moment du scraping.
 */
async function scraperDiscours() {
  const items = await lireItemsRSS(FED_SPEECHES_RSS);
  if (items.length === 0) throw new Error("Discours : aucun item dans le flux");

  const dernier = items[0];
  if (!estPublieAujourdhui(dernier.pubDate)) {
    throw new Error(`Discours : le dernier item du flux ("${dernier.titre}") date du ${dernier.pubDate}, pas d'aujourd'hui — pas encore prononcé/publié.`);
  }

  return await scraperPage(dernier.lien);
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
// Routeur
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
