import { collectNewsAPI } from "./newsapi.js";
import { processGeopoliticalArticles } from "./processor.js";

/**
 * Pipeline géopolitique — BELIEFX
 * =================================
 * Collecte (NewsAPI, 10 requêtes thématiques) -> filtrage (sources fiables,
 * mots-clés, exclusions, catégorisation, doublons).
 *
 * ⚠️ Traduction FR désactivée pour l'instant (décision du 2026-07-17) :
 * translator.js existe mais n'est pas appelé ici. Le traduire un par un
 * avec 1s de pause entre chaque articles peut prendre plusieurs minutes,
 * ce qui dépasserait le maxDuration=60s de la route Vercel qui attend la
 * réponse de ce service. Les articles restent donc en anglais pour le
 * moment. Si besoin de traduction plus tard, revoir vers un traitement
 * par lots en parallèle plutôt qu'un article à la fois.
 */
export async function runGeopoliticalPipeline() {
  console.log("=== Démarrage pipeline géopolitique ===");

  const rawArticles = await collectNewsAPI();
  console.log(`Articles bruts collectés : ${rawArticles.length}`);

  const processedArticles = processGeopoliticalArticles(rawArticles);
  console.log(`Articles après filtrage : ${processedArticles.length}`);

  return processedArticles;
}
