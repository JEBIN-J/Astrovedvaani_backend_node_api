const WALLET_GST_PERCENT = 18;

function calculateWalletDeduction(uiPrice, productGst) {
  uiPrice = Number(uiPrice || 0);
  productGst = Number(productGst || 0);

  if (uiPrice <= 0) return 0;

  const adjusted =
    (uiPrice * (1 + productGst / 100)) / (1 + WALLET_GST_PERCENT / 100);

  return Number(adjusted.toFixed(2));
}

module.exports = {
  calculateWalletDeduction,
};
