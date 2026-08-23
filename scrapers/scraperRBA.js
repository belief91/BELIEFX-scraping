// scrapers/scraperRBA.js
//
// FIX (scraperMinutes) : cherchait "minutes" sur le listing
// /media-releases/, alors que les minutes RBA vivent sur une page
// dediee /monetary-policy/rba-board-minutes/{annee}/ (confirme par
// recherche web sur plusieurs vraies pages reelles).

import * as cheerio from "cheerio";
import { fetchAvecRetry } from "./fetchUtils.js";

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
    throw new Error(`Echec lecture flux RSS RBA (${url}) : HTTP ${response.status}`);
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

async function lireListingMediaReleases() {
  const response = await fetchAvecRetry(RBA_MEDIA_RELEASES_LISTING, {
    headers: HEADERS_NAVIGATEUR,
  });
  if (!response.ok) {
    throw new Error(`Echec lecture listing RBA : HTTP ${response.status}`);
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

async function trouverDernierLienMinutes() {
  const anneeCourante = new Date().getUTCFullYear();

  for (const annee of [anneeCourante, anneeCourante - 1]) {
    const urlIndex = `https://www.rba.gov.au/monetary-policy/rba-board-minutes/${annee}/`;

    let response;
    try {
      response = await fetchAvecRetry(urlIndex, { headers: HEADERS_NAVIGATEUR });
    } catch {
      continue;
    }
    if (!response.ok) continue;

    const html = await response.text();
    const $ = cheerio.load(html);

    let dernierLien = null;
    $("a").each((_, el) => {
      if (dernierLien) return;
      const href = $(el).attr("href") || "";
      if (new RegExp(`/rba-board-minutes/${annee}/\\d{4}-\\d{2}-\\d{2}\\.html$`).test(href)) {
        dernierLien = href.startsWith("http") ? href : `https://www.rba.gov.au${href}`;
      }
    });

    if (dernierLien) return dernierLien;
  }

  throw new Error(
    `Aucun lien de minutes trouve sur les index ${anneeCourante} et ${anneeCourante - 1}`
  );
}

async function scraperPage(url) {
  const response = await fetchAvecRetry(url, { headers: HEADERS_NAVIGATEUR });
  if (!response.ok) {
    throw new Error(`Echec scraping page RBA (${url}) : HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  const paragraphes = [];
  $("#content p").each((_, el) => {
    const texte = $(el).text().trim();
    if (texte.length > 0) paragraphes.push(texte);
  });
  return paragraphes.join("\n\n");
}

async function scraperStatement() {
  const items = await lireListingMediaReleases();
  const decision = items.find((it) =>
    ["monetary policy decision", "reserve bank board", "cash rate"].some((mot) =>
      it.titre.toLowerCase().includes(mot)
    )
  );
  if (!decision) throw new Error("Media Release (decision) : aucun item trouve");
  return await scraperPage(decision.lien);
}

async function scraperMinutes() {
  const lien = await trouverDernierLienMinutes();
  return await scraperPage(lien);
}

async function scraperDiscours() {
  const items = await lireItemsRSS(RBA_SPEECHES_RSS);
  if (items.length === 0) throw new Error("Discours : aucun item dans le flux");
  return await scraperPage(items[0].lien);
}

async function scraperMonetaryPolicyReport() {
  const items = await lireItemsRSS(RBA_SMP_RSS);
  if (items.length === 0) throw new Error("Statement on Monetary Policy : aucun item dans le flux");
  return await scraperPage(items[0].lien);
}

async function scraperBeigeBook() {
  const items = await lireItemsRSS(RBA_FSR_RSS);
  if (items.length === 0) throw new Error("Financial Stability Review : aucun item dans le flux");
  return await scraperPage(items[0].lien);
}

async function scraperPresseConference() {
  throw new Error("Categorie non applicable pour la RBA (pas de conference de presse systematique)");
}

const CATEGORIES = {
  statement: scraperStatement,
  minutes: scraperMinutes,
  discours: scraperDiscours,
  monetaryPolicyReport: scraperMonetaryPolicyReport,
  beigeBook: scraperBeigeBook,
  presseConference: scraperPresseConference,
};

export async function scraperRBA(categorie) {
  const fonction = CATEGORIES[categorie];
  if (!fonction) {
    throw new Error(`Categorie inconnue pour RBA : "${categorie}"`);
  }
  return await fonction();
}
