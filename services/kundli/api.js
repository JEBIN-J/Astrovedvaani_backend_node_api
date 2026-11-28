import axios from "axios";
import zlib from "zlib";

// Local Astroveduvani_api (Python). Replaces NextAstroAPI for matchmaking,
// Lal Kitab and tarot. Start it with PORT=5001 and GEOCODING_PROVIDER=nominatim.
const LOCAL_BASE_URL = (
  process.env.ASTRO_ENGINE_URL || "http://200.97.163.226/api/"
).replace(/\/?$/, "/");
const LOCAL_ORIGIN = LOCAL_BASE_URL.replace(/\/api\/$/, "");

const pad2 = (v) => String(v ?? "").trim().padStart(2, "0");

// "DD-MM-YYYY" or "DD/MM/YYYY" -> "YYYY-MM-DD"
const toIsoDate = (dob) => {
  const [d, m, y] = String(dob).replace(/\//g, "-").split("-");
  return `${y}-${pad2(m)}-${pad2(d)}`;
};

// "H:m" -> "HH:MM:00"
const toIsoTime = (tob) => {
  const [h, m = "0"] = String(tob).split(":");
  return `${pad2(h)}:${pad2(m)}:00`;
};

// NextAstroAPI took a numeric offset; the local API wants an IANA zone.
// Only IST is mapped; otherwise the local API derives it from the place.
const toTimezone = (tz) =>
  Number(tz) === 5.5 ? { timezone: "Asia/Kolkata" } : {};

const toPerson = ({ name, dob, tob, tz, birthPlace }) => ({
  name: name || "User",
  date_of_birth: toIsoDate(dob),
  birth_time: toIsoTime(tob),
  birth_place: birthPlace,
  ...toTimezone(tz),
});

// The local API looks up a place name online (nominatim, ~1 lookup/second) on
// every request. After the first call resolves it, pass the coordinates on so
// parallel calls don't each look it up and get rate-limited.
const withCoordinates = (person, basicRes) => {
  const b = basicRes?.data?.data?.basic_details;
  if (b?.latitude == null || b?.longitude == null) return person;
  return {
    ...person,
    latitude: b.latitude,
    longitude: b.longitude,
    timezone: b.timezone || person.timezone,
  };
};

// A reused keep-alive connection that the local API already closed fails with
// ECONNRESET / "socket hang up" before the request is processed. The local
// calculations are safe to repeat, so retry those once.
const isDroppedConnection = (err) =>
  !err.response &&
  (["ECONNRESET", "EPIPE"].includes(err.code) || /socket hang up/i.test(err.message));

const postLocal = async (path, body) => {
  const send = () =>
    axios.post(`${LOCAL_BASE_URL}${path}`, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    });
  try {
    try {
      return await send();
    } catch (err) {
      if (!isDroppedConnection(err)) throw err;
      return await send();
    }
  } catch (err) {
    const message =
      err.response?.data?.error?.message || err.response?.data?.message;
    if (message) err.response.data.message = message;
    throw err;
  }
};

const SHORT = {
  Sun: "Su", Moon: "Mo", Mars: "Ma", Mercury: "Me", Jupiter: "Ju",
  Venus: "Ve", Saturn: "Sa", Rahu: "Ra", Ketu: "Ke", Ascendant: "Asc",
};
const TRADITIONAL = Object.keys(SHORT);

// North Indian chart as an SVG string (the format NextAstroAPI returned).
// houses: [{ house: 1-12, sign: 1-12, planets: ["Su", ...] }]
const northIndianSvg = (houses) => {
  const S = 400;
  const centers = {
    1: [200, 110], 2: [100, 45], 3: [45, 100], 4: [110, 200],
    5: [45, 300], 6: [100, 355], 7: [200, 290], 8: [300, 355],
    9: [355, 300], 10: [290, 200], 11: [355, 100], 12: [300, 45],
  };
  const text = houses
    .map(({ house, sign, planets = [] }) => {
      const [x, y] = centers[house];
      const signY = [1, 4, 7, 10].includes(house) ? y - 34 : y - 18;
      const lines = planets.map(
        (p, i) =>
          `<text x="${x}" y="${signY + 20 + i * 15}" font-size="12" fill="#1c3a70" text-anchor="middle" font-weight="600">${p}</text>`,
      );
      return `<text x="${x}" y="${signY}" font-size="11" fill="#c0392b" text-anchor="middle">${sign}</text>${lines.join("")}`;
    })
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" font-family="Arial, sans-serif">` +
    `<rect x="1" y="1" width="${S - 2}" height="${S - 2}" fill="#fff" stroke="#1c3a70" stroke-width="2"/>` +
    `<path d="M0 0L${S} ${S}M${S} 0L0 ${S}M${S / 2} 0L${S} ${S / 2}L${S / 2} ${S}L0 ${S / 2}Z" fill="none" stroke="#1c3a70" stroke-width="2"/>` +
    text +
    `</svg>`
  );
};

const KOOT_INFO = {
  Varna: { key: "varna", areaOfLife: "Work" },
  Vashya: { key: "group", areaOfLife: "Dominance" },
  Tara: { key: "varna", areaOfLife: "Destiny" },
  Yoni: { key: "yoni", areaOfLife: "Mentality" },
  "Graha Maitri": { key: "lord", areaOfLife: "Compatibility" },
  Gana: { key: "gana", areaOfLife: "Guna Level" },
  Bhakoot: { key: "rasi_name", areaOfLife: "Love" },
  Nadi: { key: "nadi", areaOfLife: "Health" },
};

// Local /matching/calculate -> NextAstroAPI gun-milan response shape.
const toMatchMakingResponse = (local) => {
  const d = local.data;
  const [score, fullScore] = String(d.guna_milan)
    .split("/")
    .map((v) => Number(v.trim()));
  const koot = Object.fromEntries(d.ashtakoot_points.map((k) => [k.koot, k]));

  const ashtakoot_details = {};
  for (const k of d.ashtakoot_points) {
    const info = KOOT_INFO[k.koot] || { key: "varna", areaOfLife: "" };
    // Older API versions lack the dosha flags; fall back to a zero Nadi/Bhakoot score.
    const hasDosha =
      k.dosha_present ?? (["Nadi", "Bhakoot"].includes(k.koot) && k.obtained === 0);
    ashtakoot_details[k.koot.toLowerCase().replace(/\s+/g, "_")] = {
      label: k.koot,
      name: k.koot, // the mobile apps' table reads "name"
      areaOfLife: info.areaOfLife,
      score: k.obtained,
      full_score: k.full_score,
      [`boy_${info.key}`]: k.boy,
      [`girl_${info.key}`]: k.girl,
      description: k.description,
      meaning: k.meaning,
      // The page shows any value without "no" as a dosha warning.
      dosha: hasDosha && !k.dosha_cancelled ? k.dosha || `${k.koot} Dosha` : "No",
    };
  }

  const moonNakshatra = (chart) =>
    chart?.houses
      ?.flatMap((h) => h.planets || [])
      .find((p) => p.name === "Moon")?.nakshatra;

  const person = (basic, chart, moon, side) => ({
    name: basic?.name,
    birthPlace: basic?.birth_place,
    lat: basic?.latitude,
    lon: basic?.longitude,
    rasi_lord: moon?.rashi_lord ?? koot["Graha Maitri"]?.[side],
    Moon_Sign: moon?.rashi ?? koot.Bhakoot?.[side],
    Moon_Sign_Lord: moon?.rashi_lord ?? koot["Graha Maitri"]?.[side],
    nakshatra: moon?.nakshatra ?? moonNakshatra(chart),
    nakshatra_pada: moon?.pada,
  });

  const chartSvg = (chart) =>
    chart?.houses
      ? northIndianSvg(
          chart.houses.map((h) => ({
            house: h.house,
            sign: h.sign_number,
            planets: (h.planets || []).map((p) => p.short_name),
          })),
        )
      : undefined;

  const manglikStatus = (v) =>
    String(v).toUpperCase() === "YES" ? "Manglik" : "Non-Manglik";
  const mangal = d.dosha_cards?.find((c) => c.title === "Mangal Dosha");

  // Per-dosha fields the mobile apps read: "<key>" (description) and
  // "<pointsKey>" ({ boy, girl } as 1 = present, 0 = absent).
  const isYes = (v) => String(v).toLowerCase() === "yes";
  const doshaFields = {};
  const presentDoshas = [];
  for (const [title, key, pointsKey] of [
    ["Mangal Dosha", "mangaldosh", "mangaldosh_points"],
    ["Pitra Dosha", "pitradosh", "pitradosh_points"],
    ["Kaal Sarp Dosha", "kaalsarpdosh", "kaalsarp_points"],
    ["Manglik Dosha (Saturn)", "manglikdosh_saturn", "manglikdosh_saturn_points"],
    ["Manglik Dosha (Rahu/Ketu)", "manglikdosh_rahuketu", "manglikdosh_rahuketu_points"],
  ]) {
    const card = d.dosha_cards?.find((c) => c.title === title);
    if (!card) continue;
    doshaFields[key] = card.description;
    doshaFields[pointsKey] = { boy: isYes(card.boy) ? 1 : 0, girl: isYes(card.girl) ? 1 : 0 };
    if (isYes(card.boy) || isYes(card.girl)) presentDoshas.push(card.description);
  }

  return {
    success: true,
    data: {
      score,
      full_score: fullScore || 36,
      guna: `${score}/${fullScore || 36}`,
      percentage: d.compatibility_score,
      ...doshaFields,
      // Advice from the doshas found in this match, if any.
      remedies: presentDoshas.length ? presentDoshas.join(" ") : undefined,
      boy: person(d.boy_basic_details, d.boy_lagna_chart, d.boy_moon_details, "boy"),
      girl: person(d.girl_basic_details, d.girl_lagna_chart, d.girl_moon_details, "girl"),
      ashtakoot_details,
      match_summary: {
        ashtakoot: {
          level: score >= 18 ? "good" : "average",
          summary: `Guna Milan score is ${d.guna_milan} (${d.compatibility_score}%). Match recommendation: ${d.match_recommendable}.`,
        },
        manglik: {
          boy: { status: manglikStatus(d.boy_manglik) },
          girl: { status: manglikStatus(d.girl_manglik) },
          match:
            String(d.boy_manglik).toUpperCase() ===
            String(d.girl_manglik).toUpperCase()
              ? "Yes"
              : "No",
          summary: mangal?.description,
        },
      },
      boy_chart: chartSvg(d.boy_lagna_chart),
      girl_chart: chartSvg(d.girl_lagna_chart),
      dosha_cards: d.dosha_cards,
    },
  };
};

