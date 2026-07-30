import { scraperSNB } from "./scrapers/scraperSNB.js";

const CATEGORIES = ["statement", "presseConference", "minutes", "discours", "monetaryPolicyReport", "beigeBook"];

(async () => {
  for (const categorie of CATEGORIES) {
    try {
      console.log(`\n=== Test catégorie : ${categorie} ===`);
      const texte = await scraperSNB(categorie);
      console.log(`✅ OK — ${texte.length} caractères`);
      console.log(texte.slice(0, 200));
    } catch (error) {
      console.log(`❌ Erreur : ${error.message}`);
    }
  }
})();
