# ==========================================================
# CONFIG.PY
# CONFIGURATION GENERALE
# ==========================================================

import os
from pathlib import Path


# ==========================================================
# CHEMIN DU PROJET
# ==========================================================

BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = BASE_DIR / "data"

JSON_OUTPUT = DATA_DIR / "geopolitical_news.json"


# ==========================================================
# CLE NEWSAPI
# ==========================================================
#
# En local :
# Remplace la chaîne ci-dessous par ta clé NewsAPI.
#
# En production (Render) :
# Définis la variable d'environnement NEWS_API_KEY.
# Si elle existe, elle sera utilisée automatiquement.
# ==========================================================

LOCAL_API_KEY = "3ad32b4259db46418557286381afb6cc"
API_KEY = os.getenv("NEWS_API_KEY", LOCAL_API_KEY)


# ==========================================================
# NEWSAPI
# ==========================================================

NEWS_API_URL = "https://newsapi.org/v2/everything"


QUERY = """
war OR conflict OR invasion OR military OR
terrorism OR terrorist OR bombing OR
sanctions OR embargo OR tariff OR
Federal Reserve OR Fed OR FOMC OR
ECB OR Bank of Japan OR Bank of England OR
interest rate OR rate hike OR rate cut OR
OPEC OR OPEC+ OR crude oil OR Brent OR WTI OR
gold OR silver OR uranium OR copper OR
earthquake OR flood OR wildfire OR
presidential election OR referendum OR
nuclear OR diplomacy
"""


LANGUAGE = "en"

PAGE_SIZE = 100

SORT_BY = "publishedAt"

REQUEST_TIMEOUT = 60