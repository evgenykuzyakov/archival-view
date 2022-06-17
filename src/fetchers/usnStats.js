import { keysToCamel } from "../data/utils";
import Big from "big.js";

Big.DP = 40;

export const Title = "USN Treasury data";
const WNearContractId = "wrap.near";
const UsdtContractId =
  "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near";
const UsnStablePoolId = 3020;
const DaoAccountId = "decentralbank.sputnik-dao.near";

const UsnContractId = "usn";
const OracleContractId = "priceoracle.near";
const RefFinanceContractId = "v2.ref-finance.near";
const OneNear = Big(10).pow(24);
const OneUsn = Big(10).pow(18);
const OneUsdt = Big(10).pow(6);
const expectedUsnPrice = Big(1).div(OneUsn);
const expectedUsdtPrice = Big(1).div(OneUsdt);

export async function computeValueForBlochHeight(viewCall, accountState) {
  const account = keysToCamel(await accountState(UsnContractId));
  const nearBalance = Big(account.amount);

  const daoAccount = keysToCamel(await accountState(DaoAccountId));
  const daoNearBalance = Big(daoAccount.amount);

  const usdtBalance = Big(
    await viewCall(UsdtContractId, "ft_balance_of", {
      account_id: UsnContractId,
    })
  );

  const usdtDaoBalance = Big(
    await viewCall(UsdtContractId, "ft_balance_of", {
      account_id: DaoAccountId,
    })
  );

  const wNearBalance = Big(
    await viewCall(WNearContractId, "ft_balance_of", {
      account_id: UsnContractId,
    })
  );

  const wNearDaoBalance = Big(
    await viewCall(WNearContractId, "ft_balance_of", {
      account_id: DaoAccountId,
    })
  );

  const usnDaoBalance = Big(
    await viewCall(UsnContractId, "ft_balance_of", {
      account_id: DaoAccountId,
    })
  );

  const totalSupply = Big(await viewCall(UsnContractId, "ft_total_supply"));

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
    .add(Big(refBalances[UsnContractId]));
  const poolUsdtAmount = Big(refStablePool.amounts[1]);
  const ownedUsdtAmount = poolUsdtAmount
    .mul(percent)
    .round(0, 0)
    .add(Big(refBalances[UsdtContractId]));

  const ownedNear = nearBalance
    .add(Big(refBalances[WNearContractId]))
    .add(wNearBalance);

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

  const totalNear = ownedNear.add(wNearDaoBalance).add(daoNearBalance);
  const totalUsdt = ownedUsdtAmount.add(usdtDaoBalance).add(usdtBalance);
  const totalUsn = ownedUsnAmount.add(usnDaoBalance);

  const pricedOwnedNear = totalNear.mul(priceMul[WNearContractId]);
  const pricedOwnedUsdt = totalUsdt.mul(
    priceMul[UsdtContractId] || expectedUsdtPrice
  );
  const pricedOwnedUsn = totalUsn.mul(
    priceMul[UsnContractId] || expectedUsnPrice
  );

  const publicUsn = totalSupply.sub(totalUsn);

  return {
    "Total USN": totalSupply.div(OneUsn).toFixed(2),
    "Public USN": publicUsn.div(OneUsn).toFixed(2),
    "Collateral USD (without USN)": pricedOwnedNear
      .add(pricedOwnedUsdt)
      .toFixed(2),
    "Treasury USD": pricedOwnedNear
      .add(pricedOwnedUsdt)
      .add(pricedOwnedUsn)
      .toFixed(2),
    "NEAR owned (USD)": pricedOwnedNear.toFixed(2),
    "USDT owned (USD)": pricedOwnedUsdt.toFixed(2),
    "USN owned (USD)": pricedOwnedUsn.toFixed(2),
    // "NEAR balance": ownedNear.div(OneNear).toFixed(2),
    // "DAO NEAR balance": daoNearBalance
    //   .add(wNearDaoBalance)
    //   .div(OneNear)
    //   .toFixed(2),
    "NEAR owned (NEAR)": totalNear.div(OneNear).toFixed(2),
  };
}
