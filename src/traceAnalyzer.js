const { ethers } = require('ethers');
const axios = require('axios');
const {
    decodeHookPermissions,
    fetchAbiFromEtherscan,
    getCallType,
    decodeCallDetails,
    setAbiMap,
    setEtherscanApiKey,
    setUniswapPoolManagerAddress,
    setKnownHookAddresses,
    setHookPermissionsMaskMap,
    setHookInterface 
} = require('./utils');


const RPC_URL = "";
const ETHERSCAN_API_KEY = '';

let provider;
try {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    console.log("TraceAnalyzer: Ethers provider connected");
} catch (error) {
    console.error("TraceAnalyzer: Failed to connect to Ethers provider:", error);

    throw new Error(`Failed to connect to RPC provider: ${error.message}`);
}

const UNISWAP_V4_POOL_MANAGER_ADDRESS = '0x1f98400000000000000000000000000000000004'.toLowerCase();

// add seperate database
const KNOWN_HOOK = {
    
};

const HOOK_PERMISSIONS_MASK_MAP = {
    'beforeSwap': 0,
    'afterSwap': 1,
    'beforeAddLiquidity': 2,
    'afterAddLiquidity': 3,
    'beforeRemoveLiquidity': 4,
    'afterRemoveLiquidity': 5,
    'beforeInitialize': 6,
    'afterInitialize': 7,
    'beforeDonate': 8,
    'afterDonate': 9,
};

const HOOK_LIFECYCLE_FUNCTION_NAMES = new Set([
    'beforeInitialize', 'afterInitialize',
    'beforeAddLiquidity', 'afterAddLiquidity',
    'beforeRemoveLiquidity', 'afterRemoveLiquidity',
    'beforeSwap', 'afterSwap',
    'beforeDonate', 'afterDonate',
    // these names should match what `ethers.Interface` decodes. 
]);


const abiMap = {
    [UNISWAP_V4_POOL_MANAGER_ADDRESS]: new ethers.Interface([
        "function initialize(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) returns (address pool)",
        "function swap((address pool, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes hookData, uint256 flash, bytes permitOptions, bytes collectOptions) params) returns (int256 amount0Delta, int256 amount1Delta, uint160 sqrtPriceX96, uint256 liquidity, int24 tick)",
        "function modifyLiquidity((address pool, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes hookData, bool usePermit, bytes permitOptions) params) returns (int256 amount0, int256 amount1)",
        "function donate(address pool, uint256 amount0, uint256 amount1, bytes hookData) returns (int256 actualAmount0, int256 actualAmount1)",
        "function collect((address pool, int24 tickLower, int24 tickUpper, uint128 amount0, uint128 amount1) params) returns (uint256 actualAmount0, uint256 actualAmount1)"
    ]),
    hookInterface: new ethers.Interface([
        "function beforeInitialize(address sender, (address currency0, address currency1, uint24 fee, int24 tickSpacing, bytes32 salt) poolKey, uint160 sqrtPriceX96, bytes hookData) returns (bytes4)",
        "function afterInitialize(address sender, (address currency0, address currency1, uint24 fee, int24 tickSpacing, bytes32 salt) poolKey, uint160 sqrtPriceX96, int256 amount0Delta, int256 amount1Delta, bytes hookData) returns (bytes4)",
        "function beforeAddLiquidity(address sender, (address pool, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes hookData, bool usePermit, bytes permitOptions) params) returns (bytes4)",
        "function afterAddLiquidity(address sender, (address pool, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes hookData, bool usePermit, bytes permitOptions) params) returns (bytes4)",
        "function beforeRemoveLiquidity(address sender, (address pool, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes hookData, bool usePermit, bytes permitOptions) params) returns (bytes4)",
        "function afterRemoveLiquidity(address sender, (address pool, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes hookData, bool usePermit, bytes permitOptions) params) returns (bytes4)",
        "function beforeSwap(address sender, (address pool, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes hookData, uint256 flash, bytes permitOptions, bytes collectOptions) params) returns (uint256 lpFeeOverride)",
        "function afterSwap(address sender, (address pool, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes hookData, uint256 flash, bytes permitOptions, bytes collectOptions) params, int256 amount0Delta, int256 amount1Delta) returns (bytes4 hookDelta)",
        "function beforeDonate(address sender, (address pool, uint256 amount0, uint256 amount1, bytes hookData) params) returns (bytes4)",
        "function afterDonate(address sender, (address pool, uint256 amount0, uint256 amount1, bytes hookData) params, int256 actualAmount0, int256 actualAmount1) returns (bytes4)"
    ])
};


