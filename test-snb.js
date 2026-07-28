import { scraperSNB } from "./scrapers/scraperSNB.js";

(async () => {
  try {
    console.log("Lancement du scraper SNB...");
    const texte = await scraperSNB();

    const marqueurs = [
      "--- MONETARY POLICY ASSESSMENT ---",
      "--- CONFÉRENCE DE PRESSE (INTRODUCTORY REMARKS) ---",
      "--- SUMMARY OF DISCUSSION ---",
      "--- DISCOURS ---",
      "--- QUARTERLY BULLETIN ---",
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
