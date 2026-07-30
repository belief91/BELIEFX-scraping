import { scraperBoE } from "./scrapers/scraperBoE.js";

const CATEGORIES = [
  "statement",
  "minutes",
  "discours",
  "presseConference",
  "monetaryPolicyReport",
  "beigeBook",
];

(async () => {
  for (const categorie of CATEGORIES) {
    try {
      console.log(`\n=== Test catégorie : ${categorie} ===`);
      const texte = await scraperBoE(categorie);
      console.log(`✅ OK — ${texte.length} caractères`);
      console.log(texte.slice(0, 200));
    } catch (error) {
      console.log(`❌ Erreur : ${error.message}`);
    }
  }
})();
