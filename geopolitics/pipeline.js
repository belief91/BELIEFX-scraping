import { collectGDELT } from "./gdelt.js";
import { processGeopoliticalArticles } from "./processor.js";

/**
 * Pipeline géopolitique — BELIEFX
 * =================================
 * Collecte (GDELT DOC 2.0 API, 10 requêtes thématiques) -> filtrage
 * (sources fiables par domaine, mots-clés, exclusions, catégorisation,
 * doublons).
 *
 * Remplace NewsAPI (2026-07-18) : le plan gratuit NewsAPI.org bloque
 * officiellement tout usage hors localhost (documentation officielle),
 * d'où les erreurs HTTP 401 systématiques une fois déployé sur Render.
 * GDELT est gratuit, sans clé API, et n'impose pas cette restriction.
 *
 * ⚠️ Contrepartie : GDELT ne fournit pas de description/résumé d'article
 * (filtrage sur titre seul), et impose un espacement de 6s entre
 * requêtes pour éviter le blocage — la collecte complète prend donc
 * plusieurs dizaines de secondes (à surveiller vis-à-vis du
 * maxDuration=60s de la route Vercel qui attend cette réponse).
 *
 * Traduction FR toujours désactivée pour l'instant (même décision que
 * pour NewsAPI le 2026-07-17) — translator.js existe mais n'est pas
 * appelé ici.
 */
export async function runGeopoliticalPipeline() {
  console.log("=== Démarrage pipeline géopolitique (GDELT) ===");

  const rawArticles = await collectGDELT();
  console.log(`Articles bruts collectés : ${rawArticles.length}`);

  const processedArticles = processGeopoliticalArticles(rawArticles);
  console.log(`Articles après filtrage : ${processedArticles.length}`);

  return processedArticles;
}
