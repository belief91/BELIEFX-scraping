/*
==========================================================
TRADUCTION FRANCAIS
API LibreTranslate (gratuite)
==========================================================
*/


const TRANSLATE_URL =
    process.env.TRANSLATE_URL ||
    "https://libretranslate.de/translate";



async function translateText(text = "") {


    if (!text)
        return "";


    try {


        const response = await fetch(
            TRANSLATE_URL,
            {

                method: "POST",

                headers: {

                    "Content-Type":
                        "application/json"

                },


                body: JSON.stringify({

                    q: text,

                    source: "en",

                    target: "fr",

                    format: "text"

                })

            }

        );



        if (!response.ok) {

            throw new Error(
                `Erreur traduction HTTP ${response.status}`
            );

        }



        const data =
            await response.json();



        return data.translatedText || text;



    }

    catch(error) {


        console.error(
            "Erreur traduction :",
            error.message
        );


        return text;


    }


}



/*
==========================================================
TRADUIRE ARTICLES
==========================================================
*/


export async function translateArticles(
    articles = []
) {


    const translated = [];



    for (const article of articles) {


        const titleFR =
            await translateText(
                article.title
            );



        const descriptionFR =
            await translateText(
                article.description
            );



        translated.push({


            ...article,


            title_fr:
                titleFR,


            description_fr:
                descriptionFR



        });



        // éviter surcharge API gratuite

        await new Promise(
            resolve =>
                setTimeout(resolve, 1000)
        );


    }



    return translated;


}
