import React, { useState } from "react";
import { useToken } from "../../data/token";
import {
  bigToString,
  computeUsdBalance,
  fromBurrowBalance,
  fromTokenBalance,
} from "../../data/utils";
import { useRefFinance } from "../../data/refFinance";
import MutedDecimals from "../common/MutedDecimals";

export default function TokenBalance(props) {
  const [showUsd, setShowUsd] = useState(props.showUsd);
  const tokenAccountId = props.tokenAccountId;
  const balance = props.balance;
  const adjustForBurrow = props.adjustForBurrow || false;
  const token = useToken(tokenAccountId);
  const refFinance = useRefFinance();
  const adjustedBalance = adjustForBurrow
    ? fromBurrowBalance(token, balance)
    : balance;
  const usdBalance = computeUsdBalance(
    refFinance,
    tokenAccountId,
    adjustedBalance
  );

  const clickable = props.clickable && usdBalance;

  return (
    <span
      className={`font-monospace ${clickable ? "pointer" : ""} ${
        props.className || "fw-bold"
      }`}
      onClick={(e) => {
        if (clickable) {
          e.stopPropagation();
          setShowUsd(!showUsd);
        }
      }}
    >
      {showUsd && <span className="text-secondary">~$</span>}
      <MutedDecimals
        value={
          showUsd
            ? bigToString(usdBalance)
            : bigToString(fromTokenBalance(token, adjustedBalance))
        }
      />
    </span>
  );
}
