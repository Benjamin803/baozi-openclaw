import assert from 'assert';
import { BaoziClient } from '../src/baozi';
import axios from 'axios';

// Mock axios
const originalGet = axios.get;
let mockResponse: any = {};

// Override axios.get
// @ts-ignore
axios.get = async (url: string) => {
    return { data: mockResponse };
};

async function testParsing() {
    console.log("Testing Market Parsing...");
    
    mockResponse = {
        success: true,
        data: {
            binary: [
                {
                    marketId: 1,
                    question: "Will BTC hit 100k?",
                    status: "Active",
                    isBettingOpen: true,
                    totalPoolSol: 10.5,
                    yesPercent: 60,
                    noPercent: 40,
                    closingTime: new Date(Date.now() + 100000).toISOString(),
                    category: "Crypto"
                }
            ]
        }
    };

    const client = new BaoziClient();
    const markets = await client.getAllMarkets();
    
    assert.strictEqual(markets.length, 1);
    assert.strictEqual(markets[0].question, "Will BTC hit 100k?");
    assert.strictEqual(markets[0].totalPoolSol, 10.5);
    console.log("✅ Parsing test passed");
}

async function testSorting() {
    console.log("Testing sorting...");
    mockResponse = {
        success: true,
        data: {
            binary: [
                { marketId: 1, totalPoolSol: 10, status: "Active", isBettingOpen: true, closingTime: new Date().toISOString() },
                { marketId: 2, totalPoolSol: 20, status: "Active", isBettingOpen: true, closingTime: new Date().toISOString() }
            ]
        }
    };
    
    const client = new BaoziClient();
    const top = await client.getTopMarkets(2);
    
    assert.strictEqual(top[0].marketId, 2); // Should be sorted descending
    assert.strictEqual(top[1].marketId, 1);
    console.log("✅ Sorting test passed");
}

async function runTests() {
    try {
        await testParsing();
        await testSorting();
        console.log("All tests passed!");
    } catch (e) {
        console.error("Test failed:", e);
        process.exit(1);
    }
}

runTests();
