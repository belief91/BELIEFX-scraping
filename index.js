/**
 * Service de scraping BELIEFX — déployé sur Render
 * ====================================================
 * AJOUT : route /scrape/central-bank (POST), qui manquait entièrement —
 * render-routes-stub.js n'avait jamais été branché dans ce fichier, d'où
 * le 404 systématique observé sur toutes les banques (Fed comme RBA).
 * Nom de route volontairement sans "-statement" : "statement" n'est
 * qu'une des 6 valeurs possibles du paramètre `categorie`, pas le nom de
 * la route elle-même.
 */

import "dotenv/config";
import express from "express";
import * as cheerio from "cheerio";
import { runGeopoliticalPipeline } from "./geopolitics/pipeline.js";

import { scraperFed } from "./scrapers/scraperFed.js";
import { scraperECB } from "./scrapers/scraperECB.js";
import { scraperBoE } from "./scrapers/scraperBoE.js";
import { scraperBoJ } from "./scrapers/scraperBoJ.js";
import { scraperSNB } from "./scrapers/scraperSNB.js";
import { scraperBoC } from "./scrapers/scraperBoC.js";
import { scraperRBA } from "./scrapers/scraperRBA.js";
import { scraperRBNZ } from "./scrapers/scraperRBNZ.js";

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3001;

