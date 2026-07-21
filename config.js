import dotenv from "dotenv";

dotenv.config();

/* ===========================
   NEWS API — OBSOLÈTE (2026-07-18)
   Remplacé par GDELT : le plan gratuit NewsAPI.org bloque officiellement
   tout usage hors localhost (documentation officielle confirmée),
   causant des erreurs HTTP 401 systématiques une fois déployé sur
   Render. Conservé en commentaire pour référence, non utilisé.
=========================== */

// export const NEWS_API_KEY = process.env.NEWS_API_KEY;
// export const NEWS_API_URL = "https://newsapi.org/v2/everything";

/* ===========================
   LANGUE
=========================== */

export const TARGET_LANGUAGE = "fr";

/* ===========================
   SOURCES PRIORITAIRES
=========================== */

/* ===========================
   SOURCES PRIORITAIRES
   Format DOMAINE (ex: "bbc.com"), pas nom lisible — GDELT renvoie un
   domaine brut dans son champ "domain", contrairement à NewsAPI qui
   donnait un nom lisible ("BBC News"). Mis à jour le 2026-07-18 lors
   du remplacement NewsAPI -> GDELT.
=========================== */

export const TRUSTED_SOURCES = [

  // Agences / généralistes internationaux
  "bbc.com",
  "cnn.com",
  "aljazeera.com",
  "npr.org",
  "dw.com",
  "cbc.ca",
  "channelnewsasia.com",
  "rte.ie",
  "irishtimes.com",
  "straitstimes.com",

  // Spécialisés géopolitique / militaire / élections
  "foreignpolicy.com",
  "thediplomat.com",
  "warontherocks.com",
  "politico.eu",
  "hurriyetdailynews.com",

  // Finance / impact marché
  "bloomberg.com",
  "cnbc.com",

  // Conservées au cas où présentes dans les résultats GDELT
  "reuters.com",
  "apnews.com",
  "ft.com",
  "wsj.com",
  "economist.com",
  "washingtonpost.com",
  "nytimes.com",

  // Médias d'État russes — inclus sur demande explicite (2026-07-18)
  "rt.com",
  "sputnikglobe.com"

];

/* ===========================
   MOTS-CLES GEOPOLITIQUES
=========================== */

export const KEYWORDS = [

  // Guerre
  "war",
  "military",
  "missile",
  "airstrike",
  "drone attack",
  "troops",
  "navy",
  "army",
  "border conflict",
  "ceasefire",
  "invasion",

  // Sanctions
  "sanction",
  "embargo",
  "tariff",
  "trade war",
  "export ban",
  "import ban",

  // Energie
  "oil",
  "crude oil",
  "natural gas",
  "lng",
  "pipeline",
  "opec",
  "opec+",
  "refinery",
  "energy",

  // Métaux
  "gold",
  "silver",
  "copper",

  // Banques centrales
  "Federal Reserve",
  "Fed",
  "ECB",
  "Bank of England",
  "BoE",
  "Bank of Japan",
  "BoJ",
  "SNB",
  "RBA",
  "RBNZ",
  "Bank of Canada",
  "BoC",

  // Inflation / taux
  "inflation",
  "interest rate",
  "rate hike",
  "rate cut",
  "bond yield",
  "treasury yields",

  // Diplomatie
  "NATO",
  "G7",
  "G20",
  "BRICS",
  "European Union",
  "EU",
  "United Nations",
  "UN",
  "White House",

  // Pays
  "United States",
  "China",
  "Russia",
  "Ukraine",
  "Iran",
  "Israel",
  "Taiwan",
  "North Korea",
  "South Korea"

];

/* ===========================
   CATEGORIES
=========================== */

export const CATEGORY_RULES = {

  MONETARY_POLICY: [
    "Federal Reserve",
    "Fed",
    "ECB",
    "BoE",
    "BoJ",
    "SNB",
    "interest rate",
    "rate hike",
    "rate cut",
    "inflation",
    "bond yield",
    "treasury"
  ],

  GEOPOLITICS: [
    "war",
    "military",
    "missile",
    "sanction",
    "embargo",
    "trade war",
    "border",
    "NATO"
  ],

  COMMODITIES: [
    "oil",
    "gold",
    "silver",
    "copper",
    "gas",
    "lng",
    "pipeline",
    "refinery",
    "opec"
  ],

  NATURAL_DISASTER: [
    "earthquake",
    "wildfire",
    "flood",
    "cyclone",
    "hurricane",
    "typhoon"
  ]

};
