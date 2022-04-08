import "./App.scss";
import "error-polyfill";
import "bootstrap/dist/js/bootstrap.bundle";
import { useEffect, useState } from "react";
import "chartjs-adapter-moment";
import { Line } from "react-chartjs-2";
import { useNear } from "./data/near";
import { PromisePool } from "@supercharge/promise-pool";
import "chart.js/auto";
import { computeValueForBlochHeight } from "./fetchers/burrowTvl";
import palette from "google-palette";

const NumSplits = 8;
const OneDay = 24 * 60 * 60 * 1000;

const startBlockTime = new Date(new Date().getTime() - OneDay * 7);
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
    value: await computeValueForBlochHeight(near, blockHeight),
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

async function fetchData(near, setProgress, setData) {
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
  // const startTime = blockTime(startBlock);
  setProgress("Loading: fetching initial data");

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
    setProgress(`Iteration ${i + 1} / ${NumSplits}`);

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
  console.log(p);
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

  const near = useNear();
  useEffect(() => {
    if (!near) {
      return;
    }

    fetchData(near, setProgress, setData).then(() => setProgress(null));
  }, [near]);

  return (
    <div>
      <h1>Burrow TVL for the last week</h1>
      <div className="container">
        <div className="row">
          {progress && <h2>{progress}</h2>}
          {data && (
            <div>
              <div>
                <Line data={computeLineData(data)} options={LineOptions} />
              </div>
              <h2>Raw data</h2>
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
