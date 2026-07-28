import { scraperBoC } from "./scrapers/scraperBoC.js";

(async () => {
  try {
    console.log("Lancement du scraper BoC...");
    const texte = await scraperBoC();

    const marqueurs = [
      "--- RATE STATEMENT ---",
      "--- CONFÉRENCE DE PRESSE (OPENING STATEMENT) ---",
      "--- DISCOURS ---",
      "--- MONETARY POLICY REPORT ---",
      "--- SUMMARY OF DELIBERATIONS ---",
      "--- BUSINESS OUTLOOK SURVEY ---",
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
