const ContractId = "contract.main.burrow.near";

export async function computeValueForBlochHeight(viewCall) {
  return {
    numAccounts: await viewCall(ContractId, "get_num_accounts"),
  };
}
