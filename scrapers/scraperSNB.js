// scrapers/scraperSNB.js
// Agrège les catégories pour la SNB :
// - 1-2 : Monetary Policy Assessment (flux dédié /public/rss/en/mopo)
// - 3 : Summary of the discussion (minutes, nouveauté depuis sept. 2025,
//        même flux mopo)
// - 4 : Introductory remarks / news conference (même flux mopo, publié le
//        même jour que la décision — équivalent à une conférence de presse)
// - 5 : Discours (flux dédié /public/rss/en/speeches)
// - 6 : Quarterly Bulletin (flux dédié /public/rss/en/quartbul)
// - 7 : non applicable pour la SNB (aucune enquête périodique identifiée
//        dans le référentiel)

import * as cheerio from "cheerio";
import { fetchAvecRetry, pause } from "./fetchUtils.js";

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
  // RSS 1.0 (format SNB) utilise <item> comme RSS 2.0, mais parfois avec
  // un namespace différent — <rdf:RDF>. cheerio en xmlMode gère les deux.
  $("item").each((_, el) => {
    items.push({
      titre: $(el).find("title").text().trim(),
      lien: $(el).find("link").text().trim(),
    });
  });
  return items;
}

async function scraperPage(url, selecteur = "main p") {
  const response = await fetchAvecRetry(url);
  if (!response.ok) {
    throw new Error(`Échec scraping page SNB (${url}) : HTTP ${response.status}`);
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

export async function scraperSNB() {
  const morceaux = [];
  const erreurs = [];

  let itemsMopo = [];
  let itemsSpeeches = [];
  let itemsQuartbul = [];

  try {
    itemsMopo = await lireItemsRSS(SNB_MOPO_RSS);
  } catch (err) {
    erreurs.push(`Flux mopo : ${err.message}`);
  }

  await pause();
  try {
    itemsSpeeches = await lireItemsRSS(SNB_SPEECHES_RSS);
  } catch (err) {
    erreurs.push(`Flux speeches : ${err.message}`);
  }

  await pause();
  try {
    itemsQuartbul = await lireItemsRSS(SNB_QUARTBUL_RSS);
  } catch (err) {
    erreurs.push(`Flux quartbul : ${err.message}`);
  }

  // Catégories 1-2 : Monetary Policy Assessment
  await pause();
  try {
    const decision = itemsMopo.find((it) =>
      it.titre.toLowerCase().includes("monetary policy assessment")
    );
    if (decision) {
      const texte = await scraperPage(decision.lien);
      if (texte) morceaux.push(`--- MONETARY POLICY ASSESSMENT ---\n${texte}`);
    } else {
      erreurs.push("Monetary Policy Assessment : aucun item trouvé");
    }
  } catch (err) {
    erreurs.push(`Monetary Policy Assessment : ${err.message}`);
  }

  // Catégorie 4 : Introductory remarks / news conference
  // (classé sous le flux "speeches", pas "mopo" — confirmé par diagnostic)
  await pause();
  try {
    const remarks = itemsSpeeches.find((it) =>
      it.titre.toLowerCase().includes("introductory remarks")
    );
    if (remarks) {
      const texte = await scraperPage(remarks.lien);
      if (texte) morceaux.push(`--- CONFÉRENCE DE PRESSE (INTRODUCTORY REMARKS) ---\n${texte}`);
    } else {
      erreurs.push("Conférence de presse : aucun item trouvé dans le flux speeches");
    }
  } catch (err) {
    erreurs.push(`Conférence de presse : ${err.message}`);
  }

  // Catégorie 3 : Summary of discussion (minutes, depuis sept. 2025)
  // Titre exact confirmé par diagnostic : "Summary of discussion" (sans "the")
  await pause();
  try {
    const minutes = itemsMopo.find((it) =>
      it.titre.toLowerCase().includes("summary of discussion")
    );
    if (minutes) {
      const texte = await scraperPage(minutes.lien);
      if (texte) morceaux.push(`--- SUMMARY OF DISCUSSION ---\n${texte}`);
    } else {
      erreurs.push("Summary of discussion : aucun item trouvé dans la fenêtre RSS actuelle");
    }
  } catch (err) {
    erreurs.push(`Summary of discussion : ${err.message}`);
  }

  // Catégorie 5 : Discours le plus récent
  await pause();
  try {
    if (itemsSpeeches.length > 0) {
      const texte = await scraperPage(itemsSpeeches[0].lien);
      if (texte) morceaux.push(`--- DISCOURS ---\n${texte}`);
    } else {
      erreurs.push("Discours : aucun item dans le flux");
    }
  } catch (err) {
    erreurs.push(`Discours : ${err.message}`);
  }

  // Catégorie 6 : Quarterly Bulletin
  await pause();
  try {
    if (itemsQuartbul.length > 0) {
      const texte = await scraperPage(itemsQuartbul[0].lien);
      if (texte) morceaux.push(`--- QUARTERLY BULLETIN ---\n${texte}`);
    } else {
      erreurs.push("Quarterly Bulletin : aucun item dans le flux");
    }
  } catch (err) {
    erreurs.push(`Quarterly Bulletin : ${err.message}`);
  }

  if (erreurs.length > 0) {
    console.warn("--- Catégories non récupérées pour SNB ---");
    erreurs.forEach((e) => console.warn("  -", e));
  }

  if (morceaux.length === 0) {
    throw new Error("Aucun document pertinent trouvé pour SNB (toutes catégories en échec)");
  }

  return morceaux.join("\n\n");
}
