import { keysToCamel } from "../data/utils";
import Big from "big.js";

Big.DP = 40;

const BurrowContractId = "contract.main.burrow.near";
const OracleContractId = "priceoracle.near";

export async function computeValueForBlochHeight(near, blockHeight) {
  const assets = keysToCamel(
    await near.archivalViewCall(
      blockHeight,
      BurrowContractId,
      "get_assets_paged"
    )
  );
  const assetIds = assets.map(([assetId, asset]) => assetId);
  const prices = keysToCamel(
    await near.archivalViewCall(
      blockHeight,
      OracleContractId,
      "get_price_data",
      {
        asset_ids: assetIds,
      }
    )
  );
  const priceMul = prices.prices.reduce((acc, { assetId, price }) => {
    if (price) {
      acc[assetId] = Big(price.multiplier).div(Big(10).pow(price.decimals));
    } else {
      acc[assetId] = Big(0);
    }
    return acc;
  }, {});
  const totalDeposit = assets
    .reduce((sum, [assetId, asset]) => {
      const value = Big(asset.supplied.balance)
        .add(Big(asset.reserved))
        .div(Big(10).pow(asset.config.extraDecimals));
      return sum.add(value.mul(priceMul[assetId]));
    }, Big(0))
    .toFixed(2);

  const totalBorrowed = assets
    .reduce((sum, [assetId, asset]) => {
      const value = Big(asset.borrowed.balance).div(
        Big(10).pow(asset.config.extraDecimals)
      );
      return sum.add(value.mul(priceMul[assetId]));
    }, Big(0))
    .toFixed(2);

  return {
    "Total Deposited Value": totalDeposit,
    "Total Borrowed Value": totalBorrowed,
  };
}
