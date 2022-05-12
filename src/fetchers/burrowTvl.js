import { keysToCamel } from "../data/utils";
import Big from "big.js";

Big.DP = 40;

const BurrowContractId = "contract.main.burrow.near";
const OracleContractId = "priceoracle.near";

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

  const totalReserves = assets.reduce((sum, [assetId, asset]) => {
    const value = Big(asset.reserved).div(
      Big(10).pow(asset.config.extraDecimals)
    );
    return priceMul[assetId] ? sum?.add(value.mul(priceMul[assetId])) : null;
  }, Big(0));

  const totalDeposit = assets.reduce((sum, [assetId, asset]) => {
    const value = Big(asset.supplied.balance)
      .add(Big(asset.reserved))
      .div(Big(10).pow(asset.config.extraDecimals));
    return priceMul[assetId] ? sum?.add(value.mul(priceMul[assetId])) : null;
  }, Big(0));

  const totalBorrowed = assets.reduce((sum, [assetId, asset]) => {
    const value = Big(asset.borrowed.balance).div(
      Big(10).pow(asset.config.extraDecimals)
    );
    return priceMul[assetId] ? sum?.add(value.mul(priceMul[assetId])) : null;
  }, Big(0));

  return {
    Deposited: totalDeposit?.toFixed(2),
    Borrowed: totalBorrowed?.toFixed(2),
    Reserves: totalReserves?.toFixed(2),
    "Non-borrowed TVL": totalDeposit?.sub(totalBorrowed)?.toFixed(2),
  };
}