const splitPlanets = (v) =>
  !v || v === "-" ? [] : String(v).split(/\s*,\s*/).filter(Boolean);

// "DD/MM/YYYY - DD/MM/YYYY" -> { from, to }
const splitPeriod = (period) => {
  const [from, to] = String(period).split(/\s*-\s*/);
  return { from, to };
};

// Local /lal-kitab/calculate -> NextAstroAPI lal-kitab response shape.
const toLalKitabResponse = (local) => {
  const d = local.data;
  const traditional = d.planetary_positions.filter((p) =>
    TRADITIONAL.includes(p.name),
  );

  // house_details lists planets with degrees attached ("Rahu 120°43'"), so
  // group the clean planet names from planetary_positions by house instead.
  const planetsByHouse = {};
  const degreeOf = {};
  for (const p of traditional) {
    if (p.name === "Ascendant") continue;
    (planetsByHouse[p.house] ||= []).push(p.name);
    degreeOf[p.name] = p.degree;
  }
  // The current mahadasha's antardashas, attached to its timeline entry.
  const current = d.dasha?.current_mahadasha;
  const currentAntardashas = (current?.antardashas || []).map((a) => ({
    planet: a.planet,
    ...splitPeriod(a.period),
  }));

  const houses = {};
  for (const h of d.house_details) {
    houses[h.house] = {
      sign: h.house,
      khanaNo: h.house, // house number, as the astrologer app's house cards read it
      // The house cards read p.planet, so each entry is { planet: "Sun" };
      // the mobile apps also read name, code and degree / longitude.
      planets: (planetsByHouse[h.house] || []).map((planet) => ({
        planet,
        name: planet,
        code: SHORT[planet],
        degree: degreeOf[planet],
        longitude: degreeOf[planet],
      })),
      maalik: splitPlanets(h.maalik),
      pakka: splitPlanets(h.pakka),
      kismat: splitPlanets(h.kismat),
      exalt: splitPlanets(h.exalted),
      debil: splitPlanets(h.debilitated),
      soya: !!h.is_soya,
    };
  }

  return {
    success: true,
    data: {
      birthMeta: {
        date: d.birth_details.birth_date,
        time: d.birth_details.birth_time,
        place: d.birth_details.birth_place,
      },
      planetaryDetails: traditional.map((p) => ({
        planet: p.name,
        house: p.house,
        sign: p.sign,
        degree: p.degree,
        longitude: p.degree, // the mobile app's name for the same value
        position: p.position,
        nature: p.nature,
      })),
      lalKitabChart: northIndianSvg(
        d.house_details.map((h) => ({
          house: h.house,
          sign: h.house,
          planets: (planetsByHouse[h.house] || []).map((p) => SHORT[p]),
        })),
      ),
      houses,
      lalKitabDasha: (d.dasha.complete_dasha_timeline || []).map((x) => ({
        planet: x.planet,
        ...splitPeriod(x.period),
        years: parseInt(x.duration, 10),
        ...(current && x.planet === current.planet && x.period === current.period
          ? { antardashas: currentAntardashas }
          : {}),
      })),
      rinAnalysis: (d.rin_analysis || []).map((r) => ({
        type: r.name,
        triggers: r.triggers || [],
        predictions: r.predictions || [],
        remedies: r.remedies || [],
      })),
      tevaAnalysis: (d.teva_analysis || []).map((t) => ({
        type: t.name,
        traits: t.traits || [],
        predictions: t.predictions || [],
        remedies: t.remedies || [],
      })),
      ...toVarshaphal(d.varshphal),
    },
  };
};

// Local Lal Kitab varshphal -> the page's varshaphal summary and chart.
const toVarshaphal = (v) => {
  if (!v?.available) return {};
  const startYear = Number(String(v.year_start).slice(0, 4));
  const houses = v.houses || [];
  return {
    varshaphal: {
      // Lal Kitab counts the running year of age (completed years + 1).
      age: v.running_year,
      runningYear: v.running_year,
      // Muntha starts in the 1st house at birth and moves one house per
      // completed year.
      munthaHouse:
        v.age_completed == null ? undefined : (Number(v.age_completed) % 12) + 1,
      year: `${startYear}-${startYear + 1}`,
      houseSummary: Object.fromEntries(
        houses.map((h) => [
          h.house,
          // khanaNo is required: the astrologer app keys its list by it.
          { khanaNo: h.house, planets: h.planets, planetCount: h.planet_count },
        ]),
      ),
    },
    varshaphalChart: northIndianSvg(
      houses.map((h) => ({
        house: h.house,
        sign: h.house,
        planets: h.planets.map((p) => SHORT[p] || p),
      })),
    ),
  };
};

// Tarot images are proxied by this backend (GET /api/tarot/images/:file), so
// browsers on other devices never need to reach the local Python API.
// baseUrl is the backend origin the browser used (from the request), so the
// link works however the frontend reaches this server.
const tarotImageUrl = (imageUrl, baseUrl) => {
  const file = String(imageUrl || "").split("/").pop();
  const base = (baseUrl || process.env.APP_BASE_URL || LOCAL_ORIGIN).replace(/\/$/, "");
  return `${base}/api/tarot/images/${encodeURIComponent(file)}`;
};

// Local tarot card -> NextAstroAPI tarot card shape.
const toTarotCard = (c, baseUrl) => ({
  id: c.card_id, // the mobile app tracks cards by id
  name: c.name,
  image: tarotImageUrl(c.image_url, baseUrl),
  direction: c.orientation_label,
  description: c.core_meaning,
  position: c.position_name,
  keywords: c.keywords,
});

// ───────────────────── Free Kundli (FULL_KUNDLI) ─────────────────────

const SIGN_NAMES = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];
const OUTER = ["Uranus", "Neptune", "Pluto"];

