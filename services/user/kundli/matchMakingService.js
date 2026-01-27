const integrationService = require('../../admin/integrationService');
const apiService = require('../../../utils/api');

const getMatchMakingReport = async (filters) => {
  try {
    const integrations = await integrationService.getAllIntegrations({
      type: 4003,
      is_active: true
    });

    if (!integrations.length) {
      throw new Error('No active integration found for match making');
    }

    const integration = integrations[0];

    const apiParams = {
      boy_dob: filters.boy_dob,
      boy_tob: filters.boy_tob,
      boy_tz: filters.boy_tz,
      boy_lat: filters.boy_lat,
      boy_lon: filters.boy_lon,
      girl_dob: filters.girl_dob,
      girl_tob: filters.girl_tob,
      girl_tz: filters.girl_tz,
      girl_lat: filters.girl_lat,
      girl_lon: filters.girl_lon,
      lang: filters.lang || 'en'
    };

    const aggResult = await apiService.getMatchMakingReport(
      apiParams,
      integration.base_url,
      integration.api_key
    );

    const aggResponse = aggResult?.response || {};

    const ashtakootDetails = await apiService.getAshtakootWithAstroDetails(
      apiParams,
      integration.base_url,
      integration.api_key
    );
     const ashtakoot = ashtakootDetails?.response || {};

     const filteredAshtakoot = {
      tara: ashtakoot.tara,
      gana: ashtakoot.gana,
      yoni: ashtakoot.yoni,
      bhakoot: ashtakoot.bhakoot,
      grahamaitri: ashtakoot.grahamaitri,
      vasya: ashtakoot.vasya,
      nadi: ashtakoot.nadi,
      varna: ashtakoot.varna
    };

    const finalResponse = {
      score: aggResponse.score,
      guna: aggResponse.ashtakoot_score,
      mangaldosh: aggResponse.mangaldosh,
      mangaldosh_points: aggResponse.mangaldosh_points,
      pitradosh: aggResponse.pitradosh,
      pitradosh_points: aggResponse.pitradosh_points,
      kaalsarpdosh: aggResponse.kaalsarpdosh,
      kaalsarp_points: aggResponse.kaalsarp_points,
      manglikdosh_saturn: aggResponse.manglikdosh_saturn,
      manglikdosh_saturn_points: aggResponse.manglikdosh_saturn_points,
      manglikdosh_rahuketu: aggResponse.manglikdosh_rahuketu,
      manglikdosh_rahuketu_points: aggResponse.manglikdosh_rahuketu_points,
      ashtakoot_details: filteredAshtakoot,
      remedies:null,
    };

    return finalResponse;
  } catch (err) {
    console.error('Error in matchMakingService:', err);
    throw err;
  }
};

module.exports = {
  getMatchMakingReport
};
