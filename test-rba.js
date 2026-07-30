import { scraperRBA } from "./scrapers/scraperRBA.js";

const CATEGORIES = ["statement", "minutes", "discours", "monetaryPolicyReport", "beigeBook", "presseConference"];

(async () => {
  for (const categorie of CATEGORIES) {
    try {
      console.log(`\n=== Test catégorie : ${categorie} ===`);
      const texte = await scraperRBA(categorie);
      console.log(`✅ OK — ${texte.length} caractères`);
      console.log(texte.slice(0, 200));
    } catch (error) {
      console.log(`❌ Erreur : ${error.message}`);
    }
  }
})();
