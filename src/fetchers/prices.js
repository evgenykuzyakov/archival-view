import { keysToCamel } from "../data/utils";
import Big from "big.js";

Big.DP = 40;

export const Title = "Price oracle";
const OracleContractId = "priceoracle.near";

const TokenName = {
  "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near": "USDC",
  "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near": "USDT",
  "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near": "DAI",
  aurora: "ETH",
  "2260fac5e5542a773aa44fbcfedf7c193bc2c599.factory.bridge.near": "BTC",
  "wrap.near": "wNEAR",
  "meta-pool.near": "STNEAR",
  usn: "USN",
};

export async function computeValueForBlochHeight(viewCall) {
  const prices = keysToCamel(
    await viewCall(OracleContractId, "get_price_data")
  );

  return prices.prices.reduce((acc, { assetId, price }) => {
    if (assetId in TokenName) {
      acc[TokenName[assetId]] = price
        ? Big(price.multiplier).div(Big(10).pow(4)).toFixed(4)
        : null;
    }
    return acc;
  }, {});
}
