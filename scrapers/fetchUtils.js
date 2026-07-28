// scrapers/fetchUtils.js
// Utilitaire partagé : fetch avec retry automatique (backoff exponentiel)
// en cas d'échec réseau transitoire, + pause entre catégories pour éviter
// de saturer le site cible.

/**
 * @param {string} url
 * @param {object} options - options standard de fetch()
 * @param {number} tentatives - nombre d'essais avant d'abandonner (défaut 4)
 * @param {number} delaiInitialMs - délai avant le 2e essai (défaut 1500ms, double à chaque tentative)
 */
export async function fetchAvecRetry(url, options = {}, tentatives = 4, delaiInitialMs = 1500) {
  let derniereErreur;
  let delai = delaiInitialMs;

  for (let i = 1; i <= tentatives; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (err) {
      derniereErreur = err;
      if (i < tentatives) {
        console.warn(`Tentative ${i}/${tentatives} échouée pour ${url} (${err.message}), nouvel essai dans ${delai}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delai));
        delai *= 2; // backoff exponentiel : 1.5s, 3s, 6s...
      }
    }
  }

  throw new Error(`Échec après ${tentatives} tentatives pour ${url} : ${derniereErreur.message}`);
}

/**
 * Petite pause entre deux catégories pour éviter de saturer le site cible
 * avec des requêtes trop rapprochées (throttling observé sur federalreserve.gov).
 */
export function pause(ms = 800) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
