import { scraperECB } from "./scrapers/scraperECB.js";

(async () => {
  try {
    console.log("Lancement du scraper ECB...");
    const texte = await scraperECB();

    const marqueurs = [
      "--- DÉCISION / STATEMENT / Q&A ---",
      "--- MONETARY POLICY ACCOUNTS ---",
      "--- DISCOURS ---",
      "--- ECONOMIC BULLETIN ---",
      "--- FINANCIAL STABILITY REVIEW ---",
    ];

    console.log("--- Vérification des sections (7 catégories, 1-2-4 fusionnées) ---");
    marqueurs.forEach((m) => {
      console.log(`${texte.includes(m) ? "✅" : "❌"} ${m}`);
    });

    console.log("Longueur totale :", texte.length, "caractères");
  } catch (error) {
    console.error("Erreur :", error.message);
  }
})();
