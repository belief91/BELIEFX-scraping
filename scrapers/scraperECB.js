// scrapers/scraperECB.js
// NOUVEAU MODÈLE : une fonction par catégorie, appelée UNE SEULE À LA FOIS.
//
// Mapping des catégories génériques vers la réalité ECB :
// - statement / presseConference : même document (le "monetary-policy-
//   statement" ECB contient déjà la décision + le Q&A de la conférence
//   de presse en une seule page)
// - minutes : "Monetary Policy Accounts"
// - discours : discours le plus récent (flux press.html)
// - monetaryPolicyReport : "Economic Bulletin" (équivalent périodique ECB)
// - beigeBook : "Financial Stability Review" (équivalent enquête/rapport
//   périodique le plus proche pour l'ECB)

import * as cheerio from "cheerio";
import { fetchAvecRetry } from "./fetchUtils.js";

const ECB_PRESS_RSS = "https://www.ecb.europa.eu/rss/press.html";
const ECB_PUB_RSS = "https://www.ecb.europa.eu/rss/pub.html";

const MOTS_CLES_TITRE_MOPO = [
  "monetary policy",
  "interest rate",
  "governing council",
  "deposit facility",
  "press conference",
];

async function lireItemsRSS(url) {
  const response = await fetchAvecRetry(url);
  if (!response.ok) {
    throw new Error(`Échec lecture flux RSS ECB (${url}) : HTTP ${response.status}`);
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
    throw new Error(`Échec scraping page ECB (${url}) : HTTP ${response.status}`);
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

async function scraperStatementOuPresseConference() {
  const items = await lireItemsRSS(ECB_PRESS_RSS);

  const statement = items.find((it) =>
    it.lien.includes("/press/press_conference/monetary-policy-statement/")
  );
  const decision =
    statement ||
    items.find((it) =>
      MOTS_CLES_TITRE_MOPO.some((mot) => it.titre.toLowerCase().includes(mot))
    );

  if (!decision) {
    throw new Error("Décision/Statement : aucun item trouvé dans le flux press.html");
  }
  return await scraperPage(decision.lien);
}

async function scraperMinutes() {
  const [itemsPress, itemsPub] = await Promise.all([
    lireItemsRSS(ECB_PRESS_RSS),
    lireItemsRSS(ECB_PUB_RSS),
  ]);

  const accounts = [...itemsPress, ...itemsPub].find(
    (it) =>
      it.titre.toLowerCase().includes("monetary policy accounts") ||
      it.titre.toLowerCase().includes("account of the monetary policy")
  );
  if (!accounts) {
    throw new Error("Monetary Policy Accounts : aucun item trouvé dans la fenêtre RSS actuelle");
  }
  return await scraperPage(accounts.lien);
}

async function scraperDiscours() {
  const items = await lireItemsRSS(ECB_PRESS_RSS);

  const discours = items.find(
    (it) =>
      it.titre.toLowerCase().includes("speech by") ||
      it.titre.toLowerCase().includes("speech at") ||
      it.titre.toLowerCase().includes("lecture by") ||
      it.titre.toLowerCase().includes("keynote")
  );
  if (!discours) {
    throw new Error("Discours : aucun item trouvé dans la fenêtre RSS actuelle");
  }
  return await scraperPage(discours.lien);
}

async function scraperMonetaryPolicyReport() {
  const [itemsPub, itemsPress] = await Promise.all([
    lireItemsRSS(ECB_PUB_RSS),
    lireItemsRSS(ECB_PRESS_RSS),
  ]);

  const bulletin = [...itemsPub, ...itemsPress].find((it) =>
    it.titre.toLowerCase().includes("economic bulletin")
  );
  if (!bulletin) {
    throw new Error("Economic Bulletin : aucun item trouvé dans la fenêtre RSS actuelle");
  }
  return await scraperPage(bulletin.lien);
}

async function scraperBeigeBook() {
  const [itemsPub, itemsPress] = await Promise.all([
    lireItemsRSS(ECB_PUB_RSS),
    lireItemsRSS(ECB_PRESS_RSS),
  ]);

  const fsr = [...itemsPub, ...itemsPress].find((it) =>
    it.titre.toLowerCase().includes("financial stability review")
  );
  if (!fsr) {
    throw new Error("Financial Stability Review : aucun item trouvé dans la fenêtre RSS actuelle");
  }
  return await scraperPage(fsr.lien);
}

// ─────────────────────────────────────────────────────────────
// Routeur — n'exécute QUE la catégorie demandée
// ─────────────────────────────────────────────────────────────

const CATEGORIES = {
  statement: scraperStatementOuPresseConference,
  presseConference: scraperStatementOuPresseConference, // même document pour l'ECB
  minutes: scraperMinutes,
  discours: scraperDiscours,
  monetaryPolicyReport: scraperMonetaryPolicyReport,
  beigeBook: scraperBeigeBook,
};

export async function scraperECB(categorie) {
  const fonction = CATEGORIES[categorie];
  if (!fonction) {
    throw new Error(`Catégorie inconnue pour ECB : "${categorie}"`);
  }
  return await fonction();
}
