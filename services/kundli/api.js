const BASE_URL = "https://kundali.astrovedvanni.com";
const API = {
  LOCATION_SUGGESTIONS: (input) =>
    `${BASE_URL}/location/suggestions?input=${encodeURIComponent(input)}`,

  LOCATION_BY_NAME: (query) =>
    `${BASE_URL}/location/search-location?query=${encodeURIComponent(query)}`,

  LOCATION_BY_COORDINATES: (lat, lon) =>
    `${BASE_URL}/location/search-coordinates?lat=${encodeURIComponent(
      lat,
    )}&lon=${encodeURIComponent(lon)}`,

  MATCH_MAKING: ({
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
    `${BASE_URL}/api/match-making?boy_dob=${encodeURIComponent(
      boy_dob,
    )}&boy_tob=${encodeURIComponent(boy_tob)}&boy_tz=${encodeURIComponent(
      boy_tz,
    )}&boy_birthPlace=${encodeURIComponent(
      boy_birthPlace,
    )}&girl_dob=${encodeURIComponent(girl_dob)}&girl_tob=${encodeURIComponent(
      girl_tob,
    )}&girl_tz=${encodeURIComponent(
      girl_tz,
    )}&girl_birthPlace=${encodeURIComponent(
      girl_birthPlace,
    )}&lang=${encodeURIComponent(lang)}`,
  PANCHANG: ({ date, location, tz }) =>
    `${BASE_URL}/api/panchang?date=${encodeURIComponent(
      date,
    )}&location=${encodeURIComponent(location)}&tz=${encodeURIComponent(tz)}`,

  DAILY_HOROSCOPE: ({ zodiac, date, lang = "en" }) =>
    `${BASE_URL}/api/horoscope?type=daily&zodiac=${encodeURIComponent(
      zodiac,
    )}&date=${encodeURIComponent(date)}&lang=${encodeURIComponent(lang)}`,

  WEEKLY_HOROSCOPE: ({ zodiac, week = "next", lang = "en" }) =>
    `${BASE_URL}/api/horoscope?type=weekly&zodiac=${encodeURIComponent(
      zodiac,
    )}&week=${encodeURIComponent(week)}&lang=${encodeURIComponent(lang)}`,

  MONTHLY_HOROSCOPE: ({ zodiac, lang = "en" }) =>
    `${BASE_URL}/api/horoscope?type=monthly&zodiac=${encodeURIComponent(
      zodiac,
    )}&lang=${encodeURIComponent(lang)}`,

  YEARLY_HOROSCOPE: ({
    zodiac,
    year = new Date().getFullYear(),
    lang = "en",
  }) =>
    `${BASE_URL}/api/horoscope?type=yearly&zodiac=${encodeURIComponent(
      zodiac,
    )}&year=${encodeURIComponent(year)}&lang=${encodeURIComponent(lang)}`,

  BIG_DAILY_HOROSCOPE: ({ zodiac, date, lang = "en", type = "big" }) =>
    `${BASE_URL}/api/daily-horoscope?zodiac=${encodeURIComponent(
      zodiac,
    )}&date=${encodeURIComponent(date)}&lang=${encodeURIComponent(
      lang,
    )}&type=${encodeURIComponent(type)}`,

  GOOD_BAD_DAYS: (zodiac) =>
    `${BASE_URL}/api/goodbaddays?zodiac=${encodeURIComponent(zodiac)}`,

  KUNDLI: ({
    day,
    month,
    year,
    hour,
    min,
    tz,
    lang = "en",
    name,
    birthPlace,
  }) =>
    `${BASE_URL}/api/kundli?day=${encodeURIComponent(
      day,
    )}&month=${encodeURIComponent(month)}&year=${encodeURIComponent(
      year,
    )}&hour=${encodeURIComponent(hour)}&min=${encodeURIComponent(
      min,
    )}&tz=${encodeURIComponent(tz)}&lang=${encodeURIComponent(
      lang,
    )}&name=${encodeURIComponent(name)}&birthPlace=${encodeURIComponent(
      birthPlace,
    )}`,

  KUNDLI_DETAILS: ({
    day,
    month,
    year,
    hour,
    min,
    tz,
    lang = "en",
    name,
    birthPlace,
  }) =>
    `${BASE_URL}/api/kundli/details?day=${encodeURIComponent(
      day,
    )}&month=${encodeURIComponent(month)}&year=${encodeURIComponent(
      year,
    )}&hour=${encodeURIComponent(hour)}&min=${encodeURIComponent(
      min,
    )}&tz=${encodeURIComponent(tz)}&lang=${encodeURIComponent(
      lang,
    )}&name=${encodeURIComponent(name)}&birthPlace=${encodeURIComponent(
      birthPlace,
    )}`,

  KP_DETAILS: ({ dob, tob, tz, birthPlace }) =>
    `${BASE_URL}/api/kp-details?dob=${encodeURIComponent(
      dob,
    )}&tob=${encodeURIComponent(tob)}&tz=${encodeURIComponent(
      tz,
    )}&birthPlace=${encodeURIComponent(birthPlace)}`,

  ASHTAKVARGA_CHARTS: ({ dob, tob, birthPlace, tz, style = "north" }) =>
    `${BASE_URL}/api/ashtakvarga-charts?dob=${encodeURIComponent(
      dob,
    )}&tob=${encodeURIComponent(tob)}&birthPlace=${encodeURIComponent(
      birthPlace,
    )}&tz=${encodeURIComponent(tz)}&style=${encodeURIComponent(style)}`,

  CHARTS: ({ dob, tob, tz, lang = "en", birthPlace, div, style = "north" }) =>
    `${BASE_URL}/api/charts?dob=${encodeURIComponent(
      dob,
    )}&tob=${encodeURIComponent(tob)}&tz=${encodeURIComponent(
      tz,
    )}&lang=${encodeURIComponent(lang)}&birthPlace=${encodeURIComponent(
      birthPlace,
    )}&div=${encodeURIComponent(div)}&style=${encodeURIComponent(style)}`,

  DASHA: ({ day, month, year, hour, min, tz, lang = "en", name, location }) =>
    `${BASE_URL}/api/dasha?day=${encodeURIComponent(
      day,
    )}&month=${encodeURIComponent(month)}&year=${encodeURIComponent(
      year,
    )}&hour=${encodeURIComponent(hour)}&min=${encodeURIComponent(
      min,
    )}&tz=${encodeURIComponent(tz)}&lang=${encodeURIComponent(
      lang,
    )}&name=${encodeURIComponent(name)}&location=${encodeURIComponent(
      location,
    )}`,

  ASCENDANT_REPORT: ({ dob, tob, birthPlace, tz, lang = "en" }) =>
    `${BASE_URL}/api/ascendant-report?dob=${encodeURIComponent(
      dob,
    )}&tob=${encodeURIComponent(tob)}&birthPlace=${encodeURIComponent(
      birthPlace,
    )}&tz=${encodeURIComponent(tz)}&lang=${encodeURIComponent(lang)}`,

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

  CHOGHADIYA: ({ location, date }) =>
    `${BASE_URL}/api/choghadiya?location=${encodeURIComponent(
      location,
    )}&date=${encodeURIComponent(date)}`,
  FULL_KUNDLI: ({
    day,
    month,
    year,
    hour,
    min,
    tz,
    lang,
    name,
    birthPlace,
    div,
    style,
  }) =>
    `${BASE_URL}/api/full-kundli?day=${day}&month=${month}&year=${year}&hour=${hour}&min=${min}&tz=${tz}&lang=${lang}&name=${encodeURIComponent(
      name,
    )}&birthPlace=${encodeURIComponent(birthPlace)}&div=${div}&style=${style}`,

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
};
export default API;
