// utils/apiHeaders.js

const getSaasHeaders = () => {
  return {
    "x-api-key": process.env.SAAS_API_KEY,
    "Content-Type": "application/json",
  };
};

module.exports = { getSaasHeaders };
