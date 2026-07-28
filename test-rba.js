import { scraperRBA } from "./scrapers/scraperRBA.js";

(async () => {
  try {
    console.log("Lancement du scraper RBA...");
    const texte = await scraperRBA();

    const marqueurs = [
      "--- MEDIA RELEASE (DÉCISION) ---",
      "--- MINUTES ---",
      "--- DISCOURS ---",
      "--- STATEMENT ON MONETARY POLICY ---",
      "--- FINANCIAL STABILITY REVIEW ---",
    ];

    console.log("--- Vérification des sections ---");
    marqueurs.forEach((m) => {
      console.log(`${texte.includes(m) ? "✅" : "❌"} ${m}`);
    });

    console.log("Longueur totale :", texte.length, "caractères");
    console.log("--- Aperçu (500 premiers caractères) ---");
    console.log(texte.slice(0, 500));
  } catch (error) {
    console.error("Erreur :", error.message);
  }
})();
