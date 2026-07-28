import { scraperRBNZ } from "./scrapers/scraperRBNZ.js";

(async () => {
  try {
    console.log("Lancement du scraper RBNZ...");
    const texte = await scraperRBNZ();

    const marqueurs = [
      "--- MEDIA RELEASE (DÉCISION + RECORD OF MEETING) ---",
      "--- MONETARY POLICY STATEMENT ---",
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
