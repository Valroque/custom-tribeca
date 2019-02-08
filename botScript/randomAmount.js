function RandomAmountDistribution(COINS, PROBABILITIES) {

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