const BASE_URL = "https://api.nextastroapi.com/api/";

const API = {
  LOCATION_SUGGESTIONS: (input) =>
    `${BASE_URL}location/suggestions?input=${encodeURIComponent(input)}`,

  LOCATION_BY_NAME: (query) =>
    `${BASE_URL}location/allsuggestions?input=${encodeURIComponent(query)}`,

  LOCATION_BY_COORDINATES: (lat, lon) =>
    `${BASE_URL}location/search-coordinates?lat=${encodeURIComponent(
      lat,
    )}&lon=${encodeURIComponent(lon)}`,

  MATCH_MAKING: ({
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

    lang = "en",
  }) =>
    `${BASE_URL}v1/match/gun-milan?` +
    `boy_name=${encodeURIComponent(boy_name)}` +
    `&boy_dob=${encodeURIComponent(boy_dob)}` +
    `&boy_tob=${encodeURIComponent(boy_tob)}` +
    `&boy_tz=${encodeURIComponent(boy_tz)}` +
    `&boy_birthPlace=${encodeURIComponent(boy_birthPlace)}` +
    `&girl_name=${encodeURIComponent(girl_name)}` +
    `&girl_dob=${encodeURIComponent(girl_dob)}` +
    `&girl_tob=${encodeURIComponent(girl_tob)}` +
    `&girl_tz=${encodeURIComponent(girl_tz)}` +
    `&girl_birthPlace=${encodeURIComponent(girl_birthPlace)}` +
    `&lang=${encodeURIComponent(lang)}`,

  PANCHANG: ({ date, location, tz, lang = "en" }) =>
    `${BASE_URL}v1/panchang/daily?date=${encodeURIComponent(
      date,
    )}&location=${encodeURIComponent(location)}&tz=${encodeURIComponent(
      tz,
    )}&lang=${encodeURIComponent(lang)}`,

  DAILY_HOROSCOPE: ({ zodiac, date, lang = "en" }) =>
    `${BASE_URL}v1/horo?type=daily&zodiac=${encodeURIComponent(
      zodiac,
    )}&date=${encodeURIComponent(date)}&lang=${encodeURIComponent(lang)}`,

  WEEKLY_HOROSCOPE: ({ zodiac, week = "next", lang = "en" }) =>
    `${BASE_URL}v1/horo?type=weekly&zodiac=${encodeURIComponent(
      zodiac,
    )}&week=${encodeURIComponent(week)}&lang=${encodeURIComponent(lang)}`,

  MONTHLY_HOROSCOPE: ({ zodiac, lang = "en" }) =>
    `${BASE_URL}v1/horo?type=monthly&zodiac=${encodeURIComponent(
      zodiac,
    )}&lang=${encodeURIComponent(lang)}`,

  YEARLY_HOROSCOPE: ({
    zodiac,
    year = new Date().getFullYear(),
    lang = "en",
  }) =>
    `${BASE_URL}v1/horo?type=yearly&zodiac=${encodeURIComponent(
      zodiac,
    )}&year=${encodeURIComponent(year)}&lang=${encodeURIComponent(lang)}`,

  BIG_DAILY_HOROSCOPE: ({ zodiac, date, lang = "en", type = "big" }) =>
    `${BASE_URL}/api/daily-horoscope?zodiac=${encodeURIComponent(
      zodiac,
    )}&date=${encodeURIComponent(date)}&lang=${encodeURIComponent(
      lang,
    )}&type=${encodeURIComponent(type)}`,

  GOOD_BAD_DAYS: (location, month) =>
    `${BASE_URL}v1/panchang/choghadiya/monthly?location=${encodeURIComponent(location)}&month=${encodeURIComponent(month)}`,
  KUNDLI: ({
    dob, // DD-MM-YYYY
    tob, // HH:mm
    tz,
    lang = "en",
    name,
    birthPlace,
  }) =>
    `${BASE_URL}v1/kundali/basic-details` +
    `?dob=${encodeURIComponent(dob)}` +
    `&tob=${encodeURIComponent(tob)}` +
    `&tz=${encodeURIComponent(tz)}` +
    `&lang=${encodeURIComponent(lang)}` +
    `&name=${encodeURIComponent(name)}` +
    `&birthPlace=${encodeURIComponent(birthPlace)}`,

  KUNDLI_DETAILS: ({
    dob, // "15-07-2001"
    tob, // "23:40"
    tz,
    lang = "en",
    name,
    birthPlace,
  }) =>
    `${BASE_URL}v1/kundali/d1-chart` +
    `?dob=${encodeURIComponent(dob)}` +
    `&tob=${encodeURIComponent(tob)}` +
    `&tz=${encodeURIComponent(tz)}` +
    `&lang=${encodeURIComponent(lang)}` +
    `&name=${encodeURIComponent(name)}` +
    `&birthPlace=${encodeURIComponent(birthPlace)}`,

  KP_DETAILS: ({ dob, tob, tz, birthPlace }) =>
    `${BASE_URL}v1/kundali/kp?dob=${encodeURIComponent(
      dob,
    )}&tob=${encodeURIComponent(tob)}&tz=${encodeURIComponent(
      tz,
    )}&birthPlace=${encodeURIComponent(birthPlace)}`,

  ASHTAKVARGA_CHARTS: ({
    dob,
    tob,
    birthPlace,
    tz,
    style = "north",
    lang = "en",
  }) =>
    `${BASE_URL}v1/kundali/ashtakavarga?dob=${encodeURIComponent(
      dob,
    )}&tob=${encodeURIComponent(tob)}&birthPlace=${encodeURIComponent(
      birthPlace,
    )}&tz=${encodeURIComponent(tz)}&style=${encodeURIComponent(style)}&lang=${encodeURIComponent(lang)}`,

  CHARTS: ({ dob, tob, tz, lang = "en", birthPlace, div, style = "north" }) =>
    `${BASE_URL}v1/kundali/all-charts?dob=${encodeURIComponent(
      dob,
    )}&tob=${encodeURIComponent(tob)}&tz=${encodeURIComponent(
      tz,
    )}&lang=${encodeURIComponent(lang)}&birthPlace=${encodeURIComponent(
      birthPlace,
    )}&div=${encodeURIComponent(div)}&style=${encodeURIComponent(style)}`,

  DASHA: ({ dob, tob, tz, lang = "en", name, birthPlace }) =>
    `${BASE_URL}v1/kundali/dashas` +
    `?dob=${encodeURIComponent(dob)}` +
    `&tob=${encodeURIComponent(tob)}` +
    `&tz=${encodeURIComponent(tz)}` +
    `&lang=${encodeURIComponent(lang)}` +
    `&name=${encodeURIComponent(name)}` +
    `&birthPlace=${encodeURIComponent(birthPlace)}`,

  ASCENDANT_REPORT: ({ dob, tob, birthPlace, tz, name }) =>
    `${BASE_URL}v1/kundali/free-report` +
    `?dob=${encodeURIComponent(dob)}` +
    `&tob=${encodeURIComponent(tob)}` +
    `&birthPlace=${encodeURIComponent(birthPlace)}` +
    `&tz=${encodeURIComponent(tz)}` +
    `&name=${encodeURIComponent(name)}`,

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

  CHOGHADIYA: ({ location, date, lang = "en" }) =>
    `${BASE_URL}v1/panchang/choghadiya?location=${encodeURIComponent(
      location,
    )}&date=${encodeURIComponent(date)}&lang=${encodeURIComponent(lang)}`,

  FULL_KUNDLI: ({
    dob, // "20-07-1973"
    tob, // "23:40"
    tz,
    lang = "en",
    name,
    birthPlace,
    div,
    style,
  }) =>
    `${BASE_URL}v1/kundali/full` +
    `?dob=${encodeURIComponent(dob)}` +
    `&tob=${encodeURIComponent(tob)}` +
    `&tz=${encodeURIComponent(tz)}` +
    `&lang=${encodeURIComponent(lang)}` +
    `&name=${encodeURIComponent(name)}` +
    `&birthPlace=${encodeURIComponent(birthPlace)}` +
    `&div=${encodeURIComponent(div)}` +
    `&style=${encodeURIComponent(style)}`,

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

  TAROT_ONE_CARD: () => `${BASE_URL}v1/tarot/quick/one-card`,
  TAROT_THREE_CARD: () => `${BASE_URL}v1/tarot/quick/three-card`,
  FULL_NUMEROLOGY: ({ name, dob, tob, tz, birthplace, lang = "en" }) =>
    `${BASE_URL}v1/numero/full` +
    `?name=${encodeURIComponent(name)}` +
    `&dob=${encodeURIComponent(dob)}` +
    `&tob=${encodeURIComponent(tob)}` +
    `&tz=${encodeURIComponent(tz)}` +
    `&birthPlace=${encodeURIComponent(birthplace)}` +
    `&lang=${encodeURIComponent(lang)}`,

  LAAL_KITAAB: ({ name, dob, tob, birthPlace, tz, lang = "en" }) =>
    `${BASE_URL}v1/kundali/lal-kitab` +
    `?name=${encodeURIComponent(name)}` +
    `&dob=${encodeURIComponent(dob)}` +
    `&tob=${encodeURIComponent(tob)}` +
    `&birthPlace=${encodeURIComponent(birthPlace)}` +
    `&tz=${encodeURIComponent(tz)}` +
    `&lang=${encodeURIComponent(lang)}`,
};
export default API;