function verifierSecret(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const secretAttendu = process.env.RENDER_SCRAPER_SECRET;
  if (!secretAttendu || authHeader !== `Bearer ${secretAttendu}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const CALENDAR_URL = "https://tradingeconomics.com/calendar";
const COOKIES = {
  "calendar-importance": "3",
  "calendar-range": "3",
  "calendar-countries": "aus,can,emu,jpn,gbr,usa,wld,nzl,che",
  "cal-timezone-offset": "180",
};
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Referer": "https://www.google.com/",
};
const DATE_CLASS_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_PATTERN = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\w+\s+\d{1,2}\s+\d{4}/i;
const ISO_TO_CURRENCY = { US: "USD", GB: "GBP", EA: "EUR", EU: "EUR", JP: "JPY", CA: "CAD", AU: "AUD", NZ: "NZD", CH: "CHF", SE: "SEK", NO: "NOK" };

function buildCookieHeader(cookiesObj) {
  return Object.entries(cookiesObj).map(([k, v]) => `${k}=${v}`).join("; ");
}
function convertirEn24h(heureStr) {
  if (!heureStr) return "";
  const trimmed = heureStr.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return trimmed;
  let [, hh, mm, period] = match;
  hh = parseInt(hh, 10);
  period = period.toUpperCase();
  if (period === "AM") { if (hh === 12) hh = 0; } else { if (hh !== 12) hh += 12; }
  return `${String(hh).padStart(2, "0")}:${mm}`;
}
function trouverCelluleHeure($, row) {
  let heureTrouvee = "";
  $(row).find("td").each((_, td) => {
    if (heureTrouvee) return;
    const classAttr = $(td).attr("class") || "";
    const classes = classAttr.split(/\s+/).filter(Boolean);
    if (classes.some((c) => DATE_CLASS_PATTERN.test(c))) {
      const span = $(td).find("span").first();
      heureTrouvee = span.length ? span.text().trim() : $(td).text().trim();
    }
  });
  return convertirEn24h(heureTrouvee);
}
function parseDateHeader($, row) {
  const text = $(row).text().replace(/\s+/g, " ").trim();
  const match = text.match(DAY_PATTERN);
  return match ? match[0] : null;
}
async function scraperCalendrierBC() {
  const response = await fetch(CALENDAR_URL, { headers: { ...HEADERS, Cookie: buildCookieHeader(COOKIES) } });
  if (!response.ok) throw new Error(`Échec du scraping calendrier TE : HTTP ${response.status}`);
  const html = await response.text();
  const $ = cheerio.load(html);
  const resultats = [];
  let dateCourante = null;
  $("tr").each((_, row) => {
    const dateDetectee = parseDateHeader($, row);
    if (dateDetectee) { dateCourante = dateDetectee; return; }
    const event = $(row).attr("data-event");
    if (!event) return;
    const heure = trouverCelluleHeure($, row);
    const isoTag = $(row).find("td.calendar-iso").first();
    const isoCode = isoTag.length ? isoTag.text().trim() : "";
    const devise = ISO_TO_CURRENCY[isoCode] || isoCode;
    const actualText = $(row).find("td.calendar-item").eq(1).text().trim();
    const previousCell = $(row).find("td.calendar-item").eq(2).clone();
    previousCell.find('[id="revised"]').remove();
    const previousText = previousCell.text().trim();
    const consensusText = $(row).find("td.calendar-item").eq(3).text().trim();
    const forecastText = $(row).find("td.calendar-item").eq(4).text().trim();
    resultats.push({ date: dateCourante, heureGmt3: heure, devise, evenement: event, reel: actualText, precedent: previousText, consensus: consensusText, prevision: forecastText, impact: "Fort (3/3)" });
  });
  return resultats;
}

const TV5_RSS_URL = "https://information.tv5monde.com/rsstaxo/354";
function estLigneAuteur(texte) { return /^Par\s/i.test(texte) && texte.length < 80; }
function extraireResume(descriptionHtml) {
  const $desc = cheerio.load(descriptionHtml);
  let resume = $desc("strong p").first().text().trim();
  if (!resume || estLigneAuteur(resume)) {
    const paragraphes = $desc("p").map((_, el) => $desc(el).text().trim()).get();
    resume = paragraphes.find((p) => p && !estLigneAuteur(p)) || null;
  }
  if (resume && resume.length > 400) resume = resume.slice(0, 400).trim() + "…";
  return resume;
}
async function scraperTV5Monde() {
  const response = await fetch(TV5_RSS_URL, { headers: HEADERS });
  if (!response.ok) throw new Error(`Échec du scraping TV5MONDE (RSS) : HTTP ${response.status}`);
  const xml = await response.text();
  const $ = cheerio.load(xml, { xmlMode: true });
  const resultats = [];
  $("item").each((_, item) => {
    const titre = $(item).find("title").first().text().trim();
    const url = $(item).find("link").first().text().trim();
    const publieLe = $(item).find("pubDate").first().text().trim() || null;
    const descriptionHtml = $(item).find("description").first().text();
    if (!titre || !url) return;
    const resume = extraireResume(descriptionHtml);
    if (!resume) return;
    resultats.push({ titre, source: "TV5MONDE", url, publieLe, description: resume, categorie: "International" });
  });
  return resultats;
}

// ---- Banques centrales — AJOUT (manquait entièrement) ----
// RBNZ inclus (fichier scraperRBNZ.js confirmé présent). Norges Bank et
// Riksbank absents du routeur : aucun fichier scraper trouvé pour elles
// dans le repo — à ajouter si/quand ces fichiers existent.
const SCRAPERS_PAR_BANQUE = {
  Fed: scraperFed,
  ECB: scraperECB,
  BoE: scraperBoE,
  BoJ: scraperBoJ,
  SNB: scraperSNB,
  BoC: scraperBoC,
  RBA: scraperRBA,
  RBNZ: scraperRBNZ,
};

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/scrape/calendar-bc", verifierSecret, async (req, res) => {
  try {
    const evenements = await scraperCalendrierBC();
    res.json({ success: true, count: evenements.length, data: evenements });
  } catch (error) {
    console.error("Erreur scraping calendrier BC :", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/scrape/geopolitics", verifierSecret, async (req, res) => {
  try {
    const articles = await runGeopoliticalPipeline();
    res.json({ success: true, count: articles.length, data: articles });
  } catch (error) {
    console.error("Erreur pipeline géopolitique :", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/scrape/geopolitics/tv5monde", verifierSecret, async (req, res) => {
  try {
    const articles = await scraperTV5Monde();
    res.json({ success: true, count: articles.length, data: articles });
  } catch (error) {
    console.error("Erreur scraping TV5MONDE :", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /scrape/central-bank
 * Body : { banque: "Fed"|"ECB"|"BoE"|"BoJ"|"SNB"|"BoC"|"RBA"|"RBNZ", categorie: "statement"|"minutes"|"presseConference"|"discours"|"monetaryPolicyReport"|"beigeBook" }
 */
app.post("/scrape/central-bank", verifierSecret, async (req, res) => {
  const { banque, categorie } = req.body || {};

  const scraperCible = SCRAPERS_PAR_BANQUE[banque];
  if (!scraperCible) {
    return res.status(400).json({ success: false, error: `Banque inconnue ou non implémentée : "${banque}"` });
  }
  if (!categorie) {
    return res.status(400).json({ success: false, error: "Paramètre 'categorie' manquant" });
  }

  try {
    const texte = await scraperCible(categorie);
    res.json({ success: true, texte });
  } catch (error) {
    console.error(`Erreur /scrape/central-bank (${banque}/${categorie}) :`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Service de scraping BELIEFX démarré sur le port ${PORT}`);
});
