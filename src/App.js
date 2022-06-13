import "./App.scss";
import "error-polyfill";
import "bootstrap/dist/js/bootstrap.bundle";
import { useCallback, useEffect, useState } from "react";
import "chartjs-adapter-moment";
import { Line } from "react-chartjs-2";
import { useNear } from "./data/near";
import { PromisePool } from "@supercharge/promise-pool";
import "chart.js/auto";
import { computeValueForBlochHeight } from "./fetchers/burrowTvl";
import palette from "google-palette";

const NumSplits = 8;
const CloseEnoughTimeDiff = 60 * 1000;

const startBlockTime = new Date("2022-03-28");
const OptimisticMsPerBlock = 900;

const YAxis = {
  Default: "Default",
  BeginAtZero: "BeginAtZero",
  LogScale: "LogScale",
  Stacked: "Stacked",
};

const DisplayType = {
  Net: "Net",
  Deposits: "Deposits",
  Borrowed: "Borrowed",
};

const LineOptions = {
  animation: false,
  responsive: true,
  interaction: {
    mode: "nearest",
    axis: "x",
    intersect: false,
  },
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
    value: await computeValueForBlochHeight((...args) =>
      near.archivalViewCall(blockHeight, ...args)
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

const computeLineData = (data, inUsd, displayType, stacked) => {
  const val = data[data.length - 1].value;
  const keys = Object.keys(val);
  const p = palette("tol", keys.length).map((hex) => "#" + hex);
  let index = 0;
  const datasets = keys.map((key) => {
    const label = key;
    const d = data.map(({ time, value }) => {
      const v = value[key];
      const deposit = inUsd ? v?.depositUsd : v?.deposit;
      const borrow = inUsd ? v?.borrowUsd : v?.borrow;
      const y =
        displayType === DisplayType.Net
          ? deposit?.sub(borrow)
          : displayType === DisplayType.Deposits
          ? deposit
          : borrow;
      return {
        x: new Date(time),
        y: inUsd ? y?.toFixed(2) : y?.toFixed(6),
      };
    });
    return {
      data: d,
      label,
      backgroundColor: p[index++],
      fill: stacked,
    };
  });

  return {
    datasets,
  };
};

function App() {
  const [data, setData] = useState(null);
  const [progress, setProgress] = useState(null);
  const [yAxis, setYAxis] = useState(YAxis.Stacked);
  const [lineOptions, setLineOptions] = useState(LineOptions);
  const [inUsd, setInUsd] = useState(true);
  const [displayType, setDisplayType] = useState(DisplayType.Net);

  const near = useNear();
  useEffect(() => {
    if (!near) {
      return;
    }

    fetchData(near, setProgress, setData).then(() => setProgress(null));
  }, [near]);

  useEffect(() => {
    const lineOptions = JSON.parse(JSON.stringify(LineOptions));
    if (yAxis === YAxis.BeginAtZero) {
      lineOptions.scales.yAxis.min = 0;
    } else if (yAxis === YAxis.LogScale) {
      lineOptions.scales.yAxis.type = "logarithmic";
    } else if (yAxis === YAxis.Stacked) {
      lineOptions.scales.yAxis.stacked = true;
    }
    setLineOptions(lineOptions);
  }, [yAxis]);

  const yAxisOnChange = useCallback((e) => {
    setYAxis(e.target.value);
  }, []);

  const displayTypeOnChange = useCallback((e) => {
    setDisplayType(e.target.value);
  }, []);

  return (
    <div>
      <h1>Burrow TVL</h1>
      <div className="container">
        <div className="row">
          <label>Y-axis scale:</label>
          <div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="yAxisScaleOptions"
                id="yAxisRadio1"
                checked={yAxis === YAxis.Default}
                onChange={yAxisOnChange}
                value={YAxis.Default}
              />
              <label className="form-check-label" htmlFor="yAxisRadio1">
                Default
              </label>
            </div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="yAxisScaleOptions"
                id="yAxisRadio2"
                checked={yAxis === YAxis.BeginAtZero}
                onChange={yAxisOnChange}
                value={YAxis.BeginAtZero}
              />
              <label className="form-check-label" htmlFor="yAxisRadio2">
                Begin at zero
              </label>
            </div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="yAxisScaleOptions"
                id="yAxisRadio3"
                checked={yAxis === YAxis.LogScale}
                onChange={yAxisOnChange}
                value={YAxis.LogScale}
              />
              <label className="form-check-label" htmlFor="yAxisRadio3">
                Log scale
              </label>
            </div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="yAxisScaleOptions"
                id="yAxisRadio4"
                checked={yAxis === YAxis.Stacked}
                onChange={yAxisOnChange}
                value={YAxis.Stacked}
              />
              <label className="form-check-label" htmlFor="yAxisRadio4">
                Stacked
              </label>
            </div>
          </div>
        </div>
        <div className="row">
          <label>Display options:</label>
          <div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="checkbox"
                name="showUsdOptions"
                id="showUsdOptions"
                checked={inUsd}
                onChange={(e) => setInUsd(e.target.checked)}
              />
              <label className="form-check-label" htmlFor="showUsdOptions">
                Values in USD
              </label>
            </div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="showNetTvlOptions"
                id="showNetTvlOptions"
                checked={displayType === DisplayType.Net}
                onChange={displayTypeOnChange}
                value={DisplayType.Net}
              />
              <label className="form-check-label" htmlFor="showNetTvlOptions">
                Net Value
              </label>
            </div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="showDepositsOptions"
                id="showDepositsOptions"
                checked={displayType === DisplayType.Deposits}
                onChange={displayTypeOnChange}
                value={DisplayType.Deposits}
              />
              <label className="form-check-label" htmlFor="showDepositsOptions">
                Show Deposits
              </label>
            </div>
            <div className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="radio"
                name="showBorrowed"
                id="showBorrowed"
                checked={displayType === DisplayType.Borrowed}
                onChange={displayTypeOnChange}
                value={DisplayType.Borrowed}
              />
              <label className="form-check-label" htmlFor="showBorrowed">
                Show Borrowed
              </label>
            </div>
          </div>
        </div>
        <div className="row">
          {data && (
            <div>
              <Line
                data={computeLineData(
                  data,
                  inUsd,
                  displayType,
                  yAxis === YAxis.Stacked
                )}
                options={lineOptions}
              />
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
