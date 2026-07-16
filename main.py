from newsapi_client import get_news

from processor import process_articles

from storage import save_data



def main():


    print("Connexion NewsAPI...")


    articles = get_news()


    print(
        "Articles reçus :",
        len(articles)
    )



    clean_articles = process_articles(

        articles

    )


    print(

        "Articles conservés :",

        len(clean_articles)

    )


    save_data(

        clean_articles

    )



if __name__ == "__main__":

    main()