// South Indian chart: fixed sign boxes around a 4x4 grid.
// signs: { 1-12: ["Su", ...] }, ascSign: 1-12
const southIndianSvg = (signs, ascSign) => {
  const S = 400;
  const c = S / 4;
  const cells = {
    12: [0, 0], 1: [1, 0], 2: [2, 0], 3: [3, 0], 4: [3, 1], 5: [3, 2],
    6: [3, 3], 7: [2, 3], 8: [1, 3], 9: [0, 3], 10: [0, 2], 11: [0, 1],
  };
  const boxes = Object.entries(cells)
    .map(([sign, [col, row]]) => {
      const x = col * c;
      const y = row * c;
      const items = [...(Number(sign) === ascSign ? ["Asc"] : []), ...(signs[sign] || [])];
      const lines = items.map(
        (p, i) =>
          `<text x="${x + c / 2}" y="${y + 36 + i * 14}" font-size="12" fill="#1c3a70" text-anchor="middle" font-weight="600">${p}</text>`,
      );
      return (
        `<rect x="${x}" y="${y}" width="${c}" height="${c}" fill="#fff" stroke="#1c3a70" stroke-width="1.5"/>` +
        `<text x="${x + 6}" y="${y + 14}" font-size="10" fill="#c0392b">${SIGN_NAMES[sign - 1].slice(0, 3)}</text>` +
        lines.join("")
      );
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" font-family="Arial, sans-serif">${boxes}</svg>`;
};

// Planet label as NextAstroAPI charts showed it, e.g. "Ra(R)".
const chartLabel = (p) =>
  `${p.short_name}${p.is_retrograde && !["Ra", "Ke"].includes(p.short_name) ? "(R)" : ""}`;

const chartPlanets = (house) =>
  (house.planets || []).filter(
    (p) => !p.is_ascendant && p.name !== "Ascendant" && !OUTER.includes(p.name),
  );

// Local chart { houses: [{ house_number, sign_number, planets }] } -> { north, south } SVGs
const chartSvgs = (chart) => {
  const houses = chart?.houses || [];
  if (!houses.length) return { north: undefined, south: undefined };
  const north = northIndianSvg(
    houses.map((h) => ({
      house: h.house_number ?? h.house,
      sign: h.sign_number ?? h.sign,
      planets: chartPlanets(h).map(chartLabel),
    })),
  );
  const bySign = {};
  let ascSign;
  for (const h of houses) {
    const sign = h.sign_number ?? h.sign;
    if ((h.house_number ?? h.house) === 1) ascSign = sign;
    bySign[sign] = chartPlanets(h).map(chartLabel);
  }
  return { north, south: southIndianSvg(bySign, ascSign) };
};

// Local D1/D9 chart -> NextAstroAPI vedicCharts.d1 / d9
const toVedicChart = (chart) => {
  const planets = [];
  for (const h of chart?.houses || []) {
    for (const p of h.planets || []) {
      // The tables list all 12 planets (the page has colours for Ur/Ne/Pl);
      // the chart drawings keep the traditional 9.
      if (p.is_ascendant || p.name === "Ascendant") continue;
      planets.push({
        code: p.short_name,
        name: p.name,
        signName: h.sign_name,
        signNum: String(h.sign_number),
        degree: (p.dms || p.d9_dms)?.formatted,
        longitude: p.longitude,
        nakshatra: p.nakshatra,
        retro: !!p.is_retrograde,
      });
    }
  }
  return {
    charts: chartSvgs(chart),
    ascendant: {
      signName: chart?.ascendant?.sign,
      degree: chart?.ascendant?.dms?.formatted,
    },
    planets,
  };
};

const NUMERO_KEYS = {
  Destiny: "destiny",
  "Soul Urge": "soul",
  Personality: "personality",
  Attitude: "attitude",
  Character: "character",
  "Hidden Agenda": "agenda",
  "Divine Purpose": "purpose",
};

const toNumerology = (n) => {
  if (!n) return undefined;
  const numeroReport = {};
  for (const card of n.cards || []) {
    const key = NUMERO_KEYS[card.title];
    if (!key) continue;
    numeroReport[key] = {
      // The astrologer app lists only cards that have a title.
      title: card.title,
      category: key,
      number: card.number,
      meaning: card.trait,
      description: card.description,
    };
    numeroReport[`${key}Number`] = card.number;
  }
  return { numeroReport, numerologyTable: n.details_table };
};

// Lahiri ayanamsa in degrees, from a local ashtakavarga/chart response.
const ayanamsaOf = (ashtakRes) => {
  const v = ashtakRes?.data?.data?.calculation_metadata?.ayanamsa_value_deg;
  return v == null ? undefined : Number(Number(v).toFixed(6));
};

const findPlanet = (chart, name) => {
  for (const h of chart?.houses || []) {
    const p = (h.planets || []).find((x) => x.name === name);
    if (p) return { ...p, sign_name: h.sign_name };
  }
  return undefined;
};

const toPanchangAvakhada = (basicRes, d1, input) => {
  const b = basicRes.basic_details;
  const a = basicRes.avakhada_details;
  const moon = findPlanet(d1, "Moon");
  return {
    basicDetails: {
      name: b.name,
      dob: input.dob,
      tob: input.tob,
      birthPlace: b.birth_place,
      latitude: b.latitude,
      longitude: b.longitude,
      timezone: b.timezone_offset,
      // The mobile apps' Basic tab also shows these.
      sunrise: b.sunrise_time,
      sunset: b.sunset_time,
      ayanamsa: input.ayanamsa,
      Ascendant: d1?.ascendant?.sign,
      Moon_Sign: a.rasi,
      Sun_Sign: findPlanet(d1, "Sun")?.sign_name,
    },
    panchangDetails: basicRes.panchang_details,
    avakhadaDetails: {
      sgana: a.gana,
      yoni: a.yoni,
      vasya: a.vashya,
      nadi: a.nadi,
      varna: a.varna,
      paya: a.paya,
      Tatva: a.tatva,
      Moon_Sign: a.rasi,
      Moon_Sign_Lord: a.rasi_lord,
      nakshatra: a.nakshatra,
      NakshatraLord: a.nakshatra_lord,
      NakshatraPada: moon?.pada,
      LifeStone: a.life_stone,
      LuckyStone: a.lucky_stone,
      FortuneStone: a.fortune_stone,
      NameStart: a.name_start,
    },
  };
};

const toKpSystem = (kp, style) => {
  const chalit = kp.chalit_chart;
  const details = {};
  for (const h of chalit?.houses || []) {
    for (const p of h.planets || []) details[p.name] = p;
  }
  const asc = chalit?.ascendant || {};
  const signLord = (sign) => SIGN_LORDS[Number(sign) - 1];
  const kpPlanets = [
    {
      planet_id: 99,
      planet_name: "Ascendant",
      sign: String(asc.sign),
      sign_lord: signLord(asc.sign),
      formatted_degree: asc.formatted,
      nakshatra: asc.nakshatra,
      nakshatra_lord: asc.nakshatra_lord,
      sub_lord: asc.sub_lord,
      house: 1,
      is_retro: false,
    },
    ...(kp.kp_planets || [])
      .filter((p) => p.planet !== "Ascendant" && !OUTER.includes(p.planet))
      .map((p, i) => {
        const d = details[p.planet] || {};
        return {
          planet_id: i,
          planet_name: p.planet,
          sign: String(p.sign),
          sign_lord: signLord(p.sign),
          formatted_degree: d.dms?.formatted,
          nakshatra: d.nakshatra,
          nakshatra_lord: p.nakshatra_lord,
          sub_lord: d.sub_lord,
          house: p.house,
          is_retro: !!d.is_retrograde,
        };
      }),
  ];
  const houses = (kp.kp_house_cusps || []).map((h) => ({
    house_id: h.house,
    sign: String(h.sign),
    sign_lord: signLord(h.sign),
    formatted_degree: h.dms?.formatted,
    nakshatra: h.nakshatra,
    nakshatra_lord: h.nakshatra_lord,
    sub_lord: h.sub_lord,
  }));
  return {
    chalitChart: chartSvgs(chalit)[style],
    kpPlanets,
    houses,
    // The mobile apps read the cusp table under this name.
    kpHouseCusps: houses,
  };
};

const toAshtakavarga = (a) => {
  const planetResults = {};
  for (const [planet, rows] of Object.entries(a.bhinna_ashtakavarga || {})) {
    planetResults[planet] = {
      ashtak_points: Object.fromEntries(
        rows.map((r) => [r.sign_name, { total: r.bindus ?? r.points }]),
      ),
    };
  }
  const sarvashtak = {
    ashtak_points: Object.fromEntries(
      (a.sarvashtakavarga?.signs || []).map((r) => [r.sign_name, r]),
    ),
  };
  return { planetResults, sarvashtak };
};

// Local divisional chart codes -> keys the Charts tab looks for
const DIVISIONAL_KEYS = {
  CHALIT: "chalit", SUN: "SUN", MOON: "MOON", D2: "HORA", D3: "Drekkana",
  D4: "Chaturthamsha", D7: "Saptamamsha", D10: "Dashamamsha",
  D12: "Dwadashmamsha", D16: "Shodashamsha", D20: "Vimshamsha",
  D24: "Chaturvimshamsha", D27: "Saptavimshamsha", D30: "Trimshamsha",
  D40: "Khavedamsha", D45: "Akshvedamsha", D60: "Shastiamsha",
};

const toDivisionalCharts = (charts, style) => {
  const out = {};
  for (const [code, key] of Object.entries(DIVISIONAL_KEYS)) {
    const svg = charts?.[code] && chartSvgs(charts[code])[style];
    if (svg) out[key] = svg;
  }
  return out;
};

const toDashaPeriod = (d, children) => ({
  planet: d.lord,
  start: d.start_date_formatted,
  end: d.end_date_formatted,
  ...children,
});

const toDasha = (dasha) => ({
  majorVdasha: (dasha.mahadashas || []).map((m) =>
    toDashaPeriod(m, {
      antardasha: (m.antardashas || []).map((a) =>
        toDashaPeriod(a, {
          pratyantardasha: (a.pratyantardashas || []).map((p) =>
            toDashaPeriod(p),
          ),
        }),
      ),
    }),
  ),
});

const fullKundli = async ({ dob, tob, tz, name, birthPlace, style, gender }) => {
  const person = toPerson({ name, dob, tob, tz, birthPlace });
  const chartStyle = style === "south" ? "south" : "north";

  // kundli/basic requires gender; it is only echoed back, not used in calculations.
  // It runs first so the birth place is looked up once.
  const basicRes = await postLocal("kundli/basic", { ...person, gender: gender || "male" });
  const located = withCoordinates(person, basicRes);

  const [chartRes, kpRes, ashtakRes, divRes, dashaRes, lalKitabRes] =
    await Promise.all([
      postLocal("kundli/chart", located),
      postLocal("kp/chart", located),
      postLocal("ashtakavarga/chart", located),
      postLocal("charts/chart", located),
      postLocal("dasha/chart", located),
      postLocal("lal-kitab/calculate", located),
    ]);

  const charts = chartRes.data.data;
  const d1 = charts.d1_lagna_chart;
  const divCharts = divRes.data.data.charts;
  const panchangAvakhada = toPanchangAvakhada(basicRes.data.data, d1, {
    dob,
    tob,
    ayanamsa: ayanamsaOf(ashtakRes),
  });
  panchangAvakhada.panchangDetails = {
    ...panchangAvakhada.panchangDetails,
    nakshatraIndex: dashaRes.data.data.moon_details?.nakshatra_number,
  };
  const kpSystem = toKpSystem(kpRes.data.data, chartStyle);

  // kundli/chart's D9 planets have no nakshatra; charts/chart's D9 has the same
  // signs and degrees plus nakshatra, so take the D9 planets from there.
  const d9 = toVedicChart(charts.d9_navamsa_chart);
  if (divCharts?.D9) {
    d9.planets = toVedicChart(divCharts.D9).planets.map(
      ({ longitude, ...p }) => p,
    );
  }

  return {
    success: true,
    data: {
      panchangAvakhada,
      vedicCharts: {
        d1: toVedicChart(d1),
        d9,
        numerology: toNumerology(charts.numerology),
      },
      kpSystem,
      ashtakavarga: toAshtakavarga(ashtakRes.data.data),
      divisionalCharts: {
        KP_CHALIT: kpSystem.chalitChart,
        ...toDivisionalCharts(divCharts, chartStyle),
      },
      dasha: toDasha(dashaRes.data.data),
      lalKitab: { success: true, ...toLalKitabResponse(lalKitabRes.data).data },
    },
  };
};

// ───────────────────── Basic Kundli (KUNDLI) ─────────────────────

// Basic birth details. Field names cover what the backend reads from this
// response (updateUserAstrologyWithKundli, horoscope rasi lookup) and the
// panchangAvakhada names used by the full kundli.
const kundliBasic = async ({ dob, tob, tz, name, birthPlace, gender }) => {
  const person = toPerson({ name, dob, tob, tz, birthPlace });
  // kundli/basic requires gender; it is only echoed back, not used in calculations.
  const basicRes = await postLocal("kundli/basic", { ...person, gender: gender || "male" });
  const located = withCoordinates(person, basicRes);
  // Ashtakavarga is fetched only for its ayanamsa value (basic/chart don't return it).
  const [chartRes, ashtakRes] = await Promise.all([
    postLocal("kundli/chart", located),
    postLocal("ashtakavarga/chart", located).catch(() => null),
  ]);

  const basic = basicRes.data.data;
  const d1 = chartRes.data.data.d1_lagna_chart;
  const a = basic.avakhada_details;
  const moon = findPlanet(d1, "Moon");
  const sunSign = findPlanet(d1, "Sun")?.sign_name;
  const ascendantSign = d1?.ascendant?.sign;
  const base = toPanchangAvakhada(basic, d1, { dob, tob, ayanamsa: ayanamsaOf(ashtakRes) });

  return {
    success: true,
    data: {
      basicDetails: {
        ...base.basicDetails,
        sunSign,
        ascendantSign,
        rasi: a.rasi,
        rasi_lord: a.rasi_lord,
      },
      panchangDetails: {
        ...basic.panchang_details,
        nakshatra: a.nakshatra,
        nakshatra_lord: a.nakshatra_lord,
        nakshatra_pada: moon?.pada,
      },
      avakhadaDetails: {
        ...base.avakhadaDetails,
        varna: a.varna,
        vashya: a.vashya,
        yoni: a.yoni,
        gana: a.gana,
        nadi: a.nadi,
        paya: a.paya,
        tatva: a.tatva,
        rasi: a.rasi,
        rasi_lord: a.rasi_lord,
        nakshatra_lord: a.nakshatra_lord,
        life_stone: a.life_stone,
        lucky_stone: a.lucky_stone,
        fortune_stone: a.fortune_stone,
        name_start: a.name_start,
        sun_sign: sunSign,
      },
    },
  };
};

// ───────────────────── Free Report (ASCENDANT_REPORT) ─────────────────────

const SIGN_LORDS = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];

// 1 -> "1st", 2 -> "2nd", 11 -> "11th", 12 -> "12th"
const ordinal = (n) => {
  if (n >= 11 && n <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
};

// D1 planets with their whole-sign house number.
const d1Placements = (d1) =>
  (d1?.houses || []).flatMap((h) =>
    (h.planets || [])
      .filter((p) => !p.is_ascendant && p.name !== "Ascendant")
      .map((p) => ({ ...p, house: h.house_number, sign_name: h.sign_name, sign_number: h.sign_number })),
  );

// Only factual placements: the local API has no prediction text.
const toPlanetary = (d1) =>
  Object.fromEntries(
    d1Placements(d1).map((p) => [
      p.name,
      `${p.name} is in ${p.sign_name} in the ${ordinal(p.house)} house at ` +
        `${p.dms?.formatted}, in ${p.nakshatra} nakshatra (pada ${p.pada})` +
        `${p.is_retrograde && !["Rahu", "Ketu"].includes(p.name) ? ", retrograde" : ""}.`,
    ]),
  );

const toGeneral = (d1) => {
  const asc = d1?.ascendant || {};
  const ascSign = SIGN_NAMES.indexOf(asc.sign) + 1;
  const lord = SIGN_LORDS[ascSign - 1];
  const lordAt = d1Placements(d1).find((p) => p.name === lord);
  return {
    ascendant: asc.sign,
    ascendant_lord: lord,
    ascendant_lord_location: lordAt?.sign_name,
    ascendant_lord_house_location: lordAt?.house,
    predictions: {
      general:
        `Ascendant (Lagna) is ${asc.sign} at ${asc.dms?.formatted} in ${asc.nakshatra} nakshatra (pada ${asc.pada}). ` +
        (lordAt
          ? `Its lord ${lord} is in ${lordAt.sign_name} in the ${ordinal(lordAt.house)} house.`
          : ""),
    },
  };
};

// Per-person dosha status from the local matching engine (person checked against itself).
const doshaCard = (cards, title) => cards?.find((c) => c.title === title);
const yes = (v) => String(v).toLowerCase() === "yes";

const toDoshaTab = (match) => {
  const cards = match?.dosha_cards;
  const mangal = doshaCard(cards, "Mangal Dosha");
  const kaalSarp = doshaCard(cards, "Kaal Sarp Dosha");
  const otherManglik = (cards || [])
    .filter((c) => c.title.startsWith("Manglik Dosha (") && yes(c.boy))
    .map((c) => c.title.replace(/^Manglik Dosha \((.*)\)$/, "$1 influence"));
  const isManglik = yes(mangal?.boy);
  const hasKaalSarp = yes(kaalSarp?.boy);
  return {
    Manglik: mangal && {
      status: isManglik ? "Manglik" : "Non-Manglik",
      type: isManglik ? "Mars (Kuja) Dosha" : "None",
      analysis:
        (isManglik
          ? "Mars occupies a sensitive house from the Lagna, Moon or Venus."
          : "Mars does not form Manglik Dosha from the Lagna, Moon or Venus.") +
        (otherManglik.length
          ? ` Other marital-house afflictions: ${otherManglik.join(", ")}.`
          : ""),
      disclaimer:
        "Calculated automatically; consult an astrologer before making decisions.",
    },
    Kalsarpa: kaalSarp && {
      status: hasKaalSarp ? "Present" : "Not Present",
      analysis: hasKaalSarp
        ? "All planets are placed between Rahu and Ketu."
        : "Planets are not all hemmed between Rahu and Ketu.",
    },
  };
};

const freeReport = async ({ dob, tob, tz, name, birthPlace, gender }) => {
  const person = toPerson({ name, dob, tob, tz, birthPlace });
  const basicRes = await postLocal("kundli/basic", { ...person, gender: gender || "male" });
  const located = withCoordinates(person, basicRes);
  const [chartRes, matchRes, predictionRes] = await Promise.all([
    postLocal("kundli/chart", located),
    postLocal("matching/calculate", { boy: located, girl: located }),
    postLocal("prediction/calculate", located),
  ]);
  const b = basicRes.data.data.basic_details;
  const d1 = chartRes.data.data.d1_lagna_chart;
  const general = toGeneral(d1);
  const predicted = predictionRes.data.data.predictions;
  general.predictions = {
    general: `${general.predictions.general} ${predicted.general}`,
    personality: predicted.personality,
    physical: predicted.physical,
    health: predicted.health,
    career: predicted.career,
    relationship: predicted.relationship,
  };
  return {
    success: true,
    data: {
      user: {
        name: b.name,
        date: dob,
        time: tob,
        location: { lat: b.latitude, lon: b.longitude, timezone: b.timezone_offset },
      },
      general_tab: { General: general, Planetary: toPlanetary(d1) },
      // The local API has no Sade Sati calculation, so that section is omitted.
      dosha_tab: toDoshaTab(matchRes.data.data),
    },
  };
};

// ───────────────────── Numerology calculator (FULL_NUMEROLOGY) ─────────────────────

// Letter -> value grid for the name, as a base64 PNG. PNG (not SVG) because the
// mobile app shows it with React Native's <Image>, which cannot draw SVG; the
// website's <img> shows PNG too. Drawn with a 5x7 pixel font, no image library.
const GLYPHS = {
  A: "01110100011000111111100011000110001", B: "11110100011000111110100011000111110",
  C: "01110100011000010000100001000101110", D: "11110100011000110001100011000111110",
  E: "11111100001000011110100001000011111", F: "11111100001000011110100001000010000",
  G: "01110100011000010111100011000101111", H: "10001100011000111111100011000110001",
  I: "01110001000010000100001000010001110", J: "00111000100001000010000101001001100",
  K: "10001100101010011000101001001010001", L: "10000100001000010000100001000011111",
  M: "10001110111010110101100011000110001", N: "10001100011100110101100111000110001",
  O: "01110100011000110001100011000101110", P: "11110100011000111110100001000010000",
  Q: "01110100011000110001101011001001101", R: "11110100011000111110101001001010001",
  S: "01111100001000001110000010000111110", T: "11111001000010000100001000010000100",
  U: "10001100011000110001100011000101110", V: "10001100011000110001100010101000100",
  W: "10001100011000110101101011010101010", X: "10001100010101000100010101000110001",
  Y: "10001100010101000100001000010000100", Z: "11111000010001000100010001000011111",
  0: "01110100011001110101110011000101110", 1: "00100011000010000100001000010001110",
  2: "01110100010000100010001000100011111", 3: "11111000100010000010000011000101110",
  4: "00010001100101010010111110001000010", 5: "11111100001111000001000011000101110",
  6: "00110010001000011110100011000101110", 7: "11111000010001000100010000100001000",
  8: "01110100011000101110100011000101110", 9: "01110100011000101111000010001001100",
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const pngChunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

// Splits the mapping into one row per word of the name (letters only are
// mapped); falls back to rows of 10 if the counts don't line up.
const mappingRows = (mapping, name) => {
  const words = String(name || "")
    .toUpperCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Z]/g, "").length)
    .filter(Boolean);
  const rows = [];
  if (words.reduce((a, b) => a + b, 0) === mapping.length) {
    let i = 0;
    for (const n of words) rows.push(mapping.slice(i, (i += n)));
  } else {
    for (let i = 0; i < mapping.length; i += 10) rows.push(mapping.slice(i, i + 10));
  }
  return rows;
};

