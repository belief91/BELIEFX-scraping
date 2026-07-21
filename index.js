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

// ---- NewsAPI — source complémentaire pour l'actualité géopolitique ----

const NEWSAPI_URL = "https://newsapi.org/v2/everything";

async function scraperNewsAPI() {
  const cleApi = process.env.NEWS_API_KEY;
  if (!cleApi) {
    throw new Error("NEWS_API_KEY manquante dans les variables d'environnement");
  }

  const params = new URLSearchParams({
    q: "geopolitics OR sanctions OR central bank OR war OR treaty",
    language: "en",
    sortBy: "publishedAt",
    pageSize: "20",
    apiKey: cleApi,
  });

  const response = await fetch(`${NEWSAPI_URL}?${params.toString()}`);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Échec NewsAPI : HTTP ${response.status} — ${detail}`);
  }

  const data = await response.json();

  return data.articles.map((a) => ({
    titre: a.title,
    source: a.source?.name || null,
    url: a.url,
    publieLe: a.publishedAt,
    description: a.description,
  }));
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

app.get("/scrape/geopolitics/newsapi", verifierSecret, async (req, res) => {
  try {
    const articles = await scraperNewsAPI();
    res.json({ success: true, count: articles.length, data: articles });
  } catch (error) {
    console.error("Erreur scraping NewsAPI :", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Service de scraping BELIEFX démarré sur le port ${PORT}`);
});
