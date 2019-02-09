const RandomAmountDistribution = require('./randomAmount')
const PlaceMarketOrder = require('./cryptokartTrade');

const AMT_AVG = 100;
const AVG_AMT_COIN = 0.0286;
const COIN_PRICE = 3500;

const INTERVAL_BEGIN_TIME = 1;
const INTERVAL_END_TIME = 4;

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

// INITIALIZE THE RANDOM COIN AMOUNT GENERATOR BASED ON THE PROBABILITY DISTRIBUTION
// future addition - provide a delta to be added/subtracted from the random coin amt being generated..
const getRandomAmount = RandomAmountDistribution(AVG_AMT_COIN, PROBABILITY_DISTRIBUTION);

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
    const coinAmt = getRandomAmount();

    await PlaceMarketOrder(coinAmt, marketSide);
   
    tradingInterval = setTimeout(tradeNow, (INTERVAL_BEGIN_TIME + (INTERVAL_END_TIME - INTERVAL_BEGIN_TIME)*Math.random()) * 1000);
}

tradeNow();