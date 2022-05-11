import { keysToCamel } from "../data/utils";
import Big from "big.js";

Big.DP = 40;

export const Title = "USN Treasury data";
const WNearContractId = "wrap.near";
const UsdtContractId =
  "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near";
const UsnStablePoolId = 3020;

const UsnContractId = "usn";
const OracleContractId = "priceoracle.near";
const RefFinanceContractId = "v2.ref-finance.near";
const OneNear = Big(10).pow(24);
const OneUsn = Big(10).pow(18);
const expectedUsnPrice = Big(1).div(OneUsn);

export async function computeValueForBlochHeight(viewCall, accountState) {
  const account = keysToCamel(await accountState(UsnContractId));

  const totalSupply = Big(await viewCall(UsnContractId, "ft_total_supply"));
  const nearBalance = Big(account.amount);

  const refBalances = await viewCall(RefFinanceContractId, "get_deposits", {
    account_id: UsnContractId,
  });

  const refPoolShares = Big(
    await viewCall(RefFinanceContractId, "get_pool_shares", {
      pool_id: UsnStablePoolId,
      account_id: UsnContractId,
    })
  );

  const refStablePool = keysToCamel(
    await viewCall(RefFinanceContractId, "get_stable_pool", {
      pool_id: UsnStablePoolId,
    })
  );
  const percent = refPoolShares.div(Big(refStablePool.sharesTotalSupply));
  const poolUsnAmount = Big(refStablePool.amounts[0]);
  const ownedUsnAmount = poolUsnAmount
    .mul(percent)
    .round(0, 0)
    .add(Big(refBalances[UsdtContractId]));
  const poolUsdtAmount = Big(refStablePool.amounts[1]);
  const ownedUsdtAmount = poolUsdtAmount
    .mul(percent)
    .round(0, 0)
    .add(Big(refBalances[UsnContractId]));

  const ownedNear = nearBalance.add(Big(refBalances[WNearContractId]));

  const prices = keysToCamel(
    await viewCall(OracleContractId, "get_price_data", {
      asset_ids: [WNearContractId, UsdtContractId, UsnContractId],
    })
  );

  const priceMul = prices.prices.reduce((acc, { assetId, price }) => {
    if (price) {
      acc[assetId] = Big(price.multiplier).div(Big(10).pow(price.decimals));
    } else {
      acc[assetId] = null;
    }
    return acc;
  }, {});

  const pricedOwnedNear = ownedNear.mul(priceMul[WNearContractId]);
  const pricedOwnedUsdt = ownedUsdtAmount.mul(priceMul[UsdtContractId]);
  const pricedOwnedUsn = ownedUsnAmount.mul(
    priceMul[UsnContractId] || expectedUsnPrice
  );

  return {
    "USN total supply": totalSupply.div(OneUsn).toFixed(2),
    "Treasury balance in USD": pricedOwnedNear
      .add(pricedOwnedUsdt)
      .add(pricedOwnedUsn)
      .toFixed(2),
    "NEAR balance in USD": pricedOwnedNear.toFixed(2),
    "USDT balance in USD": pricedOwnedUsdt.toFixed(2),
    "USN balance in USD": pricedOwnedUsn.toFixed(2),
    "NEAR balance": ownedNear.div(OneNear).toFixed(2),
  };
}
