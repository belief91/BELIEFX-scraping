import { KEYWORDS } from "../config.js";


/*
==========================================================
CONFIGURATION GDELT DOC 2.0 API
==========================================================
Documentation officielle : https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
Pas de clé API nécessaire — endpoint public, gratuit, sans inscription.

⚠️ GDELT limite le débit ("rate limited to protect the underlying
ElasticSearch clusters" — annonce officielle du projet). Un espacement
de 6 secondes entre requêtes est utilisé ci-dessous (recommandation
communautaire ~1 requête/5s pour rester sous le seuil de blocage).

⚠️ CONSÉQUENCE IMPORTANTE : avec 10 requêtes × 6s d'espacement, la
collecte seule prend déjà ~60 secondes minimum, sans compter le temps
de réponse de chaque requête. Ça dépasse le maxDuration=60s fixé côté
Vercel pour la route qui attend la réponse de ce service. À revoir
après ce premier test (ex: réduire le nombre de requêtes, ou changer
l'architecture d'attente Vercel/Render).

⚠️ Le DOC 2.0 API (mode artlist) ne renvoie PAS de description/résumé
d'article — seulement : url, title, seendate, socialimage, domain,
language, sourcecountry. Le filtrage par mots-clés (filters.js) se fait
donc uniquement sur le TITRE, pas sur un résumé, contrairement à
NewsAPI. Précision de filtrage potentiellement réduite en conséquence.
*/

const GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc";

const MODE = "artlist";

const MAX_RECORDS = 250;

const TIMESPAN = "2d"; // dernières 48h — explicite plutôt que de dépendre d'un défaut non confirmé avec certitude dans la documentation

const SORT = "datedesc";

const DELAY_BETWEEN_REQUESTS_MS = 6000; // 6 secondes, augmenté pour éviter le blocage (demande explicite)


/*
==========================================================
REQUETES GEOPOLITIQUES
==========================================================
Mêmes thèmes que la version NewsAPI. GDELT regroupe les termes OR
entre parenthèses (convention documentée de son moteur de recherche).
*/

const SEARCH_QUERIES = [

    "(Federal Reserve OR Fed OR interest rates OR inflation)",

    "(ECB OR European Central Bank OR euro rates)",

    "(Bank of Japan OR BoJ OR yen)",

    "(oil OR crude oil OR OPEC OR OPEC+)",

    "(gold OR precious metals)",

    "(war OR military OR sanctions)",

    "(China OR Russia OR Ukraine OR Iran OR Israel)",

    "(NATO OR geopolitical tensions)",

    "(trade war OR tariffs)",

    "(bond yields OR treasury yields)"

];


/*
==========================================================
CONSTRUCTION URL GDELT
==========================================================
*/

function buildGdeltUrl(query) {

    const params = new URLSearchParams({

        query,

        mode: MODE,

        maxrecords: MAX_RECORDS,

        timespan: TIMESPAN,

        sort: SORT,

        format: "json"

    });


    return `${GDELT_DOC_URL}?${params.toString()}`;

}


/*
==========================================================
APPEL GDELT
==========================================================
*/

async function fetchGdelt(query) {


    const url = buildGdeltUrl(query);


    // Un User-Agent explicite évite certains blocages signalés par la
    // communauté (issue connue sur des clients sans en-tête navigateur)
    const response = await fetch(url, {
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        }
    });


    if (!response.ok) {

        throw new Error(
            `GDELT erreur HTTP ${response.status}`
        );

    }


    const text = await response.text();

    // GDELT peut renvoyer une page HTML d'erreur avec un statut 200
    // (comportement documenté par la communauté) — on vérifie que la
    // réponse ressemble bien à du JSON avant de la parser.
    if (!text.trim().startsWith("{")) {

        throw new Error(
            "Réponse GDELT non-JSON (probable page d'erreur/limite atteinte)"
        );

    }


    const data = JSON.parse(text);


    return data.articles || [];


}


/*
==========================================================
NETTOYAGE RESULTATS BRUTS
==========================================================
*/

function cleanRawArticles(articles = []) {


    return articles.filter(article => {


        if (!article.title)
            return false;


        if (!article.url)
            return false;


        if (!article.domain)
            return false;


        return true;


    });


}


/*
==========================================================
COLLECTE MULTI-REQUETES
==========================================================
*/

export async function getGeopoliticalNewsGdelt() {


    let allArticles = [];


    for (const query of SEARCH_QUERIES) {


        try {


            console.log(
                `Recherche GDELT : ${query}`
            );


            const articles = await fetchGdelt(query);


            console.log(
                `  -> ${articles.length} articles reçus`
            );


            allArticles.push(...articles);


        }

        catch(error) {


            console.error(
                "Erreur requête GDELT :",
                query,
                error.message
            );


        }


        // Espacement entre requêtes pour éviter le blocage GDELT
        await new Promise(
            resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS)
        );


    }


    return cleanRawArticles(allArticles);


}


/*
==========================================================
SUPPRESSION DES DOUBLONS
==========================================================
*/

function removeDuplicates(articles = []) {


    const seen = new Set();


    return articles.filter(article => {


        const key = article.url.toLowerCase();


        if (seen.has(key)) {

            return false;

        }


        seen.add(key);

        return true;


    });


}


/*
==========================================================
PREPARATION DES DONNEES
==========================================================
Normalise vers le même format que produisait newsapi.js, pour que
filters.js / processor.js n'aient besoin d'aucune modification :
  - source : le DOMAINE (ex: "bbc.com") au lieu du nom lisible
    (ex: "BBC News") — TRUSTED_SOURCES doit donc être en format domaine
  - description : toujours vide, GDELT DOC API n'en fournit pas
*/

function formatArticles(articles = []) {


    return articles.map(article => ({


        source:
            article.domain,


        title:
            article.title,


        description:
            "", // non fourni par GDELT DOC 2.0 API (mode artlist)


        url:
            article.url,


        image:
            article.socialimage || "",


        publishedAt:
            article.seendate


    }));


}


/*
==========================================================
FONCTION PRINCIPALE
==========================================================
*/

export async function collectGDELT() {


    console.log(
        "Connexion GDELT..."
    );


    const rawArticles =
        await getGeopoliticalNewsGdelt();


    console.log(
        "Articles reçus :",
        rawArticles.length
    );


    const uniqueArticles =
        removeDuplicates(rawArticles);


    console.log(
        "Après suppression doublons :",
        uniqueArticles.length
    );


    const cleanArticles =
        formatArticles(uniqueArticles);


    return cleanArticles;


}
