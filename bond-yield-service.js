/**
 * bond-yield-service.js
 * ------------------------------------------------------------------
 * Scraping de https://tradingeconomics.com/bonds (tableau server-side
 * rendu en ASP.NET WebForms — confirmé par inspection DevTools).
 * Même famille technique que le scraper calendar (pas de JS requis,
 * axios + cheerio suffisent).
 *
 * A INTEGRER dans le repo E:\scraping (belief91/BELIEFX-scraping),
 * à côté de ton service calendar, puis exposé via une route Express
 * dans index.js (voir bloc en bas de fichier).
 *
 * ⚠️ POINTS A VERIFIER TOI-MEME AVANT PROD (je ne peux pas les tester
 * en live depuis ici) :
 *   1. La colonne "Date" en fin de ligne — je n'ai pas vu son contenu
 *      exact sur une ligne complète dans ton screenshot (seulement le
 *      thead). Le sélecteur ci-dessous prend le DERNIER <td> de la ligne ;
 *      si ça ne matche pas, ajuste `$row.find('td').last()`.
 *   2. Le sélecteur de table : j'utilise `table.table-heatmap` (classe
 *      stable vue dans ton HTML) plutôt que l'id `bond-XXXXXXX` qui
 *      semble généré dynamiquement à chaque requête — NE JAMAIS cibler
 *      cet id directement.
 *   3. Le nom de région est pris dans le 2e <th> du thead. Si TE change
 *      la mise en page, ça cassera silencieusement — le code logue un
 *      warning si aucune région n'est trouvée.
 *   4. Depuis Render (IP datacenter), fais le test curl suivant AVANT
 *      de déployer cette route, pour écarter un blocage WAF :
 *        curl -A "Mozilla/5.0" https://tradingeconomics.com/bonds -o t.html
 *        grep -c "data-symbol" t.html
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import Parse from 'parse/node';

const TE_BONDS_URL = 'https://tradingeconomics.com/bonds';

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Récupère le HTML brut de la page /bonds.
 */
async function fetchBondsPage() {
  const response = await axios.get(TE_BONDS_URL, {
    headers: REQUEST_HEADERS,
    timeout: 15000,
  });
  return response.data;
}

/**
 * Parse le HTML et retourne un tableau d'objets bond yield structurés.
 *
 * Format retourné par item :
 * {
 *   symbol: 'USGG10YR:IND',
 *   country: 'United States',
 *   region: 'America',
 *   url: '/united-states/government-bond-yield',
 *   yield: 4.5730,
 *   chgDaily: 0.0230,
 *   chgPercentDaily: -0.0470,   // si présent (2e colonne de variation)
 *   weekly: null,               // rempli si data-value présent
 *   monthly: null,
 *   ytd: null,
 *   yoy: null,
 *   date: '2026-07-20',         // texte brut du dernier <td> — A VERIFIER
 *   scrapedAt: '2026-07-20T19:00:00.000Z'
 * }
 */
function parseBondYields(html) {
  const $ = cheerio.load(html);
  const results = [];

  $('table.table-heatmap').each((_, table) => {
    const $table = $(table);

    // Nom de la région : 2e <th> du thead (ex: "Asia", "America"...)
    const region = $table.find('thead th').eq(1).text().trim() || null;
    if (!region) {
      console.warn('[bond-yield-service] Région introuvable pour une table — structure TE possiblement changée.');
    }

    $table.find('tbody tr[data-symbol]').each((__, row) => {
      const $row = $(row);
      const symbol = $row.attr('data-symbol') || null;

      const $countryLink = $row.find('td.datatable-item-first a');
      const country = $countryLink.find('b').text().trim() || $countryLink.text().trim() || null;
      const url = $countryLink.attr('href') || null;

      const yieldText = $row.find('td#p').text().trim();
      const yieldValue = yieldText ? parseFloat(yieldText.replace(',', '.')) : null;

      // Colonne "Chg" — la valeur numérique fiable est dans data-value,
      // le texte affiché peut être arrondi.
      const $chgCell = $row.find('td#ch');
      const chgDailyRaw = $chgCell.attr('data-value');
      const chgDaily = chgDailyRaw !== undefined ? parseFloat(chgDailyRaw) : null;

      // Colonnes heatmap (Weekly / Monthly / YTD / YoY) — ordre positionnel,
      // toutes partagent la classe datatable-heatmap.
      const heatmapCells = $row.find('td.datatable-heatmap');
      const getHeatmapValue = (index) => {
        const el = heatmapCells.eq(index);
        const val = el.attr('data-value');
        return val !== undefined ? parseFloat(val) : null;
      };

      const weekly = getHeatmapValue(0);
      const monthly = getHeatmapValue(1);
      const ytd = getHeatmapValue(2);
      const yoy = getHeatmapValue(3);

      // Date : dernier <td> de la ligne — A CONFIRMER visuellement sur
      // une vraie ligne (thead seul ne suffisait pas pour la valider).
      const dateText = $row.find('td').last().text().trim() || null;

      results.push({
        symbol,
        country,
        region,
        url,
        yield: yieldValue,
        chgDaily,
        weekly,
        monthly,
        ytd,
        yoy,
        date: dateText,
        scrapedAt: new Date().toISOString(),
      });
    });
  });

  return results;
}

