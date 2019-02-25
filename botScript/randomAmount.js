async function RandomAmountDistribution(AVG_AMT_COIN, PROBABILITY_DISTRIBUTION, DELTA_MAX_IN_PERCENT) {

    /**
     * COINS - stores the actual amount of coins in an array depending on the multiple factor fixed.
     * PROBABILITIES - stores the probabilities of the amount of coins in an array.
     */
    const COINS = PROBABILITY_DISTRIBUTION.map(distributionObject => +(distributionObject.multipleFactor*AVG_AMT_COIN).toFixed(8));
    const PROBABILITIES = PROBABILITY_DISTRIBUTION.map(probabilityObject => +(probabilityObject.probability/100).toFixed(8))

    function addSubtractDelta() {
        return Math.random() >= 0.5 ? true : false;
    }

    return function() {
        let randomNumber = Math.random();
        let deltaMax = DELTA_MAX_IN_PERCENT/100;
        let currentProbability = PROBABILITIES[0];
        let totalProbabilities = PROBABILITIES.length;

        let foundCoin = null;
        for(let i = 1; i < totalProbabilities; ++i) {
            if(randomNumber < currentProbability) {
                foundCoin = COINS[i-1];
                if(i == 1) {
                    deltaMax/=2; 
                }
                break;
            }
            currentProbability+=PROBABILITIES[i];
        }

        if(!foundCoin) {
            foundCoin = COINS[totalProbabilities-1];
        }

        const finalCoin = foundCoin + (addSubtractDelta() ? Math.random()*(deltaMax)*AVG_AMT_COIN : (0 - Math.random()*(deltaMax)*AVG_AMT_COIN));
        return finalCoin.toFixed(8);
    }
}

module.exports = RandomAmountDistribution;