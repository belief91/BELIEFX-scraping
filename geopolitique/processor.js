import {
    filterArticles
} from "./filters.js";


/*
==========================================================
PREPARATION TEXTE
==========================================================
*/

function cleanText(text = "") {

    return text
        .replace(/\s+/g, " ")
        .trim();

}


/*
==========================================================
NORMALISATION ARTICLE
==========================================================
*/

function normalizeArticle(article) {


    return {

        source: article.source,

        title: cleanText(
            article.title
        ),

        description: cleanText(
            article.description
        ),

        url: article.url,

        image: article.image || "",

        publishedAt:
            article.publishedAt

    };


}


/*
==========================================================
TRAITEMENT PRINCIPAL
==========================================================
*/

export function processGeopoliticalArticles(
    articles = []
) {


    console.log(
        "Filtrage geopolitique..."
    );


    /*
    filtre :
    - sources fiables
    - mots cles
    - exclusions
    - categories
    - doublons
    */

    const filtered =
        filterArticles(articles);



    console.log(
        "Articles après filtre :",
        filtered.length
    );



    const processed =
        filtered.map(article => {


            return {


                source:
                    article.source,


                title:
                    cleanText(
                        article.title
                    ),


                description:
                    cleanText(
                        article.description
                    ),


                url:
                    article.url,


                image:
                    article.image,


                publishedAt:
                    article.publishedAt,


                categories:
                    article.categories


            };


        });



    return processed;


}
