import { NEWS_API_KEY, NEWS_API_URL, KEYWORDS } from "../config.js";


/*
==========================================================
CONFIGURATION NEWSAPI
==========================================================
*/

const LANGUAGE = "en";

const SORT_BY = "publishedAt";

const MAX_RESULTS = 100;


/*
==========================================================
REQUETES GEOPOLITIQUES
==========================================================
*/

const SEARCH_QUERIES = [

    "Federal Reserve OR Fed OR interest rates OR inflation",

    "ECB OR European Central Bank OR euro rates",

    "Bank of Japan OR BoJ OR yen",

    "oil OR crude oil OR OPEC OR OPEC+",

    "gold OR precious metals",

    "war OR military OR sanctions",

    "China OR Russia OR Ukraine OR Iran OR Israel",

    "NATO OR geopolitical tensions",

    "trade war OR tariffs",

    "bond yields OR treasury yields"

];


/*
==========================================================
CONSTRUCTION URL NEWSAPI
==========================================================
*/

function buildNewsUrl(query) {

    const params = new URLSearchParams({

        q: query,

        language: LANGUAGE,

        sortBy: SORT_BY,

        pageSize: MAX_RESULTS,

        apiKey: NEWS_API_KEY

    });


    return `${NEWS_API_URL}?${params.toString()}`;

}


/*
==========================================================
APPEL NEWSAPI
==========================================================
*/

async function fetchNews(query) {


    const url = buildNewsUrl(query);


    const response = await fetch(url);


    if (!response.ok) {

        throw new Error(
            `NewsAPI erreur HTTP ${response.status}`
        );

    }


    const data = await response.json();


    if (data.status !== "ok") {

        throw new Error(
            data.message || "Erreur NewsAPI"
        );

    }


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


        if (
            article.title === "[Removed]"
        )
            return false;


        if (
            !article.source ||
            !article.source.name
        )
            return false;


        return true;


    });


}


/*
==========================================================
COLLECTE MULTI-REQUETES
==========================================================
*/

export async function getGeopoliticalNews() {


    let allArticles = [];


    for (const query of SEARCH_QUERIES) {


        try {


            console.log(
                `Recherche NewsAPI : ${query}`
            );


            const articles = await fetchNews(query);


            allArticles.push(...articles);


            // éviter trop de requêtes rapides
            await new Promise(
                resolve => setTimeout(resolve, 1000)
            );


        }

        catch(error) {


            console.error(
                "Erreur requête :",
                query,
                error.message
            );


        }


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


        const key =
            `${article.title}-${article.source.name}`.toLowerCase();


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
*/

function formatArticles(articles = []) {


    return articles.map(article => ({


        source:
            article.source.name,


        title:
            article.title,


        description:
            article.description || "",


        url:
            article.url,


        image:
            article.urlToImage || "",


        publishedAt:
            article.publishedAt


    }));


}


/*
==========================================================
FONCTION PRINCIPALE
==========================================================
*/

export async function collectNewsAPI() {


    console.log(
        "Connexion NewsAPI..."
    );


    const rawArticles =
        await getGeopoliticalNews();


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
