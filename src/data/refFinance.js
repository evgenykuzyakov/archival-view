import { singletonHook } from "react-singleton-hook";
import { useEffect, useState } from "react";
import { NearConfig, useNear } from "./near";
import Big from "big.js";
import { OneNear } from "./utils";

const SimplePool = "SIMPLE_POOL";

const defaultRefFinance = {
  loading: true,
  pools: {},
  poolsByToken: {},
  poolsByPair: {},
  prices: {},
  balances: {},
  nearPrice: Big(0),
};

const usdTokens = {
  "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near":
    Big(10).pow(18),
  "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near":
    Big(10).pow(6),
  "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near":
    Big(10).pow(6),
};

export function getRefReturn(pool, tokenIn, amountIn) {
  if (!amountIn || amountIn.eq(0)) {
    return Big(0);
  }
  const tokenOut = pool.ot[tokenIn];
  if (!tokenOut) {
    return null;
  }
  const balanceIn = pool.tokens[tokenIn];
  const balanceOut = pool.tokens[tokenOut];
  let amountWithFee = Big(amountIn).mul(Big(10000 - pool.fee));
  return amountWithFee
    .mul(balanceOut)
    .div(Big(10000).mul(balanceIn).add(amountWithFee))
    .round(0, 0);
}

export function getRefInverseReturn(pool, tokenOut, amountOut) {
  if (!amountOut || amountOut.eq(0)) {
    return Big(0);
  }
  const tokenIn = pool.ot[tokenOut];
  if (!tokenIn) {
    return null;
  }
  const balanceIn = pool.tokens[tokenIn];
  const balanceOut = pool.tokens[tokenOut];
  if (amountOut.gte(balanceOut)) {
    return null;
  }
  return Big(10000)
    .mul(balanceIn)
    .mul(amountOut)
    .div(Big(10000 - pool.fee).mul(balanceOut.sub(amountOut)))
    .round(0, 3);
}

const fetchRefData = async (near) => {
  const balances = {};

  const limit = 250;
  // Limit pools for now until we need other prices.
  const numPools = Math.min(
    10000,
    await near.viewCall(
      NearConfig.refContractAccountId,
      "get_number_of_pools",
      {}
    )
  );
  const promises = [];
  for (let i = 0; i < numPools; i += limit) {
    promises.push(
      await near.viewCall(NearConfig.refContractAccountId, "get_pools", {
        from_index: i,
        limit,
      })
    );
  }
  const rawPools = (await Promise.all(promises)).flat();

  const poolsByToken = {};
  const poolsByPair = {};

  const addPools = (token, pool) => {
    let ps = poolsByToken[token] || [];
    ps.push(pool);
    poolsByToken[token] = ps;

    const pair = `${token}:${pool.ot[token]}`;
    ps = poolsByPair[pair] || [];
    ps.push(pool);
    poolsByPair[pair] = ps;
  };

  const pools = {};
  rawPools.forEach((pool, i) => {
    if (pool.pool_kind === SimplePool) {
      const tt = pool.token_account_ids;
      const p = {
        index: i,
        tt,
        tokens: tt.reduce((acc, token, tokenIndex) => {
          acc[token] = Big(pool.amounts[tokenIndex]);
          return acc;
        }, {}),
        ot: tt.reduce((acc, token, tokenIndex) => {
          acc[token] = tt[1 - tokenIndex];
          return acc;
        }, {}),
        fee: pool.total_fee,
        shares: Big(pool.shares_total_supply),
      };
      if (p.shares.gt(0)) {
        pools[p.index] = p;
        addPools(p.tt[0], p);
        addPools(p.tt[1], p);
      }
    }
  });

  const wNEAR = NearConfig.wrapNearAccountId;
  const prices = {};

  Object.values(pools).forEach((pool) => {
    if (wNEAR in pool.tokens) {
      pool.otherToken = pool.ot[wNEAR];
      const p = prices[pool.otherToken] || {
        totalNear: Big(0),
        totalOther: Big(0),
      };
      p.totalNear = p.totalNear.add(pool.tokens[wNEAR]);
      p.totalOther = p.totalOther.add(pool.tokens[pool.otherToken]);
      if (p.totalNear.gt(0)) {
        prices[pool.otherToken] = p;
      }
    }
  });

  let totalNearInUsdPools = Big(0);
  let totalUsdInUsdPools = Big(0);

  Object.entries(usdTokens).forEach(([tokenId, one]) => {
    if (tokenId in prices) {
      const p = prices[tokenId];
      totalNearInUsdPools = totalNearInUsdPools.add(p.totalNear);
      totalUsdInUsdPools = totalUsdInUsdPools.add(
        p.totalOther.mul(OneNear).div(one)
      );
    }
  });

  const nearPrice = totalNearInUsdPools.gt(0)
    ? totalUsdInUsdPools.div(totalNearInUsdPools)
    : Big(0);

  return {
    loading: false,
    pools,
    poolsByToken,
    poolsByPair,
    nearPrice,
    prices,
    balances,
  };
};

let refRefreshTimer = null;

export const useRefFinance = singletonHook(defaultRefFinance, () => {
  const [refFinance, setRefFinance] = useState(defaultRefFinance);
  const near = useNear();

  useEffect(() => {
    if (near) {
      let scheduleRefresh;
      let refresh;

      const localMapRef = (ref) => {
        ref.scheduleRefresh = scheduleRefresh;
        ref.refresh = refresh;
        return ref;
      };

      refresh = async () => {
        const ref = await fetchRefData(near);
        setRefFinance(localMapRef(ref));
      };

      scheduleRefresh = (fast) => {
        clearTimeout(refRefreshTimer);
        refRefreshTimer = setTimeout(
          async () => {
            if (!document.hidden) {
              await refresh();
            } else {
              scheduleRefresh(fast);
            }
          },
          fast ? 5000 : 30000
        );
      };

      refresh().catch(console.error);
    }
  }, [near]);

  return refFinance;
});
