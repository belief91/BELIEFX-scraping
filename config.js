import dotenv from "dotenv";

dotenv.config();

/* ===========================
   NEWS API
=========================== */

export const NEWS_API_KEY = process.env.NEWS_API_KEY;

export const NEWS_API_URL =
  "https://newsapi.org/v2/everything";

/* ===========================
   LANGUE
=========================== */

export const TARGET_LANGUAGE = "fr";

/* ===========================
   SOURCES PRIORITAIRES
=========================== */

export const TRUSTED_SOURCES = [

  // Agences / généralistes internationaux confirmés présents dans NewsAPI
  "BBC News",
  "CNN",
  "Al Jazeera English",
  "NPR",
  "DW (English)",
  "CBC News",
  "CNA",
  "RTE",
  "The Irish Times",
  "The Straits Times",

  // Spécialisés géopolitique / militaire / élections
  "Foreign Policy",
  "The Diplomat",
  "War on the Rocks",
  "POLITICO.eu",
  "Hurriyet Daily News",

  // Finance / impact marché (pertinent pour BELIEFX, trading)
  "Bloomberg",
  "CNBC",

  // Conservées au cas où NewsAPI les inclut à l'avenir (absentes des 733
  // articles testés le 2026-07-18, mais gardées sans coût — une simple
  // comparaison de texte qui ne matchera juste rien si absentes)
  "Reuters",
  "Associated Press",
  "Financial Times",
  "The Wall Street Journal",
  "The Economist",
  "The Washington Post",
  "The New York Times",

  // Médias d'État russes — inclus sur demande explicite (2026-07-18).
  // À garder en tête : sources à biais éditorial documenté (propagande
  // d'État), à traiter avec recul dans l'usage final de ces articles.
  "RT",
  "Sputnikglobe.com"

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
