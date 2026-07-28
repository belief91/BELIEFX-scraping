// scrapers/scraperECB.js
// Agrège les catégories pour l'ECB :
// - 1-2-4 : Décision + Statement + Q&A conférence de presse (une seule page, /rss/press.html)
// - 3 : Monetary Policy Accounts (minutes), filtré par titre (/rss/press.html ou /rss/pub.html)
// - 5 : Discours, filtré par titre (/rss/press.html, déjà mélangé avec le reste)
// - 6 : Economic Bulletin, filtré par titre (/rss/pub.html)
// - 7 : Financial Stability Review, filtré par titre (/rss/pub.html)
//
// Catégories 3, 5, 6, 7 sont "best-effort" : les pages d'index ECB étant
// rendues en JavaScript (pas de sitemap statique comme la Fed/BoE), on ne
// peut compter que sur la présence de l'item dans la fenêtre récente du
// flux RSS. Si absent, la catégorie est skip proprement (comportement
// normal, pas un bug — ces publications sont périodiques, pas quotidiennes).

import * as cheerio from "cheerio";
import { fetchAvecRetry, pause } from "./fetchUtils.js";

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

  // Confirmé par diagnostic : <main> contient les paragraphes réels
  const paragraphes = [];
  $("main p").each((_, el) => {
    const texte = $(el).text().trim();
    if (texte.length > 0) paragraphes.push(texte);
  });
  return paragraphes.join("\n\n");
}

export async function scraperECB() {
  const morceaux = [];
  const erreurs = [];

  let itemsPress = [];
  let itemsPub = [];

  try {
    itemsPress = await lireItemsRSS(ECB_PRESS_RSS);
  } catch (err) {
    erreurs.push(`Flux /rss/press.html : ${err.message}`);
  }

  await pause();
  try {
    itemsPub = await lireItemsRSS(ECB_PUB_RSS);
  } catch (err) {
    erreurs.push(`Flux /rss/pub.html : ${err.message}`);
  }

  // Catégories 1-2-4 : Décision + Statement + Q&A (une seule page)
  await pause();
  try {
    const statement = itemsPress.find((it) =>
      it.lien.includes("/press/press_conference/monetary-policy-statement/")
    );
    const decision =
      statement ||
      itemsPress.find((it) =>
        MOTS_CLES_TITRE_MOPO.some((mot) => it.titre.toLowerCase().includes(mot))
      );

    if (decision) {
      const texte = await scraperPage(decision.lien);
      if (texte) morceaux.push(`--- DÉCISION / STATEMENT / Q&A ---\n${texte}`);
    } else {
      erreurs.push("Décision/Statement : aucun item trouvé");
    }
  } catch (err) {
    erreurs.push(`Décision/Statement : ${err.message}`);
  }

  // Catégorie 3 : Monetary Policy Accounts (minutes)
  await pause();
  try {
    const accounts = [...itemsPress, ...itemsPub].find((it) =>
      it.titre.toLowerCase().includes("monetary policy accounts") ||
      it.titre.toLowerCase().includes("account of the monetary policy")
    );
    if (accounts) {
      const texte = await scraperPage(accounts.lien);
      if (texte) morceaux.push(`--- MONETARY POLICY ACCOUNTS ---\n${texte}`);
    } else {
      erreurs.push("Monetary Policy Accounts : aucun item trouvé dans la fenêtre RSS actuelle");
    }
  } catch (err) {
    erreurs.push(`Monetary Policy Accounts : ${err.message}`);
  }

  // Catégorie 5 : Discours le plus récent
  await pause();
  try {
    const discours = itemsPress.find(
      (it) =>
        it.titre.toLowerCase().includes("speech by") ||
        it.titre.toLowerCase().includes("speech at") ||
        it.titre.toLowerCase().includes("lecture by") ||
        it.titre.toLowerCase().includes("keynote")
    );
    if (discours) {
      const texte = await scraperPage(discours.lien);
      if (texte) morceaux.push(`--- DISCOURS ---\n${texte}`);
    } else {
      erreurs.push("Discours : aucun item trouvé dans la fenêtre RSS actuelle");
    }
  } catch (err) {
    erreurs.push(`Discours : ${err.message}`);
  }

  // Catégorie 6 : Economic Bulletin
  await pause();
  try {
    const bulletin = [...itemsPub, ...itemsPress].find((it) =>
      it.titre.toLowerCase().includes("economic bulletin")
    );
    if (bulletin) {
      const texte = await scraperPage(bulletin.lien);
      if (texte) morceaux.push(`--- ECONOMIC BULLETIN ---\n${texte}`);
    } else {
      erreurs.push("Economic Bulletin : aucun item trouvé dans la fenêtre RSS actuelle");
    }
  } catch (err) {
    erreurs.push(`Economic Bulletin : ${err.message}`);
  }

  // Catégorie 7 : Financial Stability Review
  await pause();
  try {
    const fsr = [...itemsPub, ...itemsPress].find((it) =>
      it.titre.toLowerCase().includes("financial stability review")
    );
    if (fsr) {
      const texte = await scraperPage(fsr.lien);
      if (texte) morceaux.push(`--- FINANCIAL STABILITY REVIEW ---\n${texte}`);
    } else {
      erreurs.push("Financial Stability Review : aucun item trouvé dans la fenêtre RSS actuelle");
    }
  } catch (err) {
    erreurs.push(`Financial Stability Review : ${err.message}`);
  }

  if (erreurs.length > 0) {
    console.warn("--- Catégories non récupérées pour ECB ---");
    erreurs.forEach((e) => console.warn("  -", e));
  }

  if (morceaux.length === 0) {
    throw new Error("Aucun document pertinent trouvé pour ECB (toutes catégories en échec)");
  }

  return morceaux.join("\n\n");
}