setAbiMap(abiMap);
setEtherscanApiKey(ETHERSCAN_API_KEY);
setUniswapPoolManagerAddress(UNISWAP_V4_POOL_MANAGER_ADDRESS);
setKnownHookAddresses(KNOWN_HOOK);
setHookPermissionsMaskMap(HOOK_PERMISSIONS_MASK_MAP);
setHookInterface(abiMap.hookInterface); 


async function fetchTxTrace(txHash) {
    return provider.send('debug_traceTransaction', [txHash, { tracer: 'callTracer', timeout: '60s' }]);
}

function emptyTraceResponse(txHash) {
    return {
        success: true,
        txHash,
        trace: [],
        detectedHookAddress: null,
        hookPermissions: {},
        mermaidDiagramData: 'graph TD\n  A[No Calls] --> B[No Trace Found]'
    };
}


function detectHookAddress(callNode) {
    if (!callNode) return null;

    if (callNode.to?.toLowerCase() === UNISWAP_V4_POOL_MANAGER_ADDRESS) {
        try {
            const iface = abiMap[UNISWAP_V4_POOL_MANAGER_ADDRESS];
            const decoded = iface?.parseTransaction({ data: callNode.input });
            if (!decoded) return null;

            const hookInput = decoded.fragment.inputs.find(i => i.name === 'hooks');
            if (hookInput) return decoded.args[hookInput.name]?.toLowerCase();

            const params = decoded.fragment.inputs.find(i => i.name === 'params' && i.components);
            if (params?.components.some(comp => comp.name === 'hookData')) {
                // real decoding of hookData should happen here if possible 
                // If hookData is present, and one of the subsequent calls is to a KNOWN_HOOK
                // or if it's the first external call from PoolManager, it might be the hook.
                // This is a simplification; real hook data decoding is complex.
                return callNode.calls?.map(c => c.to).find(addr => KNOWN_HOOK[addr?.toLowerCase()])?.toLowerCase();
            }
        } catch (_) { /* ignore parsing errors */ }
    }

    if (callNode.from?.toLowerCase() === UNISWAP_V4_POOL_MANAGER_ADDRESS &&
        KNOWN_HOOK[callNode.to?.toLowerCase()]) {
        return callNode.to.toLowerCase();
    }

    return callNode.calls?.map(detectHookAddress).find(Boolean) || null;
}


function inferHookFromCallGraph(callNode) {
    if (!callNode) return null;
    if (callNode.from?.toLowerCase() === UNISWAP_V4_POOL_MANAGER_ADDRESS && callNode.to) {
        return callNode.to.toLowerCase();
    }
    return callNode.calls?.map(inferHookFromCallGraph).find(Boolean) || null;
}


async function parseTraceCalls(callNode, depth, detectedHookAddress, processedCalls = []) {
    if (!callNode) return processedCalls;

    const callType = getCallType(callNode, detectedHookAddress);

    const { functionName, params, returns } = await decodeCallDetails(callNode, callType);

    const isHookLifecycleEvent = HOOK_LIFECYCLE_FUNCTION_NAMES.has(functionName);

    processedCalls.push({
        type: callNode.type,
        from: callNode.from,
        to: callNode.to,
        value: ethers.formatEther(BigInt(callNode.value || '0')),
        gasUsed: callNode.gasUsed,
        depth: depth,
        functionName: functionName,
        params: params,
        returns: returns,
        callType: callType,
        isHookLifecycleEvent: isHookLifecycleEvent,
    });

    if (callNode.calls) {
        for (const childCall of callNode.calls) {
            await parseTraceCalls(childCall, depth + 1, detectedHookAddress, processedCalls);
        }
    }
    return processedCalls;
}


async function debugTransaction(txHash) {
    console.log(`TraceAnalyzer: Received request to trace transaction: ${txHash}`);

    try {
        const trace = await fetchTxTrace(txHash);

        if (!trace || !trace.calls || trace.calls.length === 0) {
            return emptyTraceResponse(txHash);
        }

        const rootCall = trace.calls[0];

        let hookAddr = detectHookAddress(rootCall);
        if (!hookAddr) hookAddr = inferHookFromCallGraph(rootCall);

        const processed = await parseTraceCalls(rootCall, 0, hookAddr);
        const permissions = hookAddr ? decodeHookPermissions(hookAddr) : {};

        console.log(`TraceAnalyzer: Processed trace for ${txHash}. Found ${processed.length} calls.`);
        console.log(`TraceAnalyzer: Detected Hook Address: ${hookAddr || 'None'}`);

        return { success: true, txHash, trace: processed, detectedHookAddress: hookAddr, hookPermissions: permissions };

    } catch (error) {
        console.error(`TraceAnalyzer: Error tracing transaction ${txHash}:`, error);
        throw new Error(`Trace failed: ${error.message || 'Unknown error'}`);
    }
}

module.exports = {
    debugTransaction
};