// scrapers/scraperSNB.js
// NOUVEAU MODÈLE : une fonction par catégorie, appelée UNE SEULE À LA FOIS.
//
// Mapping des catégories génériques vers la réalité SNB :
// - statement : Monetary Policy Assessment (flux dédié /public/rss/en/mopo)
// - presseConference : Introductory remarks / news conference (flux speeches)
// - minutes : Summary of discussion (flux mopo, pratique ponctuelle depuis
//   sept. 2025 — peut légitimement être absent la plupart du temps)
// - discours : discours le plus récent (flux dédié /public/rss/en/speeches)
// - monetaryPolicyReport : Quarterly Bulletin (flux dédié /public/rss/en/quartbul)
// - beigeBook : NON APPLICABLE pour la SNB (aucune enquête périodique
//   identifiée dans le référentiel) — erreur explicite si jamais demandée

import * as cheerio from "cheerio";
import { fetchAvecRetry } from "./fetchUtils.js";

const SNB_MOPO_RSS = "https://www.snb.ch/public/rss/en/mopo";
const SNB_SPEECHES_RSS = "https://www.snb.ch/public/rss/en/speeches";
const SNB_QUARTBUL_RSS = "https://www.snb.ch/public/rss/en/quartbul";

async function lireItemsRSS(url) {
  const response = await fetchAvecRetry(url);
  if (!response.ok) {
    throw new Error(`Échec lecture flux RSS SNB (${url}) : HTTP ${response.status}`);
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
    throw new Error(`Échec scraping page SNB (${url}) : HTTP ${response.status}`);
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

// ─────────────────────────────────────────────────────────────
// Une fonction par catégorie
// ─────────────────────────────────────────────────────────────

async function scraperStatement() {
  const items = await lireItemsRSS(SNB_MOPO_RSS);
  const decision = items.find((it) =>
    it.titre.toLowerCase().includes("monetary policy assessment")
  );
  if (!decision) throw new Error("Monetary Policy Assessment : aucun item trouvé");
  return await scraperPage(decision.lien);
}

async function scraperPresseConference() {
  const items = await lireItemsRSS(SNB_SPEECHES_RSS);
  const remarks = items.find((it) =>
    it.titre.toLowerCase().includes("introductory remarks")
  );
  if (!remarks) throw new Error("Conférence de presse : aucun item trouvé dans le flux speeches");
  return await scraperPage(remarks.lien);
}

async function scraperMinutes() {
  const items = await lireItemsRSS(SNB_MOPO_RSS);
  const minutes = items.find((it) =>
    it.titre.toLowerCase().includes("summary of discussion")
  );
  if (!minutes) {
    throw new Error("Summary of discussion : aucun item trouvé dans la fenêtre RSS actuelle");
  }
  return await scraperPage(minutes.lien);
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
  throw new Error("Catégorie non applicable pour la SNB (aucune enquête périodique identifiée)");
}

// ─────────────────────────────────────────────────────────────
// Routeur — n'exécute QUE la catégorie demandée
// ─────────────────────────────────────────────────────────────

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
    throw new Error(`Catégorie inconnue pour SNB : "${categorie}"`);
  }
  return await fonction();
}
