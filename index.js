/**
 * Service de scraping BELIEFX — déployé sur Render
 * ====================================================
 * Rôle : exécuter le scraping (calendrier BC, et futurs scrapers) sans les
 * limites de temps d'exécution des fonctions serverless Vercel.
 *
 * Vercel garde la planification (cron, avantage plan gratuit) et appelle
 * ce service via HTTP. Ce service fait le travail lourd et renvoie du
 * JSON ; c'est Vercel qui sauvegarde ensuite dans Back4App (les clés
 * Back4App restent uniquement côté Vercel, pas dupliquées ici).
 *
 * Sécurité : protégé par un header partagé RENDER_SCRAPER_SECRET, pour
 * qu'on ne puisse pas appeler ce service publiquement sans autorisation.
 */

import "dotenv/config";
import express from "express";
import * as cheerio from "cheerio";
import { runGeopoliticalPipeline } from "./geopolitics/pipeline.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ---- Middleware d'authentification (partagé avec Vercel) ----
function verifierSecret(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const secretAttendu = process.env.RENDER_SCRAPER_SECRET;

  if (!secretAttendu || authHeader !== `Bearer ${secretAttendu}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ---- Logique de scraping (même méthode validée : cookies serveur TE) ----

const CALENDAR_URL = "https://tradingeconomics.com/calendar";

const COOKIES = {
  "calendar-importance": "3",
  "calendar-range": "3",
  "calendar-countries": "aus,can,emu,jpn,gbr,usa,wld,nzl,che",
  "cal-timezone-offset": "180",
};

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Referer": "https://www.google.com/",
};

const DATE_CLASS_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_PATTERN =
  /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\w+\s+\d{1,2}\s+\d{4}/i;

const ISO_TO_CURRENCY = {
  US: "USD", GB: "GBP", EA: "EUR", EU: "EUR", JP: "JPY",
  CA: "CAD", AU: "AUD", NZ: "NZD", CH: "CHF", SE: "SEK", NO: "NOK",
};

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
  if (period === "AM") { if (hh === 12) hh = 0; }
  else { if (hh !== 12) hh += 12; }
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
  const response = await fetch(CALENDAR_URL, {
    headers: { ...HEADERS, Cookie: buildCookieHeader(COOKIES) },
  });

  if (!response.ok) {
    throw new Error(`Échec du scraping calendrier TE : HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const resultats = [];
  let dateCourante = null;

  $("tr").each((_, row) => {
    const dateDetectee = parseDateHeader($, row);
    if (dateDetectee) {
      dateCourante = dateDetectee;
      return;
    }

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

    resultats.push({
      date: dateCourante,
      heureGmt3: heure,
      devise,
      evenement: event,
      reel: actualText,
      precedent: previousText,
      consensus: consensusText,
      prevision: forecastText,
      impact: "Fort (3/3)",
    });
  });

  return resultats;
}

// ---- TV5MONDE — scraping de la rubrique "International" (SSR, Drupal) ----

const TV5_BASE_URL = "https://information.tv5monde.com";
const TV5_INTERNATIONAL_URL = `${TV5_BASE_URL}/international`;

async function scraperTV5Monde() {
  const response = await fetch(TV5_INTERNATIONAL_URL, { headers: HEADERS });

  if (!response.ok) {
    throw new Error(`Échec du scraping TV5MONDE : HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const resultats = [];

  $(".views-row").each((_, row) => {
    // Les blocs vidéo en tête de page n'ont pas de résumé : on les ignore.
    const resumeEl = $(row).find(".views-field-field-resume").first();
    if (!resumeEl.length) return;

    const lienEl = $(row).find("a").first();
    const hrefRelatif = (lienEl.attr("href") || "").trim();
    if (!hrefRelatif) return;
    const url = hrefRelatif.startsWith("http") ? hrefRelatif : `${TV5_BASE_URL}${hrefRelatif}`;

    const titre = $(row)
      .find(".views-field-title .field--name-title")
      .first()
      .text()
      .trim();
    if (!titre) return;

    const description = resumeEl.text().replace(/\s+/g, " ").trim();
    const publieLe = $(row).find(".views-field-created time").first().attr("datetime") || null;
    const categorie = $(row).find(".views-field-field-surtitre-manuel").first().text().trim();

    resultats.push({
      titre,
      source: "TV5MONDE",
      url,
      publieLe,
      description,
      categorie,
    });
  });

  return resultats;
}

// ---- Routes ----

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

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

app.listen(PORT, () => {
  console.log(`Service de scraping BELIEFX démarré sur le port ${PORT}`);
});
