import axios from "axios";

const BASE_URL = "https://api.nextastroapi.com/api/";

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

const postLocal = async (path, body) => {
  try {
    return await axios.post(`${LOCAL_BASE_URL}${path}`, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    });
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

  return {
    success: true,
    data: {
      score,
      full_score: fullScore || 36,
      percentage: d.compatibility_score,
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
  for (const p of traditional) {
    if (p.name === "Ascendant") continue;
    (planetsByHouse[p.house] ||= []).push(p.name);
  }

  const houses = {};
  for (const h of d.house_details) {
    houses[h.house] = {
      sign: h.house,
      // The house cards read p.planet, so each entry is { planet: "Sun" }.
      planets: (planetsByHouse[h.house] || []).map((planet) => ({ planet })),
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
      year: `${startYear}-${startYear + 1}`,
      houseSummary: Object.fromEntries(
        houses.map((h) => [h.house, { planets: h.planets, planetCount: h.planet_count }]),
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
      number: card.number,
      meaning: card.trait,
      description: card.description,
    };
    numeroReport[`${key}Number`] = card.number;
  }
  return { numeroReport, numerologyTable: n.details_table };
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
  const kpPlanets = [
    {
      planet_id: 99,
      planet_name: "Ascendant",
      sign: String(asc.sign),
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
          formatted_degree: d.dms?.formatted,
          nakshatra: d.nakshatra,
          nakshatra_lord: p.nakshatra_lord,
          sub_lord: d.sub_lord,
          house: p.house,
          is_retro: !!d.is_retrograde,
        };
      }),
  ];
  return {
    chalitChart: chartSvgs(chalit)[style],
    kpPlanets,
    houses: (kp.kp_house_cusps || []).map((h) => ({
      house_id: h.house,
      sign: String(h.sign),
      formatted_degree: h.dms?.formatted,
      nakshatra: h.nakshatra,
      nakshatra_lord: h.nakshatra_lord,
      sub_lord: h.sub_lord,
    })),
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
  const panchangAvakhada = toPanchangAvakhada(basicRes.data.data, d1, { dob, tob });
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
  const chartRes = await postLocal("kundli/chart", withCoordinates(person, basicRes));

  const basic = basicRes.data.data;
  const d1 = chartRes.data.data.d1_lagna_chart;
  const a = basic.avakhada_details;
  const moon = findPlanet(d1, "Moon");
  const sunSign = findPlanet(d1, "Sun")?.sign_name;
  const ascendantSign = d1?.ascendant?.sign;
  const base = toPanchangAvakhada(basic, d1, { dob, tob });

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

// Letter -> value grid for the name, as an SVG image (the page shows it as an <img>).
const nameMappingSvg = (mapping) => {
  if (!mapping?.length) return undefined;
  const cell = 44;
  const width = mapping.length * cell + 2;
  const cells = mapping
    .map(({ letter, value }, i) => {
      const x = 1 + i * cell;
      return (
        `<rect x="${x}" y="1" width="${cell}" height="${cell * 2}" fill="#fff" stroke="#1c3a70"/>` +
        `<line x1="${x}" y1="${cell + 1}" x2="${x + cell}" y2="${cell + 1}" stroke="#1c3a70"/>` +
        `<text x="${x + cell / 2}" y="${cell / 2 + 7}" font-size="20" font-weight="700" fill="#1c3a70" text-anchor="middle">${letter}</text>` +
        `<text x="${x + cell / 2}" y="${cell * 1.5 + 7}" font-size="18" fill="#c0392b" text-anchor="middle">${value}</text>`
      );
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${cell * 2 + 2}" width="${width}" height="${cell * 2 + 2}" font-family="Arial, sans-serif">${cells}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

// "Destiny Number" -> "destiny", "Soul Urge Number" -> "soul_urge"
const reportKey = (title) =>
  String(title).toLowerCase().replace(/\s*number\s*$/, "").trim().replace(/\s+/g, "_");

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
      nameMappingImage: nameMappingSvg(numero.name_mapping),
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
  return { data: res.data };
};

const API = {
  LOCATION_SUGGESTIONS: (input) =>
    `${BASE_URL}location/suggestions?input=${encodeURIComponent(input)}`,

  LOCATION_BY_NAME: (query) =>
    `${BASE_URL}location/allsuggestions?input=${encodeURIComponent(query)}`,

  LOCATION_BY_COORDINATES: (lat, lon) =>
    `${BASE_URL}location/search-coordinates?lat=${encodeURIComponent(
      lat,
    )}&lon=${encodeURIComponent(lon)}`,

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

  BIG_DAILY_HOROSCOPE: ({ zodiac, date, lang = "en", type = "big" }) =>
    `${BASE_URL}/api/daily-horoscope?zodiac=${encodeURIComponent(
      zodiac,
    )}&date=${encodeURIComponent(date)}&lang=${encodeURIComponent(
      lang,
    )}&type=${encodeURIComponent(type)}`,

  GOOD_BAD_DAYS: (location, month) =>
    `${BASE_URL}v1/panchang/choghadiya/monthly?location=${encodeURIComponent(location)}&month=${encodeURIComponent(month)}`,
  // ── Local API kundli sections. Each returns an axios-style { data } with
  // { success, data }, built by the same mappers as the full kundli.
  KUNDLI: async (params) => ({ data: await kundliBasic(params) }),

  KUNDLI_DETAILS: async (params) => {
    const res = await postLocal("kundli/chart", toPerson(params));
    const charts = res.data.data;
    return {
      data: {
        success: true,
        data: {
          d1: toVedicChart(charts.d1_lagna_chart),
          d9: toVedicChart(charts.d9_navamsa_chart),
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
          charts: toDivisionalCharts(charts, chartStyle),
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

  MONTHLY_CHOGHADIYA: ({ location, month }) =>
    `${BASE_URL}/api/monthly-choghadiya?location=${encodeURIComponent(
      location,
    )}&month=${encodeURIComponent(month)}`,

  FULL_NUMEROLOGY: ({ name, dob, tob, tz, birthplace }) =>
    `${BASE_URL}/api/full-numerology?name=${encodeURIComponent(
      name,
    )}&dob=${encodeURIComponent(dob)}&tob=${encodeURIComponent(
      tob,
    )}&tz=${encodeURIComponent(tz)}&birthplace=${encodeURIComponent(
      birthplace,
    )}`,

  // Local API (same calculation as PANCHANG). axios-style { data }.
  CHOGHADIYA: async ({ location, date }) => ({
    data: toChoghadiyaResponse(await calculatePanchang({ date, location }), date),
  }),

  // Local API. Returns an axios-style { data } in NextAstroAPI's kundali/full shape.
  FULL_KUNDLI: async (params) => ({ data: await fullKundli(params) }),

  DOSHA: ({ dob, tob, birthPlace, tz, lang = "en" }) =>
    `${BASE_URL}/api/dosha?dob=${encodeURIComponent(
      dob,
    )}&tob=${encodeURIComponent(tob)}&birthPlace=${encodeURIComponent(
      birthPlace,
    )}&tz=${encodeURIComponent(tz)}&lang=${encodeURIComponent(lang)}`,

  TRANSIT_PLANETS: ({
    dob,
    tob,
    tz,
    transit_date,
    transit_time,
    transit_tz,
    house_type,
    zodiac_type,
    lang = "en",
    direction,
    birthPlace,
    transitPlace,
  }) =>
    `${BASE_URL}/api/transit-planets?dob=${encodeURIComponent(
      dob,
    )}&tob=${encodeURIComponent(tob)}&tz=${encodeURIComponent(
      tz,
    )}&transit_date=${encodeURIComponent(
      transit_date,
    )}&transit_time=${encodeURIComponent(
      transit_time,
    )}&transit_tz=${encodeURIComponent(
      transit_tz,
    )}&house_type=${encodeURIComponent(
      house_type,
    )}&zodiac_type=${encodeURIComponent(zodiac_type)}&lang=${encodeURIComponent(
      lang,
    )}&direction=${encodeURIComponent(
      direction,
    )}&birthPlace=${encodeURIComponent(
      birthPlace,
    )}&transitPlace=${encodeURIComponent(transitPlace)}`,
  TAROT_SESSION: () => `${BASE_URL}v1/tarot/session`,

  TAROT_REVEAL: ({ cardName, direction = "upright", lang = "en" }) =>
    `${BASE_URL}v1/tarot/reveal` +
    `?cardName=${encodeURIComponent(cardName)}` +
    `&direction=${encodeURIComponent(direction)}` +
    `&lang=${encodeURIComponent(lang)}`,

  // Local API. Return an axios-style { data } in NextAstroAPI's quick tarot shape.
  TAROT_ONE_CARD: (baseUrl) => drawTarot("one_card", baseUrl),
  TAROT_THREE_CARD: (baseUrl) => drawTarot("three_card", baseUrl),
  // Local API. Returns an axios-style { data } in NextAstroAPI's numero/full shape.
  // (This later key overrides the older FULL_NUMEROLOGY entry above.)
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
