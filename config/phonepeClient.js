// const { StandardCheckoutClient } = require("pg-sdk-node"); // adjust import path as per your SDK

// let phonePeClient = null;

// function initPhonePeClient(integration) {
//   if (!phonePeClient) {
//     phonePeClient = StandardCheckoutClient.getInstance(
//       integration.api_key,
//       integration.api_secret,
//       integration.extra_config?.salt_index || "1",
//       integration.extra_config?.environment || "SANDBOX"
//     );
//     console.log("[PhonePeClient] Initialized once globally");
//   }
//   return phonePeClient;
// }

// function getPhonePeClient() {
//   if (!phonePeClient) {
//     throw new Error("PhonePe client not initialized yet. Call initPhonePeClient() at startup.");
//   }
//   return phonePeClient;
// }

// module.exports = { initPhonePeClient, getPhonePeClient };
