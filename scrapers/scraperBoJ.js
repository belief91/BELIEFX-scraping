// scrapers/scraperBoJ.js
// Agrège les catégories pour la BoJ :
// - 1-2 : Statement on Monetary Policy (PDF, via table statique state_{année})
// - 3 : Minutes (PDF, via table statique minu_{année})
// - 7 : Summary of Opinions (PDF, via table statique opinion_{année})
// - 6 : Outlook for Economic Activity and Prices (PDF, trimestriel)
// - 5 : Discours (page listing, best-effort)
//
// Toutes les pages d'index BoJ (state_YYYY, minu_YYYY, opinion_YYYY) sont
// du HTML statique simple : un tableau Date | Titre, la ligne la plus
// récente en premier. Le "Statement" lui-même est désormais publié
// UNIQUEMENT en PDF (confirmé par recherche — contrairement à avant 2025
// où c'était du HTML), d'où l'usage de pdf-parse ici aussi.

import * as cheerio from "cheerio";
import { createRequire } from "module";
import * as deepl from "deepl-node";
import { fetchAvecRetry, pause } from "./fetchUtils.js";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const translator = new deepl.Translator(process.env.DEEPL_API_KEY);

const ANNEE = new Date().getFullYear();

const BOJ_STATEMENT_INDEX = `https://www.boj.or.jp/en/mopo/mpmdeci/state_${ANNEE}/index.htm`;
const BOJ_MINUTES_INDEX = `https://www.boj.or.jp/en/mopo/mpmsche_minu/minu_${ANNEE}/index.htm`;
const BOJ_OPINIONS_INDEX = `https://www.boj.or.jp/en/mopo/mpmsche_minu/opinion_${ANNEE}/index.htm`;
const BOJ_OUTLOOK_INDEX = `https://www.boj.or.jp/en/mopo/outlook/index.htm`;
const BOJ_SPEECHES_INDEX = `https://www.boj.or.jp/en/about/press/index.htm`;
// Conférence de presse : UNIQUEMENT en japonais (pas de version anglaise
// officielle) — site japonais, sans le préfixe /en/.
const BOJ_KAIKEN_INDEX = `https://www.boj.or.jp/about/press/kaiken_${ANNEE}/index.htm`;

/**
 * Trouve le lien du document le plus récent dans une table statique
 * BoJ (Date | Titre), qui liste toujours du plus récent au plus ancien.
 */
async function trouverPremierLienTable(url) {
  const response = await fetchAvecRetry(url);
  if (!response.ok) {
    throw new Error(`Échec lecture page BoJ (${url}) : HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  let premierLien = null;
  $("table a").each((_, el) => {
    if (premierLien) return; // première ligne du tableau = la plus récente
    const href = $(el).attr("href") || "";
    if (href) {
      premierLien = href.startsWith("http") ? href : `https://www.boj.or.jp${href}`;
    }
  });

  if (!premierLien) {
    throw new Error(`Aucun lien trouvé dans la table de ${url}`);
  }
  return premierLien;
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

async function scraperPageHTML(url, selecteur = "main p") {
  const response = await fetchAvecRetry(url);
  if (!response.ok) {
    throw new Error(`Échec scraping page BoJ (${url}) : HTTP ${response.status}`);
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
 * Traduit un texte japonais long en anglais via DeepL, en le découpant
 * en lots de ~4000 caractères pour rester sous la limite par appel API.
 */
async function traduireJaVersEn(texteJaponais) {
  const paragraphesJa = texteJaponais.split("\n").filter((l) => l.trim().length > 0);

  const lots = [];
  let lotCourant = [];
  let longueurCourante = 0;

  for (const ligne of paragraphesJa) {
    if (longueurCourante + ligne.length > 4000 && lotCourant.length > 0) {
      lots.push(lotCourant);
      lotCourant = [];
      longueurCourante = 0;
    }
    lotCourant.push(ligne);
    longueurCourante += ligne.length;
  }
  if (lotCourant.length > 0) lots.push(lotCourant);

  const lignesTraduites = [];
  for (const lot of lots) {
    const resultats = await translator.translateText(lot, "ja", "en-US");
    resultats.forEach((r) => lignesTraduites.push(r.text));
    await pause(300); // léger espacement entre lots pour rester raisonnable
  }

  return lignesTraduites.join("\n");
}

export async function scraperBoJ() {
  const morceaux = [];
  const erreurs = [];

  // Catégories 1-2 : Statement (PDF)
  try {
    const url = await trouverPremierLienTable(BOJ_STATEMENT_INDEX);
    const texte = await extraireTextePDF(url);
    if (texte) morceaux.push(`--- STATEMENT ON MONETARY POLICY ---\n${texte}`);
  } catch (err) {
    erreurs.push(`Statement : ${err.message}`);
  }

  // Catégorie 3 : Minutes (PDF)
  await pause();
  try {
    const url = await trouverPremierLienTable(BOJ_MINUTES_INDEX);
    const texte = await extraireTextePDF(url);
    if (texte) morceaux.push(`--- MINUTES ---\n${texte}`);
  } catch (err) {
    erreurs.push(`Minutes : ${err.message}`);
  }

  // Catégorie 7 : Summary of Opinions (PDF)
  await pause();
  try {
    const url = await trouverPremierLienTable(BOJ_OPINIONS_INDEX);
    const texte = await extraireTextePDF(url);
    if (texte) morceaux.push(`--- SUMMARY OF OPINIONS ---\n${texte}`);
  } catch (err) {
    erreurs.push(`Summary of Opinions : ${err.message}`);
  }

  // Catégorie 6 : Outlook Report (PDF, trimestriel)
  await pause();
  try {
    const url = await trouverPremierLienTable(BOJ_OUTLOOK_INDEX);
    const texte = await extraireTextePDF(url);
    if (texte) morceaux.push(`--- OUTLOOK REPORT ---\n${texte}`);
  } catch (err) {
    erreurs.push(`Outlook Report : ${err.message}`);
  }

  // Catégorie 4 : Conférence de presse (PDF japonais, traduit en anglais)
  await pause();
  try {
    const url = await trouverPremierLienTable(BOJ_KAIKEN_INDEX);
    const texteJa = await extraireTextePDF(url);
    if (!texteJa) {
      throw new Error("PDF vide après extraction");
    }
    const texteEn = await traduireJaVersEn(texteJa);
    if (texteEn) morceaux.push(`--- CONFÉRENCE DE PRESSE (traduit JA→EN) ---\n${texteEn}`);
  } catch (err) {
    erreurs.push(`Conférence de presse : ${err.message}`);
  }

  // Catégorie 5 : Discours (best-effort, structure non vérifiée)
  await pause();
  try {
    const url = await trouverPremierLienTable(BOJ_SPEECHES_INDEX);
    const texte = await scraperPageHTML(url);
    if (texte) morceaux.push(`--- DISCOURS ---\n${texte}`);
  } catch (err) {
    erreurs.push(`Discours : ${err.message}`);
  }

  if (erreurs.length > 0) {
    console.warn("--- Catégories non récupérées pour BoJ ---");
    erreurs.forEach((e) => console.warn("  -", e));
  }

  if (morceaux.length === 0) {
    throw new Error("Aucun document pertinent trouvé pour BoJ (toutes catégories en échec)");
  }

  return morceaux.join("\n\n");
}
