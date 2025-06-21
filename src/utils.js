const { ethers } = require('ethers');
const axios = require('axios');


let abiMapRef;
let etherscanApiKeyRef;
let uniswapPoolManagerAddressRef;
let knownHookAddressesRef;
let hookPermissionsMaskMapRef;
let hookInterfaceRef;

let Api_url = 'https://api.uniscan.xyz/api';


function setAbiMap(abiMap) {
    abiMapRef = abiMap;
}

function setEtherscanApiKey(key) {
    etherscanApiKeyRef = key;
}

function setUniswapPoolManagerAddress(address) {
    uniswapPoolManagerAddressRef = address;
}

function setKnownHookAddresses(hooks) {
    knownHookAddressesRef = hooks;
}

function setHookPermissionsMaskMap(maskMap) {
    hookPermissionsMaskMapRef = maskMap;
}

function setHookInterface(iface) {
    hookInterfaceRef = iface;
}



async function fetchAbiFromEtherscan(contractAddress) {
    const checksumAddress = ethers.getAddress(contractAddress);

    if (abiMapRef[checksumAddress]) {
        return abiMapRef[checksumAddress];
    }

    try {
        const response = await axios.get(Api_url, {
            params: {
                module: 'contract',
                action: 'getabi',
                address: checksumAddress,
                apikey: etherscanApiKeyRef
            }
        });

        if (response.data.status === '1' && response.data.result) {
            const abi = JSON.parse(response.data.result);
            if (abi.length > 0) { // check its not empty
                const iface = new ethers.Interface(abi);
                abiMapRef[checksumAddress] = iface; // save 
                console.log(`Utils: Fetched and cached ABI for ${checksumAddress}`); 
                return iface;
            }
        }
        console.log(`Utils: No ABI found on Etherscan for ${checksumAddress}`); 
        return null;
    } catch (error) {
        console.error(`Utils: Error fetching ABI for ${checksumAddress} from Etherscan:`, error.message); 
        return null;
    }
}



async function decodeCallDetails(call, callType) {
    const toAddress = call.to ? call.to.toLowerCase() : '';
    const inputData = call.input;
    const outputData = call.output;

    let functionName = 'Unknown';
    let params = 'N/A';
    let returns = 'N/A';
    let iface = abiMapRef[toAddress];

    if (!iface) {
        iface = await fetchAbiFromEtherscan(toAddress);
        // not found 
        if (!iface && callType === 'Hook') {
            iface = hookInterfaceRef; 
        }
    }

    if (iface) {
        try {
            // decode name
            const decodedCall = iface.parseTransaction({ data: inputData });
            if (decodedCall) {
                functionName = decodedCall.name;
                // format as json
                const args = {};
                decodedCall.fragment.inputs.forEach((input, index) => {
                    args[input.name] = decodedCall.args[index];
                });
                params = JSON.stringify(args, (key, value) => {
                    if (typeof value === 'bigint') {
                        return value.toString(); // convert for json
                    }
                    return value;
                }, 2);
            }
        } catch (e) {
            // couldn't decode
            functionName = `Unknown (${inputData.substring(0, 10)}...)`;
        }

        try {
            // decode return values
            if (outputData && outputData !== '0x') {
                const funcFragment = iface.getFunction(functionName);
                if (funcFragment && funcFragment.outputs && funcFragment.outputs.length > 0) {
                    const decodedReturns = iface.decodeFunctionResult(functionName, outputData);
                    const returnArgs = {};
                    funcFragment.outputs.forEach((output, index) => {
                        returnArgs[output.name || `_output${index}`] = decodedReturns[index];
                    });
                    returns = JSON.stringify(returnArgs, (key, value) => {
                        if (typeof value === 'bigint') {
                            return value.toString();
                        }
                        return value;
                    }, 2);
                }
            }
        } catch (e) {
            // could not decode output 
        }
    } else {
        // no abi = show raw selector 
        if (inputData && inputData.length >= 10) {
            functionName = `Unknown (${inputData.substring(0, 10)}...)`;
        }
    }

    return { functionName, params, returns };
}



