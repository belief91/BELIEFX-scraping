import { TRUSTED_SOURCES, CATEGORY_RULES } from "../config.js";

/*
==========================================================
SOURCES AUTORISÉES
==========================================================
*/

export function isTrustedSource(sourceName = "") {

    const source = sourceName.trim().toLowerCase();

    return TRUSTED_SOURCES.some(
        trusted => trusted.toLowerCase() === source
    );

}

/*
==========================================================
NETTOYAGE TEXTE
==========================================================
*/

export function normalizeText(text = "") {

    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();

}

/*
==========================================================
RECHERCHE MOT CLE
==========================================================
*/

export function containsKeyword(text = "", keywords = []) {

    const clean = normalizeText(text);

    return keywords.some(keyword =>
        clean.includes(
            normalizeText(keyword)
        )
    );

}

/*
==========================================================
CLASSIFICATION
==========================================================
*/

export function detectCategories(title = "", description = "") {

    const texte = normalizeText(
        `${title} ${description}`
    );

    const categories = [];

    Object.entries(CATEGORY_RULES).forEach(

        ([categorie, mots]) => {

            const trouve = mots.some(

                mot => texte.includes(
                    normalizeText(mot)
                )

            );

            if (trouve) {

                categories.push(categorie);

            }

        }

    );

    return categories;

}

/*
==========================================================
DOUBLONS
==========================================================
*/

export function removeDuplicates(articles = []) {

    const dejaVu = new Set();

    return articles.filter(article => {

        const cle =
            normalizeText(article.title || "");

        if (dejaVu.has(cle)) {

            return false;

        }

        dejaVu.add(cle);

        return true;

    });

}
/*
==========================================================
MOTS A EXCLURE
==========================================================
*/

const EXCLUDED_KEYWORDS = [

    // Sport
    "football",
    "soccer",
    "nba",
    "nfl",
    "mlb",
    "tennis",
    "olympics",
    "formula 1",
    "cricket",
    "golf",

    // Divertissement
    "movie",
    "film",
    "actor",
    "actress",
    "celebrity",
    "music",
    "concert",
    "festival",
    "netflix",
    "disney",

    // Technologie grand public
    "iphone",
    "android",
    "smartphone",
    "playstation",
    "xbox",
    "gaming",

    // Lifestyle
    "travel",
    "tourism",
    "recipe",
    "fashion",
    "beauty",
    "health tips",

    // Faits divers
    "lottery",
    "crime",
    "murder",
    "celebration",
    "wedding"

];


/*
==========================================================
ARTICLE A EXCLURE ?
==========================================================
*/

export function isExcludedArticle(title = "", description = "") {

    const texte = normalizeText(
        `${title} ${description}`
    );

    return EXCLUDED_KEYWORDS.some(

        mot => texte.includes(
            normalizeText(mot)
        )

    );

}


/*
==========================================================
ARTICLE VALIDE ?
==========================================================
*/

export function isValidArticle(article) {

    if (!article)
        return false;

    if (!article.title)
        return false;

    if (!article.source)
        return false;

    // article.source peut être soit une chaîne déjà aplatie (format produit
    // par newsapi.js -> formatArticles), soit l'objet brut NewsAPI
    // { id, name }. On gère les deux pour ne pas casser si la structure
    // change en amont.
    const sourceName =
        typeof article.source === "string"
            ? article.source
            : article.source.name;

    if (!sourceName)
        return false;

    if (!isTrustedSource(sourceName))
        return false;

    if (

        isExcludedArticle(

            article.title,

            article.description || ""

        )

    )

        return false;

    return true;

}


/*
==========================================================
FILTRAGE GLOBAL
==========================================================
*/

export function filterArticles(articles = []) {

    const resultat = [];

    for (const article of articles) {

        if (!isValidArticle(article))
            continue;

        const categories = detectCategories(

            article.title,

            article.description || ""

        );

        if (categories.length === 0)
            continue;

        const sourceName =
            typeof article.source === "string"
                ? article.source
                : article.source.name;

        resultat.push({

            source: sourceName,

            title: article.title,

            description: article.description || "",

            url: article.url,

            image: article.urlToImage || article.image || "",

            publishedAt: article.publishedAt,

            categories

        });

    }

    return removeDuplicates(resultat);

}