const nameMappingPng = (mapping, name) => {
  if (!mapping?.length) return undefined;
  const rows = mappingRows(mapping, name);
  const CELL = 64, SCALE = 4, PAD = 12, GAP = 12, LINE = 2;
  const cols = Math.max(...rows.map((r) => r.length));
  const width = PAD * 2 + cols * CELL;
  const height = PAD * 2 + rows.length * CELL * 2 + (rows.length - 1) * GAP;
  const px = Buffer.alloc(width * height * 3, 0xff); // white RGB canvas

  const NAVY = [0x1c, 0x3a, 0x70], RED = [0xc0, 0x39, 0x2b];
  const fill = (x, y, w, h, [r, g, b]) => {
    for (let yy = Math.max(0, y); yy < Math.min(height, y + h); yy++)
      for (let xx = Math.max(0, x); xx < Math.min(width, x + w); xx++) {
        const o = (yy * width + xx) * 3;
        px[o] = r; px[o + 1] = g; px[o + 2] = b;
      }
  };
  // Text centred in the box at (x, y, w, h)
  const text = (str, x, y, w, h, color) => {
    const chars = String(str).toUpperCase().split("").filter((ch) => GLYPHS[ch]);
    const tw = chars.length * 6 * SCALE - SCALE;
    let cx = x + Math.round((w - tw) / 2);
    const cy = y + Math.round((h - 7 * SCALE) / 2);
    for (const ch of chars) {
      const g = GLYPHS[ch];
      for (let i = 0; i < 35; i++)
        if (g[i] === "1") fill(cx + (i % 5) * SCALE, cy + Math.floor(i / 5) * SCALE, SCALE, SCALE, color);
      cx += 6 * SCALE;
    }
  };

  rows.forEach((row, r) => {
    const top = PAD + r * (CELL * 2 + GAP);
    row.forEach(({ letter, value }, c) => {
      const left = PAD + c * CELL;
      fill(left, top, CELL + LINE, LINE, NAVY); // top
      fill(left, top + CELL, CELL + LINE, LINE, NAVY); // middle
      fill(left, top + CELL * 2, CELL + LINE, LINE, NAVY); // bottom
      fill(left, top, LINE, CELL * 2 + LINE, NAVY); // left
      fill(left + CELL, top, LINE, CELL * 2 + LINE, NAVY); // right
      text(letter, left, top, CELL, CELL, NAVY);
      text(value, left, top + CELL, CELL, CELL, RED);
    });
  });

  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    px.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
};

