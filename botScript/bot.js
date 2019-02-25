const RandomAmountDistribution = require('./randomAmount')
const cryptokartService = require('./cryptokartTrade');

const AMT_AVG = 100;
const DELTA_MAX_IN_PERCENT = 50; // to make sure the values are continuous and not discrete...
const market = process.argv[2];
const INTERVAL_BEGIN_TIME = 800; // in seconds...
const INTERVAL_END_TIME = 928; // therefore, avg mins = 14.4, i.e 864seconds

const PROBABILITY_DISTRIBUTION = [
    {
        multipleFactor: 0.5,
        probability: 61
    },
    {
        multipleFactor: 1,
        probability: 30
    },
    {
        multipleFactor: 2,
        probability: 3
    },
    {
        multipleFactor: 3,
        probability: 0.5
    },
    {
        multipleFactor: 4,
        probability: 0.5
    },
    {
        multipleFactor: 5,
        probability: 3
    },
    {
        multipleFactor: 6,
        probability: 0.5
    },
    {
        multipleFactor: 7,
        probability: 0.5
    },
    {
        multipleFactor: 8,
        probability: 0.5
    },
    {
        multipleFactor: 9,
        probability: 0.5
    }
];

/**
 * Market Side
 * 1 - Sell
 * 2 - Buy
 */
function getRandomMarketSide() {
    return (parseInt(Math.random()*2)+1);
}

/**
 * 1. Logic to Trade
 * 2. Clearing the previous timeout
 * 3. Starting a new timeout with a random delay between the BEGIN and END time
 */

let tradingInterval;

const tradeNow = async () => {
    clearTimeout(tradingInterval);

    const marketSide = getRandomMarketSide();
    // INITIALIZE THE RANDOM COIN AMOUNT GENERATOR BASED ON THE PROBABILITY DISTRIBUTION
    // future addition - provide a delta to be added/subtracted from the random coin amt being generated..
    const marketLTP = await cryptokartService.getMarketLTP(market);
    const marketAvgAmount = AMT_AVG/marketLTP;

    const coinAmt = await RandomAmountDistribution(marketAvgAmount, PROBABILITY_DISTRIBUTION, DELTA_MAX_IN_PERCENT);

    await cryptokartService.placeMarketOrder(coinAmt, marketSide);
   
    const nextOrderTimePause = (INTERVAL_BEGIN_TIME + (INTERVAL_END_TIME - INTERVAL_BEGIN_TIME)*Math.random());
    tradingInterval = setTimeout(tradeNow, nextOrderTimePause * 1000);
    console.log(`\n## Current Time : ${new Date()}. Next order in ${nextOrderTimePause/60} minutes...\n`);
}

tradeNow();