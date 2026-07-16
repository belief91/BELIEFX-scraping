import requests

from config import (
    API_KEY,
    NEWS_API_URL,
    QUERY,
    LANGUAGE,
    PAGE_SIZE
)



def get_news():


    params = {


        "q": QUERY,

        "language": LANGUAGE,

        "sortBy": "publishedAt",

        "pageSize": PAGE_SIZE,

        "apiKey": API_KEY

    }


    response = requests.get(
    NEWS_API_URL,
    params=params,
    timeout=60
)


    data = response.json()


    if data.get("status") != "ok":

        print(data)

        return []


    return data["articles"]