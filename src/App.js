import "./App.scss";
import "error-polyfill";
import "bootstrap/dist/js/bootstrap.bundle";
import { useEffect, useState } from "react";
import "chartjs-adapter-moment";
import { Line } from "react-chartjs-2";
import { useNear } from "./data/near";
import { PromisePool } from "@supercharge/promise-pool";
import "chart.js/auto";
import { computeValueForBlochHeight, Title } from "./fetchers/refNear";
import palette from "google-palette";

const NumSplits = 8;
const OneDay = 24 * 60 * 60 * 1000;
const CloseEnoughTimeDiff = 60 * 1000;

const NumDays = 28;
const startBlockTime = new Date(new Date().getTime() - OneDay * NumDays);
const OptimisticMsPerBlock = 900;

const LineOptions = {
  animation: false,
  responsive: true,
  scales: {
    xAxis: {
      type: "time",
      time: {
        minUnit: "hour",
      },
      ticks: {
        major: {
          enabled: true,
        },
      },
    },
    yAxis: {
      min: 0,
      ticks: {
        beginAtZero: true,
      },
    },
  },
  plugins: {
    colorschemes: {
      scheme: "brewer.Paired12",
    },
  },
};

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

async function fetchDataPoint(near, blockHeight) {
  const block = await fetchNextAvailableBlock(near, blockHeight);
  const time = blockTime(block);
  blockHeight = block.header.height;
  return {
    time,
    blockHeight,
    value: await computeValueForBlochHeight(
      (...args) => near.archivalViewCall(blockHeight, ...args),
      (...args) => near.archivalAccountState(blockHeight, ...args)
    ),
  };
}

async function findStartBlock(near, startBlockTime, currentBlock) {
  let blockTimeRight = blockTime(currentBlock);
  let blockHeightRight = currentBlock.header.height;
  const leftBlock = await fetchNextAvailableBlock(
    near,
    Math.max(
      blockHeightRight - 10000000,
      blockHeightRight -
        Math.ceil((blockTimeRight - startBlockTime) / OptimisticMsPerBlock)
    )
  );
  let blockHeightLeft = leftBlock.header.height;
  let blockTimeLeft = blockTime(leftBlock);
  for (let i = 0; i < 5; ++i) {
    const blockHeight =
      blockHeightLeft +
      Math.round(
        ((blockHeightRight - blockHeightLeft) /
          (blockTimeRight - blockTimeLeft)) *
          (startBlockTime - blockTimeLeft)
      );
    const block = await fetchNextAvailableBlock(near, blockHeight);
    const blockTimestamp = blockTime(block);
    const blockProximity = Math.abs(startBlockTime - blockTimestamp);
    console.log(
      `Iter #${i}: Block time proximity ${(blockProximity / 1e3).toFixed(
        2
      )} sec`
    );
    if (blockProximity < CloseEnoughTimeDiff) {
      return block;
    }
    if (blockTimestamp > startBlockTime) {
      blockHeightRight = blockHeight;
      blockTimeRight = blockTimestamp;
    } else {
      blockHeightLeft = blockHeight;
      blockTimeLeft = blockTimestamp;
    }
  }
  return await fetchNextAvailableBlock(near, blockHeightLeft);
}

async function fetchData(near, setProgress, setData) {
  setProgress("fetching current block");
  const currentBlockHeight = await near.fetchBlockHeight();
  console.log("Current blockHeight", currentBlockHeight);
  const currentBlock = await near.fetchArchivalBlock(currentBlockHeight);
  setProgress("searching for the starting block");
  const startBlock = await findStartBlock(
    near,
    startBlockTime.getTime(),
    currentBlock
  );
  const startBlockHeight = startBlock.header.height;
  console.log("Start blockHeight", startBlockHeight);
  // const startTime = blockTime(startBlock);
  setProgress("fetching initial data");

  let blockHeights = [startBlockHeight, currentBlockHeight];
  let allBlockHeights = [startBlockHeight, currentBlockHeight];
  let data = [];
  for (let i = 0; i < NumSplits; ++i) {
    const { results, errors } = await PromisePool.withConcurrency(8)
      .for(blockHeights)
      .process(async (blockHeight) => fetchDataPoint(near, blockHeight));

    if (errors.length > 0) {
      console.log("Errors", errors);
    }

    data = [...data, ...results].sort((a, b) => a.blockHeight - b.blockHeight);
    setData(data);
    setProgress(`increasing precision, iteration ${i + 1} / ${NumSplits}`);

    // Splitting
    const newBlockHeights = [];
    for (let i = 0; i < allBlockHeights.length - 1; ++i) {
      newBlockHeights.push((allBlockHeights[i] + allBlockHeights[i + 1]) >> 1);
    }
    allBlockHeights = [...allBlockHeights, ...newBlockHeights].sort();
    blockHeights = newBlockHeights;
  }
}

const computeLineData = (data) => {
  const val = data[0].value;
  const keys = Object.keys(val);
  const p = palette("tol", keys.length).map((hex) => "#" + hex);
  const datasets = keys.map((key, index) => {
    const d = data.map(({ time, value }) => {
      return {
        x: new Date(time),
        y: value[key],
      };
    });
    return {
      data: d,
      label: key,
      backgroundColor: p[index],
    };
  });
  return {
    datasets,
  };
};

function App() {
  const [data, setData] = useState(null);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    document.title = Title;
  }, []);

  const near = useNear();
  useEffect(() => {
    if (!near) {
      return;
    }

    fetchData(near, setProgress, setData).then(() => setProgress(null));
  }, [near]);

  return (
    <div>
      <h1>{Title}</h1>
      <div className="container">
        <div className="row">
          {data && (
            <div>
              <Line data={computeLineData(data)} options={LineOptions} />
            </div>
          )}
          {progress && <h2 className="text-muted">Progress: {progress}</h2>}
          {data && (
            <div>
              <h3>Raw data</h3>
              <div>
                <pre>{JSON.stringify(data, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