// "Destiny Number" -> "destiny", "Soul Urge Number" -> "soul" (the key the
// mobile app reads; the website shows each card's title, not its key)
const reportKey = (title) => {
  const key = String(title).toLowerCase().replace(/\s*number\s*$/, "").trim().replace(/\s+/g, "_");
  return key === "soul_urge" ? "soul" : key;
};

const fullNumerology = async ({ name, dob, tob, tz, birthplace }) => {
  const person = toPerson({ name, dob, tob: tob || "00:00", tz, birthPlace: birthplace });
  // Resolve the place once, then reuse the coordinates.
  const basicRes = await postLocal("kundli/basic", { ...person, gender: "male" });
  const located = withCoordinates(person, basicRes);
  const [numeroRes, chartRes] = await Promise.all([
    postLocal("numerology/calculate", located),
    postLocal("kundli/chart", located),
  ]);
  const numero = numeroRes.data.data;
  const table = chartRes.data.data.numerology?.details_table || {};

  const numeroReport = Object.fromEntries(
    (numero.numerology_details || []).map((d) => [
      reportKey(d.title),
      { title: d.title, number: d.number, meaning: d.trait, description: d.description },
    ]),
  );

  return {
    success: true,
    data: {
      numeroReport,
      numerologyTable: table,
      // The same table under the name and field names the mobile app reads.
      numeroTable: {
        ...table,
        date_considered: table.date,
        destiny: table.destiny_number,
      },
      nameMappingImage: nameMappingPng(numero.name_mapping, name),
    },
  };
};

