const axios = require('axios');

const apiService = {
  getMatchMakingReport: async (params, baseUrl, apiKey) => {
    try {
      const url = `${baseUrl}/matching/aggregate-match`;
      const queryParams = {
        ...params,
        api_key: apiKey
      };

      const response = await axios.get(url, { params: queryParams });
      return response.data;
    } catch (error) {
      console.error('Error in getMatchMakingReport:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch match making report');
    }
  },

  getAshtakootWithAstroDetails: async (params, baseUrl, apiKey) => {
    try {
      const url = `${baseUrl}/matching/ashtakoot-with-astro-details`;
      const queryParams = {
        ...params,
        api_key: apiKey
      };

      const response = await axios.get(url, { params: queryParams });
      return response.data;
    } catch (error) {
      console.error('Error in getAshtakootWithAstroDetails:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch Ashtakoot with Astro Details');
    }
  },

  get12MonthHoroscopePrediction: async (params, baseUrl, apiKey) => {
    try {
      const url = `${baseUrl}/horoscope/ai-12-month-prediction`;
      const queryParams = {
        ...params,
        api_key: apiKey
      };

      const response = await axios.get(url, { params: queryParams });
      return response.data;
    } catch (error) {
      console.error('Error in get12MonthHoroscopePrediction:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch 12-month horoscope prediction');
    }
  }
};

module.exports = apiService;