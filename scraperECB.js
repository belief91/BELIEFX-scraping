// scraperECB.js — à intégrer dans le repo E:\scraping (belief91/BELIEFX-scraping)
// Utilise le flux RSS officiel de l'ECB pour trouver le communiqué le plus récent
// (contourne le rendu JavaScript de la page de listing classique), puis scrape
// le texte complet de ce communiqué.

const axios = require("axios");
const cheerio = require("cheerio");

const ECB_RSS_URL = "https://www.ecb.europa.eu/rss/press.html";

/**
 * Trouve l'URL du communiqué de politique monétaire le plus récent
 * dans le flux RSS de l'ECB.
 * Cible en priorité les liens "monetary-policy-statement" (texte complet
 * avec Q&A) ; à défaut, le communiqué court "press/pr/date/".
 */
async function trouverDernierCommuniqueECB() {
  const { data: xml } = await axios.get(ECB_RSS_URL);
  const $ = cheerio.load(xml, { xmlMode: true });

  const liens = [];
  $("item link").each((_, el) => {
    liens.push($(el).text().trim());
  });

  const statement = liens.find((url) =>
    url.includes("/press/press_conference/monetary-policy-statement/")
  );
  if (statement) return statement;

  const communique = liens.find((url) => url.includes("/press/pr/date/"));
  if (communique) return communique;

  throw new Error("Aucun communiqué de politique monétaire trouvé dans le flux RSS ECB");
}

/**
 * Scrape le texte complet du communiqué ECB le plus récent.
 * Retourne le texte brut (paragraphes séparés par \n\n),
 * prêt pour lib/paragraph-filter-service.js côté Vercel.
 */
async function scraperECB() {
  const url = await trouverDernierCommuniqueECB();
  const { data: html } = await axios.get(url);
  const $ = cheerio.load(html);

  // Le contenu principal de l'ECB est dans la zone #main-content,
  // les paragraphes de texte sont dans des balises <p> classiques.
  const paragraphes = [];
  $("#main-content p").each((_, el) => {
    const texte = $(el).text().trim();
    if (texte.length > 0) paragraphes.push(texte);
  });

  if (paragraphes.length === 0) {
    throw new Error(`Aucun paragraphe trouvé sur la page ECB : ${url}`);
  }

  return paragraphes.join("\n\n");
}

module.exports = { scraperECB };