const drawTarot = async (card_option, baseUrl) => {
  const res = await postLocal("tarot/calculate", {
    card_option,
    question: "General guidance",
  });
  const cards = (res.data?.data?.cards || []).map((c) => toTarotCard(c, baseUrl));
  const data =
    card_option === "one_card" ? { card: cards[0] } : { spread: cards };
  return { data: { success: true, data } };
};

// ───────────────────── Panchang + Choghadiya (local) ─────────────────────

// The panchang service fetches PANCHANG and CHOGHADIYA in parallel; both come
// from one local calculation, so share the in-flight request (one place lookup).
const panchangInFlight = new Map();

const calculatePanchang = ({ date, location }) => {
  const isoDate = toIsoDate(date);
  const key = `${isoDate}|${String(location).trim().toLowerCase()}`;
  if (!panchangInFlight.has(key)) {
    // No timezone is sent: the local API derives it from the place's
    // coordinates, so times are local to that place.
    const request = postLocal("panchang/calculate", {
      date: isoDate,
      place: location,
    })
      .then((res) => res.data.data)
      .finally(() => panchangInFlight.delete(key));
    panchangInFlight.set(key, request);
  }
  return panchangInFlight.get(key);
};

// "06:51 AM - 07:43 AM" -> { start: "06:51 AM", end: "07:43 AM" }
const splitTimeRange = (range) => {
  const [start = "", end = ""] = String(range || "").split(" - ");
  return { start: start.trim(), end: end.trim() };
};

// "1948 (Parabhava)" -> { year: 1948, name: "Parabhava" }
const parseSamvat = (value) => {
  const match = /^(\d+)\s*(?:\(([^)]+)\))?/.exec(String(value || ""));
  return match ? { year: Number(match[1]), name: match[2] || "" } : { year: null, name: "" };
};

const toPanchangResponse = (p) => {
  const d = p.panchang_details;
  const shaka = parseSamvat(d.shaka_samvat);
  const horas = ["day", "night"].flatMap((type) =>
    (p.hora_muhurta?.[type] || []).map((h) => ({
      ...splitTimeRange(h.time),
      planet: h.planet,
      type,
      description: h.description,
    })),
  );
  return {
    success: true,
    panchang: {
      sunrise: p.sunrise,
      sunset: p.sunset,
      moonrise: p.moonrise,
      moonset: p.moonset,
      vedicSunrise: p.vedic_sunrise,
      vedicSunset: p.vedic_sunset,
      tithi: d.tithi,
      tithiSpecial: d.tithi_special,
      deity: d.deity,
      nakshatra: String(d.nakshatra || "").replace(/\s*\(\d+\)$/, ""),
      nakshatraNumber: d.nakshatra_number,
      nakshatraRuler: d.nakshatra_lord,
      nakshatraDeity: d.nakshatra_deity,
      nakshatraSpecial: d.nakshatra_special,
      summary: p.summary,
      paksha: d.paksha,
      ritu: d.ritu,
      vikramSamvat: d.vikram_samvat,
      shakaSamvat: shaka.year,
      shakaSamvatName: shaka.name,
      location: p.place,
      timezone: d.timezone,
    },
    horaMuhurta: { dayOfWeek: p.weekday, horas },
  };
};

// Choghadiya nature -> the three types the panchang page colours by.
const CHOGHADIYA_TYPE = {
  Amrit: "Auspicious",
  Shubh: "Auspicious",
  Labh: "Auspicious",
  Chhar: "Good",
  Rog: "Inauspicious",
  Kaal: "Inauspicious",
  Udveg: "Inauspicious",
};

const toChoghadiyaResponse = (p, date) => {
  const toTiming = (c) => ({
    start: c.start,
    end: c.end,
    muhurat: c.name,
    type: CHOGHADIYA_TYPE[c.name] || "Good",
    detailedType: c.nature,
    rulingPlanet: c.ruler,
    influenceMeaning: c.description,
  });
  return {
    success: true,
    data: {
      date,
      choghadiyaMuhurat: {
        dayOfWeek: p.weekday,
        location: p.place,
        timings: {
          day: (p.choghadiya?.day || []).map(toTiming),
          night: (p.choghadiya?.night || []).map(toTiming),
        },
      },
    },
  };
};

// ───────────── Monthly panchang (good/bad days, monthly choghadiya) ─────────────

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

// "2026-03", "03-2026", "2026/3", "March", "March 2026", "3" -> { year, month }
// (a month without a year means the current year)
const parseMonth = (value) => {
  const now = new Date();
  const s = String(value ?? "").trim().toLowerCase();
  let m = /^(\d{4})[-/](\d{1,2})$/.exec(s);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  m = /^(\d{1,2})[-/](\d{4})$/.exec(s);
  if (m) return { year: Number(m[2]), month: Number(m[1]) };
  m = /^([a-z]+)\s*(\d{4})?$/.exec(s);
  if (m) {
    const idx = MONTH_NAMES.findIndex((n) => n.startsWith(m[1].slice(0, 3)));
    if (idx >= 0) return { year: Number(m[2] || now.getFullYear()), month: idx + 1 };
  }
  if (/^\d{1,2}$/.test(s)) return { year: now.getFullYear(), month: Number(s) };
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

// "28.6139,77.2090" -> { latitude, longitude }
const parseCoordinates = (location) => {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(location ?? ""));
  return m ? { latitude: Number(m[1]), longitude: Number(m[2]) } : null;
};

