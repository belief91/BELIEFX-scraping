import { scraperBoJ } from "./scrapers/scraperBoJ.js";

const CATEGORIES = [
  "statement",
  "minutes",
  "presseConference",
  "discours",
  "monetaryPolicyReport",
  "beigeBook",
];

(async () => {
  for (const categorie of CATEGORIES) {
    try {
      console.log(`\n=== Test catégorie : ${categorie} ===`);
      const texte = await scraperBoJ(categorie);
      console.log(`✅ OK — ${texte.length} caractères`);
      console.log(texte.slice(0, 200));
    } catch (error) {
      console.log(`❌ Erreur : ${error.message}`);
    }
  }
})();
