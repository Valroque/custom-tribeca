const RandomAmountDistribution = require('./randomAmount')

const AMT_AVG = 100;
const AVG_AMT_COIN = 0.0286;
const COIN_PRICE = 3500;

const INTERVAL_BEGIN_TIME = 2;
const INTERVAL_END_TIME = 6;

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
 * AMT_COINS - stores the actual amount of coins in an array depending on the multiple factor fixed.
 * PROBABILITY_COINS - stores the probabilities of the amount of coins in an array.
 */
const AMT_COINS = PROBABILITY_DISTRIBUTION.map(distributionObject => +(distributionObject.multipleFactor*AVG_AMT_COIN).toFixed(8));
const PROBABILITY_COINS = PROBABILITY_DISTRIBUTION.map(probabilityObject => +(probabilityObject.probability/100).toFixed(8))

// INITIALIZE THE RANDOM COIN AMOUNT GENERATOR BASED ON THE PROBABILITY DISTRIBUTION
const getRandomAmount = RandomAmountDistribution(AMT_COINS, PROBABILITY_COINS);


/**
 * 1. Logic to Trade
 * 2. Clearing the previous timeout
 * 3. Starting a new timeout with a random delay between the BEGIN and END time
 */
const tradeNow = () => {
    console.log(`TRADED on ${new Date()} Value : `, getRandomAmount());
    clearTimeout(beginTradingInterval);
    beginTradingInterval = setTimeout(tradeNow, (INTERVAL_BEGIN_TIME + (INTERVAL_END_TIME - INTERVAL_BEGIN_TIME)*Math.random()) * 1000);
}


/**
 * BEGIN TRADING WITH INITIAL DELAY OF BEGIN TIME...
 */
let beginTradingInterval = setTimeout(() => {
    tradeNow();
}, Math.random() * INTERVAL_BEGIN_TIME * 1000)