// The local API rate-limits requests (60/minute by default). A month needs one
// panchang request per day, so retry a 429 after a short wait.
const postLocalRetry = async (path, body, tries = 4) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await postLocal(path, body);
    } catch (err) {
      if (err.response?.status !== 429 || attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
};

// Resolved places, shared by all requests (place name -> coordinates).
const placeCache = new Map();

// Resolve a place once (name or "lat,lon") so the per-day panchang requests
// don't each look it up (the place lookup is rate limited).
const resolvePlace = async (location, isoDate) => {
  const coords = parseCoordinates(location);
  if (coords) return coords; // the local API derives the timezone from coordinates
  const key = String(location).trim().toLowerCase();
  if (placeCache.has(key)) return placeCache.get(key);
  const res = await postLocalRetry("kundli/basic", {
    name: "Place",
    date_of_birth: isoDate,
    birth_time: "12:00:00",
    birth_place: location,
    gender: "male",
  });
  const b = res.data.data.basic_details;
  const place = { latitude: b.latitude, longitude: b.longitude, timezone: b.timezone };
  if (placeCache.size > 500) placeCache.clear();
  placeCache.set(key, place);
  return place;
};

// Run fn over items, at most `limit` at a time, keeping the order.
const mapLimit = async (items, limit, fn) => {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
};

// A month's panchang for a place, shared by all users for 12 hours (good/bad
// days and monthly choghadiya both use it; each month costs ~31 requests).
const MONTH_TTL_MS = 12 * 60 * 60 * 1000;
const monthCache = new Map(); // key -> { at, promise }

// Local panchang for every day of a month: [{ date: "DD-MM-YYYY", p }]
const monthPanchang = async (location, monthValue) => {
  const { year, month } = parseMonth(monthValue);
  const days = new Date(year, month, 0).getDate();
  const iso = (d) => `${year}-${pad2(month)}-${pad2(d)}`;
  const place = await resolvePlace(location, iso(1));
  const key = `${Number(place.latitude).toFixed(3)},${Number(place.longitude).toFixed(3)}|${year}-${month}`;

  const hit = monthCache.get(key);
  if (hit && Date.now() - hit.at < MONTH_TTL_MS) return hit.promise;

  const promise = (async () => {
    const list = Array.from({ length: days }, (_, i) => i + 1);
    const results = await mapLimit(list, 3, async (d) => {
      const res = await postLocalRetry("panchang/calculate", { date: iso(d), ...place });
      return { date: `${pad2(d)}-${pad2(month)}-${year}`, p: res.data.data };
    });
    return { year, month, results };
  })();
  if (monthCache.size > 200) monthCache.clear();
  monthCache.set(key, { at: Date.now(), promise });
  promise.catch(() => monthCache.delete(key)); // don't keep failures
  return promise;
};

// Rikta tithis (4th, 9th, 14th) and Amavasya are the classical inauspicious days.
const RIKTA_TITHIS = ["chaturthi", "navami", "chaturdashi"];
const dayQuality = (p) => {
  const tithi = String(p.panchang_details?.tithi || "");
  const t = tithi.toLowerCase();
  if (/amavas/.test(t)) return { status: "Bad", reason: `Amavasya (${tithi})` };
  const rikta = RIKTA_TITHIS.find((r) => t.includes(r));
  if (rikta) return { status: "Bad", reason: `Rikta tithi (${tithi})` };
  return { status: "Good", reason: `${tithi} is not a Rikta tithi or Amavasya` };
};

const goodBadDays = async (location, monthValue) => {
  const { year, month, results } = await monthPanchang(location, monthValue);
  const days = results.map(({ date, p }) => ({
    date,
    dayOfWeek: p.weekday,
    tithi: p.panchang_details?.tithi,
    paksha: p.panchang_details?.paksha,
    nakshatra: String(p.panchang_details?.nakshatra || "").replace(/\s*\(\d+\)$/, ""),
    ...dayQuality(p),
  }));
  return {
    success: true,
    data: {
      location,
      month: `${year}-${pad2(month)}`,
      goodDays: days.filter((d) => d.status === "Good").map((d) => d.date),
      badDays: days.filter((d) => d.status === "Bad").map((d) => d.date),
      days,
    },
  };
};

const monthlyChoghadiya = async (location, monthValue) => {
  const { year, month, results } = await monthPanchang(location, monthValue);
  return {
    success: true,
    data: {
      location,
      month: `${year}-${pad2(month)}`,
      days: results.map(({ date, p }) => ({
        date,
        ...toChoghadiyaResponse(p, date).data.choghadiyaMuhurat,
      })),
    },
  };
};

// ───────────────────── Dosha (local) ─────────────────────

// One person's doshas, from the local matching engine (person checked against itself).
const doshaReport = async ({ dob, tob, tz, birthPlace }) => {
  const person = toPerson({ name: "User", dob, tob, tz, birthPlace });
  const basicRes = await postLocal("kundli/basic", { ...person, gender: "male" });
  const located = withCoordinates(person, basicRes);
  const matchRes = await postLocal("matching/calculate", { boy: located, girl: located });
  const match = matchRes.data.data;
  const tab = toDoshaTab(match);
  const present = (title) =>
    String(match.dosha_cards?.find((c) => c.title === title)?.boy).toLowerCase() === "yes";
  return {
    success: true,
    data: {
      manglik: tab.Manglik,
      kalsarpa: tab.Kalsarpa,
      doshas: (match.dosha_cards || []).map((c) => ({
        title: c.title,
        present: present(c.title),
      })),
    },
  };
};

// ───────────────────── Transit planets (local) ─────────────────────

// Transit positions at a date/time/place, with each planet's house counted
// from the natal Ascendant and natal Moon (whole-sign, sidereal).
const transitPlanets = async ({
  dob, tob, tz, birthPlace, transit_date, transit_time, transit_tz, transitPlace,
}) => {
  const natalPerson = toPerson({ name: "User", dob, tob, tz, birthPlace });
  const basicRes = await postLocal("kundli/basic", { ...natalPerson, gender: "male" });
  const natalLocated = withCoordinates(natalPerson, basicRes);
  const samePlace =
    !transitPlace ||
    String(transitPlace).trim().toLowerCase() === String(birthPlace).trim().toLowerCase();
  const transitPerson = toPerson({
    name: "Transit",
    dob: transit_date || dob,
    tob: transit_time || "00:00",
    tz: transit_tz ?? tz,
    birthPlace: transitPlace || birthPlace,
  });
  const [natalRes, transitRes] = await Promise.all([
    postLocal("kundli/chart", natalLocated),
    postLocal(
      "kundli/chart",
      samePlace
        ? {
            ...transitPerson,
            latitude: natalLocated.latitude,
            longitude: natalLocated.longitude,
            timezone: natalLocated.timezone,
          }
        : transitPerson,
    ),
  ]);
  const natal = natalRes.data.data.d1_lagna_chart;
  const transit = transitRes.data.data.d1_lagna_chart;
  const ascSign = SIGN_NAMES.indexOf(natal?.ascendant?.sign) + 1;
  const moonSign = SIGN_NAMES.indexOf(findPlanet(natal, "Moon")?.sign_name) + 1;
  const houseFrom = (from, sign) => (from > 0 ? ((sign - from + 12) % 12) + 1 : undefined);
  const natalSignOf = (name) => findPlanet(natal, name)?.sign_name;

  const planets = (transit?.houses || []).flatMap((h) =>
    (h.planets || [])
      .filter((p) => !p.is_ascendant && p.name !== "Ascendant" && !OUTER.includes(p.name))
      .map((p) => ({
        planet: p.name,
        sign: h.sign_name,
        signNumber: h.sign_number,
        degree: p.dms?.formatted,
        nakshatra: p.nakshatra,
        retro: !!p.is_retrograde,
        natalSign: natalSignOf(p.name),
        houseFromAscendant: houseFrom(ascSign, h.sign_number),
        houseFromMoon: houseFrom(moonSign, h.sign_number),
      })),
  );
  return {
    success: true,
    data: {
      birth: { dob, tob, place: birthPlace },
      transit: {
        date: transit_date || dob,
        time: transit_time || "00:00",
        place: transitPlace || birthPlace,
      },
      natalAscendant: natal?.ascendant?.sign,
      natalMoonSign: SIGN_NAMES[moonSign - 1],
      planets,
    },
  };
};

// ───────────────────── Horoscope (local) ─────────────────────

// Day boundaries and "today" follow Indian time, as the app's other requests do.
const calculateHoroscope = async ({ zodiac, type, date, week, year }) => {
  const res = await postLocal("horoscope/calculate", {
    zodiac,
    type,
    timezone: "Asia/Kolkata",
    ...(date && { date }),
    ...(week && { week }),
    ...(year && { year }),
  });
  const body = res.data;
  const preds = body?.data?.Predictions;
  if (preds && typeof preds === "object") {
    body.data.Predictions =
      type === "yearly"
        ? Object.fromEntries(
            Object.entries(preds).map(([quarter, v]) => [
              quarter,
              v && typeof v === "object" ? renameSections(v, type) : v,
            ]),
          )
        : renameSections(preds, type);
  }
  return { data: body };
};

// Section names the mobile app's horoscope screen looks for. The website shows
// whatever names it receives, so it works with these as well.
const renameSections = (sections, type) =>
  Object.fromEntries(
    Object.entries(sections).map(([k, v]) => {
      if (k === "Finance") return ["Finances", v];
      if (k === "Love") return ["Relationship", v];
      if (k === "Overview" && type === "daily") return ["Daily Overview", v];
      return [k, v];
    }),
  );

// Every entry calls the local Astroveduvani_api (Python). Location search is
// done with Google Places in kundliService / userAstrologyService.
const API = {
  // Local API. Returns an axios-style { data } in NextAstroAPI's gun-milan shape.
  MATCH_MAKING: async ({
    boy_name,
    girl_name,

    boy_dob,
    boy_tob,
    boy_tz,
    boy_birthPlace,

    girl_dob,
    girl_tob,
    girl_tz,
    girl_birthPlace,
  }) => {
    const res = await postLocal("matching/calculate", {
      boy: toPerson({
        name: boy_name,
        dob: boy_dob,
        tob: boy_tob,
        tz: boy_tz,
        birthPlace: boy_birthPlace,
      }),
      girl: toPerson({
        name: girl_name,
        dob: girl_dob,
        tob: girl_tob,
        tz: girl_tz,
        birthPlace: girl_birthPlace,
      }),
    });
    return { data: toMatchMakingResponse(res.data) };
  },

  // Local API. axios-style { data } in the panchang page's shape.
  PANCHANG: async ({ date, location }) => ({
    data: toPanchangResponse(await calculatePanchang({ date, location })),
  }),

  // Local API: transit (gochara) horoscopes. axios-style { data } with
  // { success, data: { "Lucky Color", "Lucky Color Code", "Lucky Number", Predictions } }.
  DAILY_HOROSCOPE: ({ zodiac, date }) =>
    calculateHoroscope({ zodiac, type: "daily", date }),

  WEEKLY_HOROSCOPE: ({ zodiac, week = "this" }) =>
    calculateHoroscope({ zodiac, type: "weekly", week }),

  MONTHLY_HOROSCOPE: ({ zodiac }) =>
    calculateHoroscope({ zodiac, type: "monthly" }),

  YEARLY_HOROSCOPE: ({ zodiac, year = new Date().getFullYear() }) =>
    calculateHoroscope({ zodiac, type: "yearly", year: Number(year) }),

  // Local API: the daily transit horoscope. zodiac is a sign number (1-12) or name.
  BIG_DAILY_HOROSCOPE: ({ zodiac, date }) =>
    calculateHoroscope({
      zodiac: /^\d+$/.test(String(zodiac))
        ? SIGN_NAMES[Number(zodiac) - 1]?.toLowerCase()
        : String(zodiac).toLowerCase(),
      type: "daily",
      date,
    }),

  // Local API: every day of the month rated Good/Bad from its tithi.
  // month: "2026-03", "March", ...; location: a place name or "lat,lon".
  GOOD_BAD_DAYS: async (location, month) => ({
    data: await goodBadDays(location, month),
  }),
  // ── Local API kundli sections. Each returns an axios-style { data } with
  // { success, data }, built by the same mappers as the full kundli.
  KUNDLI: async (params) => ({ data: await kundliBasic(params) }),

  KUNDLI_DETAILS: async (params) => {
    const res = await postLocal("kundli/chart", toPerson(params));
    const charts = res.data.data;
    const d1 = toVedicChart(charts.d1_lagna_chart);
    const d9 = toVedicChart(charts.d9_navamsa_chart);
    const numerology = toNumerology(charts.numerology);
    return {
      data: {
        success: true,
        data: {
          d1,
          d9,
          // Field names the mobile app's Kundli tab reads.
          charts: {
            lagna_north: d1.charts.north,
            lagna_south: d1.charts.south,
            navamsa_north: d9.charts.north,
            navamsa_south: d9.charts.south,
          },
          numerologyTable: numerology?.numerologyTable,
          numero_full_report: numerology
            ? Object.fromEntries(
                Object.entries(numerology.numeroReport).filter(
                  ([, v]) => v && typeof v === "object",
                ),
              )
            : undefined,
        },
      },
    };
  },

  KP_DETAILS: async ({ style = "north", ...params }) => {
    const res = await postLocal("kp/chart", toPerson(params));
    return {
      data: { success: true, data: toKpSystem(res.data.data, style === "south" ? "south" : "north") },
    };
  },

  ASHTAKVARGA_CHARTS: async (params) => {
    const res = await postLocal("ashtakavarga/chart", toPerson(params));
    return { data: { success: true, data: toAshtakavarga(res.data.data) } };
  },

  CHARTS: async ({ div = "D1", style = "north", ...params }) => {
    const res = await postLocal("charts/chart", toPerson(params));
    const charts = res.data.data.charts;
    const chartStyle = style === "south" ? "south" : "north";
    const code = String(div).toUpperCase();
    return {
      data: {
        success: true,
        data: {
          div: code,
          style: chartStyle,
          chart: charts?.[code] ? chartSvgs(charts[code])[chartStyle] : null,
          // Keyed by chart code (D1, D9, CHALIT, ...), as the mobile apps' Charts
          // tab names them. Only the apps call this endpoint; the website's full
          // kundli uses toDivisionalCharts.
          charts: Object.fromEntries(
            Object.entries(charts || {})
              .map(([c, chart]) => [c, chartSvgs(chart)[chartStyle]])
              .filter(([, svg]) => svg),
          ),
        },
      },
    };
  },

  DASHA: async (params) => {
    const res = await postLocal("dasha/chart", toPerson(params));
    return { data: { success: true, data: toDasha(res.data.data) } };
  },

  // Local API. Returns an axios-style { data } in NextAstroAPI's free-report shape.
  ASCENDANT_REPORT: async (params) => ({ data: await freeReport(params) }),

  // Local API: choghadiya for every day of the month.
  MONTHLY_CHOGHADIYA: async ({ location, month }) => ({
    data: await monthlyChoghadiya(location, month),
  }),

  // Local API (same calculation as PANCHANG). axios-style { data }.
  CHOGHADIYA: async ({ location, date }) => ({
    data: toChoghadiyaResponse(await calculatePanchang({ date, location }), date),
  }),

  // Local API. Returns an axios-style { data } in NextAstroAPI's kundali/full shape.
  FULL_KUNDLI: async (params) => ({ data: await fullKundli(params) }),

  // Local API: one person's doshas (Manglik, Kaal Sarp, Pitra, ...).
  DOSHA: async ({ dob, tob, birthPlace, tz }) => ({
    data: await doshaReport({ dob, tob, tz, birthPlace }),
  }),

  // Local API: transit positions with houses from the natal Ascendant and Moon.
  // (Whole-sign sidereal houses; house_type / zodiac_type are not used.)
  TRANSIT_PLANETS: async (params) => ({ data: await transitPlanets(params) }),

  // Local API: a three-card draw that the user reveals card by card.
  // Returns an axios-style { data } with { cards: [...] }.
  TAROT_SESSION: async (baseUrl) => {
    const res = await drawTarot("three_card", baseUrl);
    return { data: { cards: res.data.data.spread } };
  },

  // Finds a card in a session's cards (by id or name). Returns the card or undefined.
  TAROT_REVEAL: ({ cardName, cards = [] }) => {
    const key = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    return cards.find((c) => key(c.id) === key(cardName) || key(c.name) === key(cardName));
  },

  // Local API. Return an axios-style { data } in NextAstroAPI's quick tarot shape.
  TAROT_ONE_CARD: (baseUrl) => drawTarot("one_card", baseUrl),
  TAROT_THREE_CARD: (baseUrl) => drawTarot("three_card", baseUrl),
  // Local API. Returns an axios-style { data } in NextAstroAPI's numero/full shape.
  FULL_NUMEROLOGY: async (params) => ({ data: await fullNumerology(params) }),

  // Local API. Returns an axios-style { data } in NextAstroAPI's lal-kitab shape.
  LAAL_KITAAB: async ({ name, dob, tob, birthPlace, tz }) => {
    const res = await postLocal(
      "lal-kitab/calculate",
      toPerson({ name, dob, tob, tz, birthPlace }),
    );
    return { data: toLalKitabResponse(res.data) };
  },
};
export default API;
