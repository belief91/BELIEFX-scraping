import { scraperBoE } from "./scrapers/scraperBoE.js";

(async () => {
  try {
    console.log("Lancement du scraper BoE...");
    const texte = await scraperBoE();
    console.log("--- RÉSULTAT ---");
    console.log(texte.slice(0, 1500));
    console.log("--- FIN (longueur totale:", texte.length, "caractères) ---");
  } catch (error) {
    console.error("Erreur :", error.message);
  }
})();
