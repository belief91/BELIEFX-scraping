import re

from filters import (
    TRUSTED_SOURCES,
    GEOPOLITICAL_FILTER
)

from translator import translate_text



def clean_text(text):

    if not text:

        return ""


    return re.sub(
        r"\s+",
        " ",
        text
    ).strip()



def check_source(source):


    if not source:

        return False


    for trusted in TRUSTED_SOURCES:

        if trusted.lower() in source.lower():

            return True


    return False




def detect_categories(text):


    result=[]


    text=text.lower()



    for category, words in GEOPOLITICAL_FILTER.items():


        for word in words:


            if word.lower() in text:


                result.append(category)

                break



    return result





def process_articles(articles):


    output=[]

    urls=set()



    for article in articles:


        source = article["source"]["name"]



        if not check_source(source):

            continue



        title = clean_text(
            article.get("title")
        )


        description = clean_text(
            article.get("description")
        )


        categories = detect_categories(

            title + " " + description

        )



        if not categories:

            continue



        url = article.get("url")



        if url in urls:

            continue



        urls.add(url)



        output.append({


            "source":source,

            "title_en":title,

            "title_fr":translate_text(title),

            "description_en":description,

            "description_fr":translate_text(description),

            "categories":categories,

            "url":url,

            "published_at":
            article.get("publishedAt")

        })



    return output