/**
 * Sauvegarde les bond yields dans Back4App, classe "BondYieldSnapshot".
 * Upsert par `symbol` : un seul document par pays/maturité, mis à jour
 * à chaque scraping (comportement "snapshot", pas d'historique complet).
 * Si tu veux garder l'historique, retire la logique de recherche
 * existante et fais un `.save()` systématique sur un nouvel objet.
 *
 * Nécessite Parse déjà initialisé avec Master Key côté serveur
 * (même pattern que lib/back4app-server.js).
 */
async function saveBondYields(bondYields) {
  const BondYieldSnapshot = Parse.Object.extend('BondYieldSnapshot');
  const query = new Parse.Query(BondYieldSnapshot);

  let saved = 0;
  let failed = 0;

  for (const item of bondYields) {
    if (!item.symbol) continue; // ligne mal parsée, on ignore

    try {
      query.equalTo('symbol', item.symbol);
      let obj = await query.first({ useMasterKey: true });

      if (!obj) {
        obj = new BondYieldSnapshot();
        obj.set('symbol', item.symbol);
      }

      obj.set('country', item.country);
      obj.set('region', item.region);
      obj.set('url', item.url);
      obj.set('yieldValue', item.yield);
      obj.set('chgDaily', item.chgDaily);
      obj.set('weekly', item.weekly);
      obj.set('monthly', item.monthly);
      obj.set('ytd', item.ytd);
      obj.set('yoy', item.yoy);
      obj.set('dateLabel', item.date);
      obj.set('scrapedAt', new Date(item.scrapedAt));

      await obj.save(null, { useMasterKey: true });
      saved++;
    } catch (err) {
      failed++;
      console.error(`[bond-yield-service] Echec sauvegarde ${item.symbol}:`, err.message);
    }
  }

  return { saved, failed, total: bondYields.length };
}

/**
 * Pipeline complet : fetch → parse → save. Point d'entrée unique
 * à appeler depuis la route Express.
 */
async function runBondYieldScraping() {
  const html = await fetchBondsPage();
  const bondYields = parseBondYields(html);

  if (bondYields.length === 0) {
    throw new Error(
      'Aucune donnée extraite — structure HTML TE probablement changée, ou blocage WAF/IP depuis Render.'
    );
  }

  const saveResult = await saveBondYields(bondYields);
  return { parsed: bondYields.length, ...saveResult };
}

export {
  fetchBondsPage,
  parseBondYields,
  saveBondYields,
  runBondYieldScraping,
};

/* ------------------------------------------------------------------
 * A AJOUTER dans index.js (même repo, à côté de tes routes calendar
 * et geopolitique) :
 *
 * import { runBondYieldScraping } from './bond-yield-service.js';
 *
 * app.get('/api/scrape/bonds', async (req, res) => {
 *   try {
 *     const result = await runBondYieldScraping();
 *     res.json({ success: true, ...result });
 *   } catch (err) {
 *     console.error('[/api/scrape/bonds]', err);
 *     res.status(500).json({ success: false, error: err.message });
 *   }
 * });
 *
 * Puis dans le cron Vercel (vercel.json), ajouter un appel HTTP vers
 * cette route sur le même schedule que le calendar (ou un cron dédié
 * si tu veux découpler la fréquence — les yields bougent en continu,
 * contrairement au calendar qui est événementiel).
 * ------------------------------------------------------------------ */