function getCallType(call, detectedHookAddress) {
    const toAddress = call.to ? call.to.toLowerCase() : '';
    if (toAddress === uniswapPoolManagerAddressRef) {
        return 'PoolManager';
    }
    if (detectedHookAddress && toAddress === detectedHookAddress.toLowerCase()) {
        return 'Hook';
    }
    if (knownHookAddressesRef[toAddress]) {
        return 'Hook'; 
    }
    return 'External';
}



function decodeHookPermissions(hookAddress) {
    const permissions = {};
    if (!hookAddress || hookAddress.length !== 66) { // 0x + 64 hex 
        for (const name in hookPermissionsMaskMapRef) {
            permissions[name] = false;
        }
        return permissions;
    }

    // convert 
    const hookAddressBigInt = BigInt(hookAddress);

    for (const name in hookPermissionsMaskMapRef) {
        const bitPosition = hookPermissionsMaskMapRef[name];
        // check if matches 
        permissions[name] = ((hookAddressBigInt >> BigInt(bitPosition)) & BigInt(1)) === BigInt(1);
    }
    return permissions;
}



// generated graph cuz I'm sligtly lazy
function generateMermaidDiagramData(processedCalls, detectedHookAddress) {
    if (!processedCalls || processedCalls.length === 0) {
        return "graph TD\n  A[No trace data available] --> B[No diagram generated]";
    }

    let mermaidGraph = "graph TD\n"; // Changed to flowchart (graph TD) 
    let nodeCounter = 0;
    const nodeMap = new Map(); // Maps call index to a unique node ID 
    const callStack = []; // To manage nesting and represent call/return flow 

    // Define main participants for visual distinction 
    mermaidGraph += `  subgraph Actors\n`;
    mermaidGraph += `    PM[PoolManager]\n`;
    if (detectedHookAddress) {
        // Use a shorter, more consistent representation for the hook address in the diagram 
        mermaidGraph += `    HO[Hook: ${detectedHookAddress.substring(0, 8)}...]\n`;
    }
    mermaidGraph += `    EXT[External Account]\n`;
    mermaidGraph += `  end\n\n`;

    // Create a starting node for the transaction 
    const startNodeId = `N${nodeCounter++}`;
    mermaidGraph += `  ${startNodeId}("Tx Start: ${processedCalls[0].from.substring(0, 8)}...")\n`;
    let previousNodeId = startNodeId;

    // IMPORTANT: Refined sanitizeAndTruncate for robust Mermaid text handling 
    const sanitizeAndTruncate = (text, maxLength = 40) => {
        if (typeof text !== 'string') text = String(text); // Ensure it's a string 
        let sanitized = text
            .replace(/\r?\n|\r/g, ' ') // Replace all newlines (CRLF, LF, CR) with a space 
            .replace(/\s+/g, ' ')     // Replace multiple spaces with single space 
            .replace(/"/g, '')        // Remove all double quotes 
            .replace(/'/g, '')        // Remove all single quotes 
            .replace(/`/g, '')        // Remove all backticks (important for Mermaid's code blocks) 
            .replace(/[<>{}[\]()]/g, '') // Remove HTML-like tags and common Mermaid structural characters 
            .replace(/\\/g, '\\\\')   // Escape backslashes 
            .replace(/#/g, '');       // Remove hash symbols, which can also be problematic in some contexts 

        // Further restrict to common alphanumeric and basic punctuation safe for labels 
        sanitized = sanitized.replace(/[^a-zA-Z0-9\s:.,-]/g, ''); // Keep letters, numbers, spaces, colon, period, hyphen 

        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength) + '...';
        }
        return sanitized.trim();
    };


    processedCalls.forEach((call, index) => {
        const currentNodeId = `N${nodeCounter++}`;
        nodeMap.set(index, currentNodeId);

        // Sanitize the function name as well, as it forms the base of the label 
        let nodeLabel = sanitizeAndTruncate(call.functionName, 30);

        let nodeShape = `[${nodeLabel}]`; // Default to rectangular shape 

        const details = [];

        if (call.params && call.params !== 'N/A' && call.params !== '{}') {
            const paramsString = sanitizeAndTruncate(call.params);
            if (paramsString) {
                details.push(`P: ${paramsString}`);
            }
        }
        if (call.returns && call.returns !== 'N/A' && call.returns !== '{}') {
            const returnsString = sanitizeAndTruncate(call.returns);
            if (returnsString) {
                details.push(`R: ${returnsString}`);
            }
        }

        if (details.length > 0) {
            // Join details with <br> for new lines within the node text 
            nodeLabel += `<br>${details.join('<br>')}`;
        }

        // Apply specific node shapes based on call type 
        if (call.callType === 'PoolManager') {
            nodeShape = `(${nodeLabel})`; // Rounded for PoolManager 
        } else if (call.callType === 'Hook') {
            nodeShape = `{${nodeLabel}}`; // Rhombus for Hooks 
        }

        // Adjust node shape for hook lifecycle events for visual emphasis 
        if (call.isHookLifecycleEvent) {
            nodeShape = `{{${nodeLabel}}}`; // Double rounded for hook events 
        } else if (!['PoolManager', 'Hook'].includes(call.callType)) {
            nodeShape = `[${nodeLabel}]`; // Default to rectangular for other calls if not a special type 
        }

        // Define the node for the current call 
        mermaidGraph += `  ${currentNodeId}${nodeShape}\n`;

        // Establish connections based on depth 
        if (call.depth > callStack.length) { // New nested call 
            mermaidGraph += `  ${previousNodeId} --> ${currentNodeId}\n`;
            callStack.push(previousNodeId); // Push parent onto stack 
        } else if (call.depth < callStack.length) { // Returning from nested call(s) 
            while (call.depth < callStack.length && callStack.length > 0) {
                callStack.pop(); // Pop until correct depth 
            }
            const parentOfCurrent = callStack.length > 0 ? callStack[callStack.length - 1] : startNodeId;
            mermaidGraph += `  ${parentOfCurrent} --> ${currentNodeId}\n`;
        } else { // Sibling call at same depth
            const siblingParent = callStack.length > 0 ? callStack[callStack.length - 1] : startNodeId;
            mermaidGraph += `  ${siblingParent} --> ${currentNodeId}\n`;
        }
        previousNodeId = currentNodeId;
    });

    // Add an end node 
    const endNodeId = `N${nodeCounter++}`;
    mermaidGraph += `  ${endNodeId}[Tx End]\n`;
    mermaidGraph += `  ${previousNodeId} --> ${endNodeId}\n`;

    // Add CSS styling for nodes based on their type 
    mermaidGraph += `\nstyle PM fill:#f9f,stroke:#333,stroke-width:2px\n`; // PoolManager 
    mermaidGraph += `style HO fill:#ccf,stroke:#333,stroke-width:2px\n`; // Hook
    mermaidGraph += `style EXT fill:#fcf,stroke:#333,stroke-width:2px\n`; // External 

    // Add styles for hook lifecycle events for visual emphasis 
    processedCalls.forEach((call, index) => {
        if (call.isHookLifecycleEvent) {
            const nodeId = nodeMap.get(index);
            if (nodeId) {
                mermaidGraph += `  style ${nodeId} fill:#c8f0c8,stroke:#008000,stroke-width:2px,color:#000;\n`;
            }
        }
    });

    return mermaidGraph;
}


module.exports = {
    fetchAbiFromEtherscan,
    decodeCallDetails,
    getCallType,
    decodeHookPermissions,
    setAbiMap,
    setEtherscanApiKey,
    setUniswapPoolManagerAddress,
    setKnownHookAddresses,
    setHookPermissionsMaskMap,
    setHookInterface
};