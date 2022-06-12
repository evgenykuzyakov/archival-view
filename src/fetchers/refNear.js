import { keysToCamel } from "../data/utils";
import Big from "big.js";

Big.DP = 40;

export const Title = "REF prices";
const RefPoolIds = {
  "REF/wNEAR": 79,
  "BRRR/wNEAR": 3474,
};
const RefFinanceContractId = "v2.ref-finance.near";

export async function computeValueForBlochHeight(viewCall) {
  const promises = await Promise.all(
    Object.entries(RefPoolIds).map(async ([key, poolId]) => {
      const refPool = keysToCamel(
        await viewCall(RefFinanceContractId, "get_pool", {
          pool_id: poolId,
        })
      );
      const refPrice = Big(refPool.amounts[1])
        .div(Big(refPool.amounts[0]))
        .div(1e6);

      return {
        [key]: refPrice.toFixed(6),
      };
    })
  );
  return Object.assign({}, ...promises);
}
