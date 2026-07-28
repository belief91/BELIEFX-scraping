// À ajouter dans index.js du repo E:\scraping (belief91/BELIEFX-scraping)
// Ces routes s'ajoutent aux routes Express existantes (ne pas créer un nouveau service)

// ─────────────────────────────────────────────────────────────
// GET /calendar/today — scrape le calendrier TradingEconomics du jour
// ─────────────────────────────────────────────────────────────
app.get("/calendar/today", async (req, res) => {
  try {
    // Réutilise ton scraper TradingEconomics existant (cookies déjà configurés :
    // calendar-importance=3, calendar-range=3, cal-timezone-offset=180, liste pays)
    const evenements = await scraperCalendrierTradingEconomics(); // ⚠️ fonction déjà existante à brancher ici
    res.json(evenements); // format attendu : [{ heure, evenement, devise }, ...]
  } catch (error) {
    console.error("Erreur /calendar/today :", error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /scrape — scrape UNIQUEMENT la banque centrale demandée
// Body attendu : { banque: "Fed" } / "ECB" / "BoE" / "BoJ" / "SNB" / "BoC" / "RBA" / "RBNZ" / "Norges Bank" / "Riksbank"
// ─────────────────────────────────────────────────────────────
const SCRAPERS_PAR_BANQUE = {
  Fed: scraperFed,           // ⚠️ à écrire, 1 fonction par BC
  ECB: scraperECB,
  BoE: scraperBoE,
  BoJ: scraperBoJ,
  SNB: scraperSNB,
  BoC: scraperBoC,
  RBA: scraperRBA,
  RBNZ: scraperRBNZ,
  "Norges Bank": scraperNorgesBank,
  Riksbank: scraperRiksbank,
};

app.post("/scrape", async (req, res) => {
  const { banque } = req.body;

  const scraperCible = SCRAPERS_PAR_BANQUE[banque];
  if (!scraperCible) {
    return res.status(400).json({ error: `Banque inconnue ou non supportée : ${banque}` });
  }

  try {
    const texte = await scraperCible(); // scrape UNIQUEMENT cette page, aucune autre BC touchée
    res.json({ texte });
  } catch (error) {
    console.error(`Erreur /scrape (${banque}) :`, error);
    res.status(500).json({ error: error.message });
  }
});
