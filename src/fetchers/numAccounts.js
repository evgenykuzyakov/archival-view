const ContractId = "contract.main.burrow.near";

export async function computeValueForBlochHeight(near, blockHeight) {
  return {
    numAccounts: await near.archivalViewCall(
      blockHeight,
      ContractId,
      "get_num_accounts"
    ),
  };
}
