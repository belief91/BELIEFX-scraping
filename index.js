/**
 * Service de scraping BELIEFX — déployé sur Render
 */

import express from "express";
import * as cheerio from "cheerio";

import {
  collectNewsAPI
} from "./geopolitique/newsapi.js";

import {
  processGeopoliticalArticles
} from "./geopolitique/processor.js";

import {
  translateArticles
} from "./geopolitique/translator.js";


const app = express();

const PORT = process.env.PORT || 3001;


// ======================================================
// AUTHENTIFICATION
// ======================================================

function verifierSecret(req, res, next) {

  const authHeader =
    req.headers["authorization"] || "";

  const secretAttendu =
    process.env.RENDER_SCRAPER_SECRET;


  if (
    !secretAttendu ||
    authHeader !== `Bearer ${secretAttendu}`
  ) {

    return res.status(401).json({
      error: "Unauthorized"
    });

  }


  next();

}



// ======================================================
// TRADING ECONOMICS CALENDRIER BC
// ======================================================


const CALENDAR_URL =
  "https://tradingeconomics.com/calendar";


const COOKIES = {
  "calendar-importance": "3",
  "calendar-range": "3",
  "calendar-countries": "aus,can,emu,jpn,gbr,usa,wld,nzl,che",
  "cal-timezone-offset": "180",
};


const HEADERS = {

  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",

};


const DATE_CLASS_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;


const DAY_PATTERN =
  /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\w+\s+\d{1,2}\s+\d{4}/i;



const ISO_TO_CURRENCY = {

  US:"USD",
  GB:"GBP",
  EA:"EUR",
  EU:"EUR",
  JP:"JPY",
  CA:"CAD",
  AU:"AUD",
  NZ:"NZD",
  CH:"CHF"

};



function buildCookieHeader(cookiesObj){

  return Object.entries(cookiesObj)
  .map(([k,v])=>`${k}=${v}`)
  .join("; ");

}



function convertirEn24h(heureStr){

  if(!heureStr)
    return "";

  const trimmed =
    heureStr.trim();


  const match =
    trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);


  if(!match)
    return trimmed;


  let [,hh,mm,period] = match;

  hh=parseInt(hh,10);

  period=period.toUpperCase();


  if(period==="AM"){

    if(hh===12)
      hh=0;

  }

  else {

    if(hh!==12)
      hh+=12;

  }


  return `${String(hh).padStart(2,"0")}:${mm}`;

}



function trouverCelluleHeure($,row){

  let heureTrouvee="";


  $(row).find("td").each((_,td)=>{


    if(heureTrouvee)
      return;


    const classAttr =
      $(td).attr("class") || "";


    const classes =
      classAttr.split(/\s+/);


    if(
      classes.some(c=>DATE_CLASS_PATTERN.test(c))
    ){

      const span =
        $(td).find("span").first();


      heureTrouvee =
        span.length
        ? span.text().trim()
        : $(td).text().trim();

    }


  });


  return convertirEn24h(heureTrouvee);

}



function parseDateHeader($,row){

  const text =
    $(row)
    .text()
    .replace(/\s+/g," ")
    .trim();


  const match =
    text.match(DAY_PATTERN);


  return match ? match[0] : null;

}



async function scraperCalendrierBC(){


  const response =
    await fetch(
      CALENDAR_URL,
      {
        headers:{
          ...HEADERS,
          Cookie:
          buildCookieHeader(COOKIES)
        }
      }
    );


  if(!response.ok){

    throw new Error(
      `Trading Economics HTTP ${response.status}`
    );

  }



  const html =
    await response.text();


  const $ =
    cheerio.load(html);



  const resultats=[];

  let dateCourante=null;



  $("tr").each((_,row)=>{


    const dateDetectee =
      parseDateHeader($,row);


    if(dateDetectee){

      dateCourante=dateDetectee;
      return;

    }



    const event =
      $(row).attr("data-event");


    if(!event)
      return;



    const isoCode =
      $(row)
      .find("td.calendar-iso")
      .first()
      .text()
      .trim();



    resultats.push({

      date:dateCourante,

      devise:
      ISO_TO_CURRENCY[isoCode] || isoCode,

      evenement:event

    });



  });



  return resultats;

}



// ======================================================
// ROUTES
// ======================================================


app.get("/health",(req,res)=>{

  res.json({
    status:"ok"
  });

});



// CALENDRIER BC

app.get(
"/scrape/calendar-bc",
verifierSecret,
async(req,res)=>{


try{


const evenements =
await scraperCalendrierBC();


res.json({

success:true,

count:evenements.length,

data:evenements

});


}

catch(error){


res.status(500).json({

success:false,

error:error.message

});


}


});




// GEOPOLITIQUE NEWSAPI


app.get(
"/scrape/geopolitics",
verifierSecret,
async(req,res)=>{


try{


const articles =
await collectNewsAPI();



const filtered =
processGeopoliticalArticles(
articles
);



const translated =
await translateArticles(
filtered
);



res.json({

success:true,

count:translated.length,

data:translated

});


}

catch(error){


console.error(
"Erreur géopolitique :",
error
);


res.status(500).json({

success:false,

error:error.message

});


}


});



// ======================================================
// START SERVER
// ======================================================

app.listen(PORT,()=>{

console.log(
`Service BELIEFX démarré sur port ${PORT}`
);

});
