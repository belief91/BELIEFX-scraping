// scrapers/scraperSNB.js
//
// FIX (scraperMinutes) : depuis septembre 2025, la SNB ne publie plus
// le "Summary of discussion" via son flux RSS. Le document existe
// toujours, a une URL previsible. Construction directe de l'URL a
// partir de la date de decision + 29 jours (pattern confirme sur 4
// publications reelles). Essaie aussi 28 et 30 jours en secours.
//
// ATTENTION NON VERIFIEE : le format exact du lien RSS pour l'item
// "Monetary Policy Assessment" (pattern date a 8 chiffres), jamais
// confirme directement sur le flux SNB_MOPO_RSS reel.

import * as cheerio from "cheerio";
import { fetchAvecRetry } from "./fetchUtils.js";

const SNB_MOPO_RSS = "https://www.snb.ch/public/rss/en/mopo";
const SNB_SPEECHES_RSS = "https://www.snb.ch/public/rss/en/speeches";
const SNB_QUARTBUL_RSS = "https://www.snb.ch/public/rss/en/quartbul";

async function lireItemsRSS(url) {
  const response = await fetchAvecRetry(url);
  if (!response.ok) {
    throw new Error(`Echec lecture flux RSS SNB (${url}) : HTTP ${response.status}`);
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

async function scraperPage(url) {
  const response = await fetchAvecRetry(url);
  if (!response.ok) {
    throw new Error(`Echec scraping page SNB (${url}) : HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  const paragraphes = [];
  $("main p").each((_, el) => {
    const texte = $(el).text().trim();
    if (texte.length > 0) paragraphes.push(texte);
  });
  return paragraphes.join("\n\n");
}

async function scraperStatement() {
  const items = await lireItemsRSS(SNB_MOPO_RSS);
  const decision = items.find((it) =>
    it.titre.toLowerCase().includes("monetary policy assessment")
  );
  if (!decision) throw new Error("Monetary Policy Assessment : aucun item trouve");
  return await scraperPage(decision.lien);
}

async function scraperPresseConference() {
  const items = await lireItemsRSS(SNB_SPEECHES_RSS);
  const remarks = items.find((it) =>
    it.titre.toLowerCase().includes("introductory remarks")
  );
  if (!remarks) throw new Error("Conference de presse : aucun item trouve dans le flux speeches");
  return await scraperPage(remarks.lien);
}

async function scraperMinutes() {
  const items = await lireItemsRSS(SNB_MOPO_RSS);
  const decision = items.find((it) =>
    it.titre.toLowerCase().includes("monetary policy assessment")
  );
  if (!decision) {
    throw new Error("Impossible de deriver la date : decision SNB non trouvee dans le flux");
  }

  const matchDate = decision.lien.match(/(\d{8})/);
  if (!matchDate) {
    throw new Error(`Date de decision non extractible de l'URL : ${decision.lien}`);
  }

  const dateStr = matchDate[1];
  const annee = parseInt(dateStr.slice(0, 4), 10);
  const mois = parseInt(dateStr.slice(4, 6), 10) - 1;
  const jour = parseInt(dateStr.slice(6, 8), 10);
  const dateDecision = new Date(Date.UTC(annee, mois, jour));

  const decalagesEssai = [29, 28, 30];
  let derniereErreur = null;

  for (const decalage of decalagesEssai) {
    const datePublication = new Date(dateDecision);
    datePublication.setUTCDate(datePublication.getUTCDate() + decalage);
    const yyyy = datePublication.getUTCFullYear();
    const mm = String(datePublication.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(datePublication.getUTCDate()).padStart(2, "0");
    const url = `https://www.snb.ch/en/publications/communication/summaries/zus_${yyyy}${mm}${dd}`;

    try {
      const texte = await scraperPage(url);
      if (texte.length > 500) {
        return texte;
      }
      derniereErreur = new Error(`Page trouvee mais contenu trop court (${texte.length} caracteres) : ${url}`);
    } catch (err) {
      derniereErreur = err;
    }
  }

  throw new Error(
    `Summary of discussion SNB introuvable apres tentatives a +28/+29/+30 jours depuis la decision : ${derniereErreur?.message}`
  );
}

async function scraperDiscours() {
  const items = await lireItemsRSS(SNB_SPEECHES_RSS);
  if (items.length === 0) throw new Error("Discours : aucun item dans le flux");
  return await scraperPage(items[0].lien);
}

async function scraperMonetaryPolicyReport() {
  const items = await lireItemsRSS(SNB_QUARTBUL_RSS);
  if (items.length === 0) throw new Error("Quarterly Bulletin : aucun item dans le flux");
  return await scraperPage(items[0].lien);
}

async function scraperBeigeBook() {
  throw new Error("Categorie non applicable pour la SNB (aucune enquete periodique identifiee)");
}

const CATEGORIES = {
  statement: scraperStatement,
  presseConference: scraperPresseConference,
  minutes: scraperMinutes,
  discours: scraperDiscours,
  monetaryPolicyReport: scraperMonetaryPolicyReport,
  beigeBook: scraperBeigeBook,
};

export async function scraperSNB(categorie) {
  const fonction = CATEGORIES[categorie];
  if (!fonction) {
    throw new Error(`Categorie inconnue pour SNB : "${categorie}"`);
  }
  return await fonction();
}
