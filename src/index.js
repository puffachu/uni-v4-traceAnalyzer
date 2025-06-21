
const { debugTransaction } = require('./traceAnalyzer');

async function main() {
    if (typeof debugTransaction !== 'function') {
        console.error('Error: check if `traceAnalyzer.js` exists.');
        console.error('Please ensure Apis are configured.');
        process.exit(1);
    }

    const args = process.argv.slice(2);
    const txHash = args[0];

    if (!txHash) {
        console.error('Usage: node src/index.js <TRANSACTION_HASH>');
        console.error('Example: node src/index.js 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
        process.exit(1);
    }

    if (!txHash.startsWith('0x') || txHash.length !== 66) {
        console.error('Error: Invalid transaction hash format. Must be a 0x-prefixed 66-character string.');
        process.exit(1);
    }

    try {
        const result = await debugTransaction(txHash); // all core login here

        // --- start displaying ---

        console.log(`\n--- Uniswap V4 Hook Debugger Report for Transaction: ${result.txHash} ---`);
        console.log(`Success: ${result.success}`);

        if (result.detectedHookAddress) {
            console.log(`\nDetected Hook Address: ${result.detectedHookAddress}`);
            console.log('Hook Permissions:');
            for (const [permission, granted] of Object.entries(result.hookPermissions)) {
                console.log(`  - ${permission}: ${granted ? '✅ GRANTED' : '❌ NOT GRANTED'}`);
            }
        } else {
            console.log('\nNo specific Hook Address detected in this trace.');
        }

        console.log('\n--- Transaction Call Trace ---');
        if (result.trace && result.trace.length > 0) {
            result.trace.forEach(call => {
                const indent = '  '.repeat(call.depth);
                console.log(`${indent}[${call.type.toUpperCase()}] From: ${call.from} -> To: ${call.to}`);
                console.log(`${indent}  Function: ${call.functionName} (Call Type: ${call.callType})`);
                if (call.value && call.value !== '0.0') {
                    console.log(`${indent}  Value: ${call.value} ETH`);
                }
                console.log(`${indent}  Gas Used: ${BigInt(call.gasUsed).toString()}`);
                if (call.params && call.params !== 'N/A' && call.params !== '{}') {
                    // print nicely
                    try {
                        const parsedParams = JSON.parse(call.params);
                        console.log(`${indent}  Parameters:`);
                        Object.entries(parsedParams).forEach(([key, value]) => {
                            console.log(`${indent}    ${key}: ${value}`);
                        });
                    } catch (e) {
                        console.log(`${indent}  Parameters: ${call.params}`);
                    }
                }
                if (call.returns && call.returns !== 'N/A' && call.returns !== '{}') {
                    // print nicely
                    try {
                        const parsedReturns = JSON.parse(call.returns);
                        console.log(`${indent}  Returns:`);
                        Object.entries(parsedReturns).forEach(([key, value]) => {
                            console.log(`${indent}    ${key}: ${value}`);
                        });
                    } catch (e) {
                        console.log(`${indent}  Returns: ${call.returns}`);
                    }
                }
                console.log(`${indent}  ${'-'.repeat(20)}`); 
            });
        } else {
            console.log('No detailed trace available.');
        }

        console.log('\n--- End ---');

    } catch (error) {
        console.error(`Error during transaction debugging: ${error.message}`);
        process.exit(1);
    }
}

main();
