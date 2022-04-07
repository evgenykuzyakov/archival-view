import "./App.scss";
import "error-polyfill";
import "bootstrap/dist/js/bootstrap.bundle";
import { useEffect, useState } from "react";
import { keysToCamel } from "./data/utils";
import Big from "big.js";
import { useNear } from "./data/near";

const ContractId = "contract.main.burrow.near";

const OneDay = 24 * 60 * 60 * 1000;

const startBlockTime = new Date(new Date().getTime() - OneDay * 7);

async function fetchDataPoint(near, blockHeight) {}

async function fetchData(near) {
  const currentBlockHeight = await near.fetchBlockHeight();
  console.log("Current blockHeight", currentBlockHeight);
  return currentBlockHeight;
}

function App() {
  const [data, setData] = useState(null);

  const near = useNear();
  useEffect(() => {
    if (!near) {
      return;
    }

    fetchData(near).then(setData);
  }, [near]);

  return (
    <div>
      <h1>Archival View</h1>
      <div className="container">
        <div className="row">
          <pre>{data === null ? "Loading" : JSON.stringify(data, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

export default App;
