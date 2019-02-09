function RandomAmountDistribution(AVG_AMT_COIN, PROBABILITY_DISTRIBUTION) {

    /**
     * COINS - stores the actual amount of coins in an array depending on the multiple factor fixed.
     * PROBABILITIES - stores the probabilities of the amount of coins in an array.
     */
    const COINS = PROBABILITY_DISTRIBUTION.map(distributionObject => +(distributionObject.multipleFactor*AVG_AMT_COIN).toFixed(8));
    const PROBABILITIES = PROBABILITY_DISTRIBUTION.map(probabilityObject => +(probabilityObject.probability/100).toFixed(8))

    return function() {
        let randomNumber = Math.random();
        let currentProbability = PROBABILITIES[0];
        let totalProbabilities = PROBABILITIES.length;

        for(let i = 1; i < totalProbabilities; ++i) {
            if(randomNumber < currentProbability) {
                return COINS[i-1];
            }
            currentProbability+=PROBABILITIES[i];
        }

        return COINS[totalProbabilities-1];
    }
}

module.exports = RandomAmountDistribution;