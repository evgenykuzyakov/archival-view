import { keysToCamel } from "../data/utils";
import Big from "big.js";

Big.DP = 40;

const BurrowContractId = "contract.main.burrow.near";
const OracleContractId = "priceoracle.near";

const TokenName = {
  "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near": "USDC",
  "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near": "USDT",
  "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near": "DAI",
  aurora: "ETH",
  "2260fac5e5542a773aa44fbcfedf7c193bc2c599.factory.bridge.near": "BTC",
  "wrap.near": "wNEAR",
  "meta-pool.near": "STNEAR",
  "linear-protocol.near": "LINEAR",
  usn: "USN",
  "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near": "AURORA",
  "token.burrow.near": "BRRR",
  "meta-token.near": "META",
};

const Decimals = {
  "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near": 6,
  "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near": 6,
  "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near": 18,
  aurora: 18,
  "2260fac5e5542a773aa44fbcfedf7c193bc2c599.factory.bridge.near": 8,
  "wrap.near": 24,
  "meta-pool.near": 24,
  "linear-protocol.near": 24,
  usn: 18,
  "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near": 18,
  "token.burrow.near": 18,
  "meta-token.near": 24,
};

export async function computeValueForBlochHeight(viewCall) {
  const assets = keysToCamel(
    await viewCall(BurrowContractId, "get_assets_paged")
  );
  const assetIds = assets.map(([assetId, asset]) => assetId);
  const prices = keysToCamel(
    await viewCall(OracleContractId, "get_price_data", {
      asset_ids: assetIds,
    })
  );
  const priceMul = prices.prices.reduce((acc, { assetId, price }) => {
    if (price) {
      acc[assetId] = Big(price.multiplier).div(Big(10).pow(price.decimals));
    } else {
      acc[assetId] = Big(0);
    }
    return acc;
  }, {});

  return assets.reduce((obj, [assetId, asset]) => {
    if (!priceMul[assetId]) {
      return obj;
    }
    const depositAmount = Big(asset.supplied.balance)
      .add(Big(asset.reserved))
      .div(Big(10).pow(asset.config.extraDecimals));
    const depositUsd = depositAmount.mul(priceMul[assetId]);
    const borrowAmount = Big(asset.borrowed.balance).div(
      Big(10).pow(asset.config.extraDecimals)
    );
    const borrowUsd = borrowAmount.mul(priceMul[assetId]);
    obj[TokenName[assetId] || assetId] = {
      deposit: depositAmount.div(Big(10).pow(Decimals[assetId] || 0)),
      depositUsd,
      borrow: borrowAmount.div(Big(10).pow(Decimals[assetId] || 0)),
      borrowUsd,
    };
    return obj;
  }, {});
}
