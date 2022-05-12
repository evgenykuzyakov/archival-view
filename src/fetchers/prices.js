import { keysToCamel } from "../data/utils";
import Big from "big.js";

Big.DP = 40;

export const Title = "Price oracle (testnet)";
const OracleContractId = "priceoracle.testnet";

const TokenName = {
  "usdc.fakes.testnet": "USDC",
  "usdt.fakes.testnet": "USDT",
  "dai.fakes.testnet": "DAI",
  aurora: "ETH",
  "wbtc.fakes.testnet": "BTC",
  "wrap.testnet": "wNEAR",
  "wrap.testnet#3600": "wNEAR#3600",
  "usdn.testnet": "USN",
  "aurora.fakes.testnet": "AURORA",
};

const ExtraDivide = {
  "wrap.testnet#3600": 10000,
};

export async function computeValueForBlochHeight(viewCall) {
  const prices = keysToCamel(
    await viewCall(OracleContractId, "get_price_data", {
      asset_ids: Object.keys(TokenName),
    })
  );

  return prices.prices.reduce((acc, { assetId, price }) => {
    if (assetId in TokenName) {
      acc[TokenName[assetId]] = price
        ? Big(price.multiplier)
            .div(
              Big(10)
                .pow(4)
                .mul(ExtraDivide[assetId] || 1.0)
            )
            .toFixed(4)
        : null;
    }
    return acc;
  }, {});
}
