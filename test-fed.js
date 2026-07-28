import { scraperFed } from "./scrapers/scraperFed.js";

(async () => {
  try {
    console.log("Lancement du scraper Fed...");
    const texte = await scraperFed();

    const marqueurs = [
      "--- FOMC STATEMENT ---",
      "--- MINUTES FOMC ---",
      "--- CONFÉRENCE DE PRESSE (PDF) ---",
      "--- DISCOURS ---",
      "--- MONETARY POLICY REPORT ---",
      "--- BEIGE BOOK ---",
    ];

    console.log("--- Vérification des 6 sections (7 catégories, 1-2 fusionnées) ---");
    marqueurs.forEach((m) => {
      console.log(`${texte.includes(m) ? "✅" : "❌"} ${m}`);
    });

    console.log("Longueur totale :", texte.length, "caractères");
  } catch (error) {
    console.error("Erreur :", error.message);
  }
})();
