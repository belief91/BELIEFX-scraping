import { scraperBoJ } from "./scrapers/scraperBoJ.js";

(async () => {
  try {
    console.log("Lancement du scraper BoJ...");
    const texte = await scraperBoJ();

    const marqueurs = [
      "--- STATEMENT ON MONETARY POLICY ---",
      "--- MINUTES ---",
      "--- SUMMARY OF OPINIONS ---",
      "--- OUTLOOK REPORT ---",
      "--- CONFÉRENCE DE PRESSE (traduit JA→EN) ---",
      "--- DISCOURS ---",
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
