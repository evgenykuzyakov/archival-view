import "./App.scss";
import "error-polyfill";
import "bootstrap/dist/js/bootstrap.bundle";
import { useEffect, useState } from "react";
import { keysToCamel } from "./data/utils";
import Big from "big.js";
import { useNear } from "./data/near";
import { PromisePool } from "@supercharge/promise-pool";

const ContractId = "contract.main.burrow.near";

const OneDay = 24 * 60 * 60 * 1000;

const startBlockTime = new Date(new Date().getTime() - OneDay * 7);
const OptimisticMsPerBlock = 900;

const numDataPoints = 24 * 7;

async function fetchNextAvailableBlock(near, blockHeight) {
  const limit = blockHeight + 5;
  for (
    let tryingBlockHeight = blockHeight;
    tryingBlockHeight < limit;
    tryingBlockHeight++
  ) {
    try {
      const block = await near.fetchArchivalBlock(tryingBlockHeight);
      if (block) {
        return block;
      }
    } catch (e) {
      // Probably block doesn't exist
    }
  }
  return null;
}

const blockTime = (block) => parseFloat(block.header.timestamp_nanosec) / 1e6;

async function computeDataForBlochHeight(near, blockHeight) {
  return near.archivalViewCall(blockHeight, ContractId, "get_num_accounts");
}

async function fetchDataPoint(near, blockHeight) {
  const block = await fetchNextAvailableBlock(near, blockHeight);
  const time = blockTime(block);
  blockHeight = block.header.height;
  console.log(time, blockHeight);
  return {
    time,
    blockHeight,
    data: await computeDataForBlochHeight(near, blockHeight),
  };
}

async function findStartBlock(near, startBlockTime, currentBlock) {
  const currentBlockTimestamp = blockTime(currentBlock);
  const currentBlockHeight = currentBlock.header.height;
  const timeDiff = currentBlockTimestamp - startBlockTime;
  let blockHeightLeft = Math.max(
    currentBlockHeight - 10000000,
    currentBlockHeight - Math.ceil(timeDiff / OptimisticMsPerBlock)
  );
  let blockHeightRight = currentBlockHeight;
  while (blockHeightLeft + 1 < blockHeightRight) {
    const blockHeight = (blockHeightLeft + blockHeightRight) >> 1;
    const block = await fetchNextAvailableBlock(near, blockHeight);
    const blockTimestamp = blockTime(block);
    if (blockTimestamp > startBlockTime) {
      blockHeightRight = blockHeight;
    } else {
      blockHeightLeft = blockHeight;
    }
  }
  return await fetchNextAvailableBlock(near, blockHeightLeft);
}

async function fetchData(near, setProgress) {
  setProgress("Loading: current block height");
  const currentBlockHeight = await near.fetchBlockHeight();
  console.log("Current blockHeight", currentBlockHeight);
  const currentBlock = await near.fetchArchivalBlock(currentBlockHeight);
  setProgress("Loading: starting block");
  const startBlock = await findStartBlock(
    near,
    startBlockTime.getTime(),
    currentBlock
  );
  const startBlockHeight = startBlock.header.height;
  console.log("Start blockHeight", startBlockHeight);
  const startTime = blockTime(startBlock);
  const blockHeights = [];
  setProgress("Loading: fetching data 0%");
  for (let i = 0; i <= numDataPoints; ++i) {
    blockHeights.push(
      startBlockHeight +
        Math.floor(
          (i * (currentBlockHeight - startBlockHeight)) / numDataPoints
        )
    );
  }
  let numDataPointsDone = 0;

  const { results, errors } = await PromisePool.withConcurrency(8)
    .for(blockHeights)
    .process(async (blockHeight) => {
      const dataPoint = fetchDataPoint(near, blockHeight);
      numDataPointsDone++;
      setProgress(
        `Loading: fetching data ${(
          (100 * numDataPointsDone) /
          (numDataPoints + 1)
        ).toFixed(1)}%`
      );
      return dataPoint;
    });

  return results.sort((a, b) => a.blockHeight - b.blockHeight);
}

function App() {
  const [data, setData] = useState(null);
  const [progress, setProgress] = useState(null);

  const near = useNear();
  useEffect(() => {
    if (!near) {
      return;
    }

    fetchData(near, setProgress).then(setData);
  }, [near]);

  return (
    <div>
      <h1>Archival View</h1>
      <div className="container">
        <div className="row">
          {data ? (
            <pre>{JSON.stringify(data, null, 2)}</pre>
          ) : (
            <div>{progress}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
