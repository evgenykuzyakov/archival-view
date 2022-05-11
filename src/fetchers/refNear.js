import { keysToCamel } from "../data/utils";
import Big from "big.js";

Big.DP = 40;

export const Title = "REF/wNEAR";
const RefPoolId = 79;
const RefFinanceContractId = "v2.ref-finance.near";

export async function computeValueForBlochHeight(viewCall) {
  const refPool = keysToCamel(
    await viewCall(RefFinanceContractId, "get_pool", {
      pool_id: RefPoolId,
    })
  );
  const refPrice = Big(refPool.amounts[1])
    .div(Big(refPool.amounts[0]))
    .div(1e6);

  return {
    "REF/wNEAR": refPrice.toFixed(6),
  };
}
