// scrapers/scraperBoJ.js
// NOUVEAU MODÈLE : une fonction par catégorie, appelée UNE SEULE À LA FOIS.
//
// Mapping des catégories génériques vers la réalité BoJ :
// - statement : Statement on Monetary Policy (PDF, table statique state_{année})
// - minutes : Minutes (PDF, table statique minu_{année})
// - presseConference : conférence de presse du Gouverneur — UNIQUEMENT en
//   japonais (pas de version anglaise officielle), traduite via DeepL
// - discours : discours (best-effort, table statique press index)
// - monetaryPolicyReport : Outlook for Economic Activity and Prices (PDF,
//   trimestriel)
// - beigeBook : Summary of Opinions (PDF, équivalent enquête le plus
//   proche pour la BoJ)

import * as cheerio from "cheerio";
import { createRequire } from "module";
import * as deepl from "deepl-node";
import { fetchAvecRetry } from "./fetchUtils.js";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const translator = new deepl.Translator(process.env.DEEPL_API_KEY);

const ANNEE = new Date().getFullYear();

const BOJ_STATEMENT_INDEX = `https://www.boj.or.jp/en/mopo/mpmdeci/state_${ANNEE}/index.htm`;
const BOJ_MINUTES_INDEX = `https://www.boj.or.jp/en/mopo/mpmsche_minu/minu_${ANNEE}/index.htm`;
const BOJ_OPINIONS_INDEX = `https://www.boj.or.jp/en/mopo/mpmsche_minu/opinion_${ANNEE}/index.htm`;
const BOJ_OUTLOOK_INDEX = `https://www.boj.or.jp/en/mopo/outlook/index.htm`;
const BOJ_SPEECHES_INDEX = `https://www.boj.or.jp/en/about/press/index.htm`;
const BOJ_KAIKEN_INDEX = `https://www.boj.or.jp/about/press/kaiken_${ANNEE}/index.htm`;

async function trouverPremierLienTable(url) {
  const response = await fetchAvecRetry(url);
  if (!response.ok) {
    throw new Error(`Échec lecture page BoJ (${url}) : HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  let premierLien = null;
  $("table a").each((_, el) => {
    if (premierLien) return;
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

async function traduireJaVersEn(texteJaponais) {
  const lignesJa = texteJaponais.split("\n").filter((l) => l.trim().length > 0);

  const lots = [];
  let lotCourant = [];
  let longueurCourante = 0;

  for (const ligne of lignesJa) {
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
  }

  return lignesTraduites.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Une fonction par catégorie
// ─────────────────────────────────────────────────────────────

async function scraperStatement() {
  const url = await trouverPremierLienTable(BOJ_STATEMENT_INDEX);
  return await extraireTextePDF(url);
}

async function scraperMinutes() {
  const url = await trouverPremierLienTable(BOJ_MINUTES_INDEX);
  return await extraireTextePDF(url);
}

async function scraperPresseConference() {
  const url = await trouverPremierLienTable(BOJ_KAIKEN_INDEX);
  const texteJa = await extraireTextePDF(url);
  if (!texteJa) throw new Error("PDF vide après extraction");
  return await traduireJaVersEn(texteJa);
}

async function scraperDiscours() {
  const url = await trouverPremierLienTable(BOJ_SPEECHES_INDEX);
  return await scraperPageHTML(url);
}

async function scraperMonetaryPolicyReport() {
  const url = await trouverPremierLienTable(BOJ_OUTLOOK_INDEX);
  return await extraireTextePDF(url);
}

async function scraperBeigeBook() {
  const url = await trouverPremierLienTable(BOJ_OPINIONS_INDEX);
  return await extraireTextePDF(url);
}

// ─────────────────────────────────────────────────────────────
// Routeur — n'exécute QUE la catégorie demandée
// ─────────────────────────────────────────────────────────────

const CATEGORIES = {
  statement: scraperStatement,
  minutes: scraperMinutes,
  presseConference: scraperPresseConference,
  discours: scraperDiscours,
  monetaryPolicyReport: scraperMonetaryPolicyReport,
  beigeBook: scraperBeigeBook,
};

export async function scraperBoJ(categorie) {
  const fonction = CATEGORIES[categorie];
  if (!fonction) {
    throw new Error(`Catégorie inconnue pour BoJ : "${categorie}"`);
  }
  return await fonction();
}
