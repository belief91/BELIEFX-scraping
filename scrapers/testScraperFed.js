// scrapers/testScraperFed.js
//
// SCRAPER DE TEST — isolé de scrapers/scraperFed.js (production).
// Simule la vraie production (même flux : RSS -> filtre catégorie ->
// scraping page/PDF), avec UNE différence volontaire : ne vérifie PAS
// que le contenu date d'aujourd'hui. Retourne toujours "ce qui est
// présent au moment du scraping", jamais une erreur "pas encore publié".
//
// But : valider 4x/jour que la mécanique scrape -> filtre -> Back4App
// -> R2 fonctionne, sans dépendre d'un vrai événement du jour ni du
// calendrier BC. Aucun lien avec la vraie architecture de production —
// ne jamais importer ce fichier depuis un chemin de prod.
//
// Route Render associée : POST /scrape/test-central-bank

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
  if (!response.ok) throw new Error(`Échec lecture flux RSS (${url}) : HTTP ${response.status}`);
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
  if (!response.ok) throw new Error(`Échec scraping page (${url}) : HTTP ${response.status}`);
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
  if (!response.ok) throw new Error(`Échec téléchargement PDF (${url}) : HTTP ${response.status}`);
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
  if (!response.ok) throw new Error(`Échec lecture page de découverte (${urlPageDefault}) : HTTP ${response.status}`);
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

  if (!lien) throw new Error(`Aucun lien trouvé contenant "${motCleHref}" sur ${urlPageDefault}`);
  return lien;
}

async function trouverLienMinutesReel(urlAnnonce) {
  const response = await fetchAvecRetry(urlAnnonce);
  if (!response.ok) throw new Error(`Échec lecture page annonce minutes (${urlAnnonce}) : HTTP ${response.status}`);
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

  if (!lien) throw new Error(`Lien HTML des minutes introuvable sur : ${urlAnnonce}`);
  return lien;
}

// ─────────────────────────────────────────────────────────────
// Une fonction par catégorie — AUCUNE vérification de date, contrairement
// à scrapers/scraperFed.js. Retourne toujours le contenu le plus récent
// trouvé au moment de l'appel.
// ─────────────────────────────────────────────────────────────

async function testStatement() {
  const items = await lireItemsRSS(FED_MONETARY_RSS);
  const statement = items.find((it) => it.titre.toLowerCase().includes("fomc statement"));
  if (!statement) throw new Error("FOMC Statement : aucun item trouvé dans le flux");
  return { texte: await scraperPage(statement.lien), pubDate: statement.pubDate, source: statement.lien };
}

async function testMinutes() {
  const items = await lireItemsRSS(FED_MONETARY_RSS);
  const minutes = items.find((it) => it.titre.toLowerCase().includes("minutes of the federal open market committee"));
  if (!minutes) throw new Error("Minutes FOMC : aucun item trouvé dans le flux");
  const lienReel = await trouverLienMinutesReel(minutes.lien);
  const texte = await scraperPage(lienReel);
  return { texte, pubDate: minutes.pubDate, source: lienReel };
}

async function testPresseConference() {
  const items = await lireItemsRSS(FED_MONETARY_RSS);
  const statement = items.find((it) => it.titre.toLowerCase().includes("fomc statement"));
  if (!statement) throw new Error("Impossible de dériver la date : FOMC Statement non trouvé");

  const match = statement.lien.match(/monetary(\d{8})a\.htm/);
  if (!match) throw new Error(`Date non extractible de l'URL statement : ${statement.lien}`);

  const urlPDF = `https://www.federalreserve.gov/mediacenter/files/FOMCpresconf${match[1]}.pdf`;
  return { texte: await extraireTextePDF(urlPDF), pubDate: statement.pubDate, source: urlPDF };
}

async function testDiscours() {
  const items = await lireItemsRSS(FED_SPEECHES_RSS);
  if (items.length === 0) throw new Error("Discours : aucun item dans le flux");
  const dernier = items[0];
  return { texte: await scraperPage(dernier.lien), pubDate: dernier.pubDate, source: dernier.lien };
}

async function testMonetaryPolicyReport() {
  const url = await trouverDernierLien(FED_MPR_DEFAULT, "mpr-summary.htm");
  return { texte: await scraperPage(url), pubDate: null, source: url };
}

async function testBeigeBook() {
  const url = await trouverDernierLien(FED_BEIGE_BOOK_DEFAULT, "beigebook");
  return { texte: await scraperPage(url), pubDate: null, source: url };
}

const CATEGORIES_TEST = {
  statement: testStatement,
  minutes: testMinutes,
  presseConference: testPresseConference,
  discours: testDiscours,
  monetaryPolicyReport: testMonetaryPolicyReport,
  beigeBook: testBeigeBook,
};

export async function testScraperFed(categorie) {
  const fonction = CATEGORIES_TEST[categorie];
  if (!fonction) throw new Error(`Catégorie de test inconnue : "${categorie}"`);
  return await fonction();
}

export const CATEGORIES_TEST_DISPONIBLES = Object.keys(CATEGORIES_TEST);
