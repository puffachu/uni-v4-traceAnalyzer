# Uniswap V4 Trace Analyzer

This is a command-line interface (CLI) tool designed to help developers debug Uniswap V4 hook interactions within transactions. It traces a given Ethereum transaction hash, decodes calls to the Uniswap V4 Pool Manager and associated hooks, and provides a detailed breakdown of the execution flow, including detected hook addresses and their permissions.

The tool can also generate a Mermaid diagram data string, which can be rendered in compatible markdown viewers (like GitHub or VS Code) to visualize the transaction's call graph.

## Features

* **Transaction Tracing:** Fetches and parses transaction call traces from an Ethereum RPC endpoint.
* **Uniswap V4 Specific Decoding:** Decodes calls to the Uniswap V4 Pool Manager and known hook interfaces.
* **Hook Detection:** Identifies the hook contract address involved in the transaction.
* **Hook Permission Decoding:** Decodes the permissions encoded in the hook address (based on Uniswap V4 specification).
* **Mermaid Diagram Generation:** // Code is present but not implemented yet cause it doesn't look pretty.
* **External ABI Fetching:** Automatically fetches ABIs from Etherscan (or compatible block explorers like Uniscan) for unknown contracts to enhance decoding.

## Prerequisites

Before you begin, ensure you have the following installed:

* Node.js (LTS version recommended)
* npm (comes with Node.js)

You will also need:

* An **Ethereum RPC URL** that supports `debug_traceTransaction` (e.g., Tenderly, Geth with tracing enabled, Erigon).
* An **Uniscan API Key** (or Etherscan / chain equivalent explorer API key) to fetch contract ABIs.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/puffachu/uni-v4-traceAnalyzer.git](https://github.com/puffachu/uni-v4-traceAnalyzer.git)
    cd uniswap-v4-traceAnalyze
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

## Configuration

Set up your RPC URL and Etherscan API key by modifying the `traceAnalyzer.js` file directly, or preferably by setting them as environment variables (which is more secure for API keys).


Open `src/traceAnalyzer.js` and update the constants:

```javascript

const RPC_URL = "YOUR_RPC_URL_HERE";
const ETHERSCAN_API_KEY = 'YOUR_ETHERSCAN_API_KEY_HERE';
```

P.S if using on a chain other than Unichain, Please confirm blockchain explorer api address in utils.js 
```javascript
let Api_url = 'https://api.uniscan.xyz/api';
```

## TODO
```
Add Function Parameters & State Changes: Display the values of key parameters passed into hook functions and how internal hook state variables change during execution.

Add Complex Hook Decoding: Current version is simplified
```
# uni-v4-traceAnalyzer
Tool designed to help developers Analyze Uniswap V4 hook interactions within transactions
