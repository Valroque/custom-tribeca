const request = require('request');
const CLIENT_ID = '09ad67fa-4d9a-433f-b647-7a68282b8ecc';
const CLIENT_SECRET = '8a408794-ceef-4cc6-8db2-4c810b2f8de7';
const TRIBECA_BOT_ID = 49;
const tradingEngineURL = 'http://13.127.78.141:8080';

async function sendPostRequest(url, requestBody) {
    return new Promise((resolve, reject) => {
        requestBody['client_id'] = CLIENT_ID;
        requestBody['client_secret'] = CLIENT_SECRET;

        request({
            url,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            json: requestBody
        }, (err, body, resp) => {
            if (err) {
                reject(err);
            } else {
                resolve(resp);
            }
        })
    })
}

function checkTopOrderUser(marketSide, market) {
    return new Promise((resolve, reject) => {
        const requestBody = {
            "id": 1,
            "method":"order.book",
            "params":[
                market,
                marketSide,
                0,
                10
            ]
        }
    
        return sendPostRequest(tradingEngineURL, requestBody)
        .then( result => {
            if (result.error) throw Error(result.error);
    
            const topOrder = result.result.orders[0];
            if(topOrder) {
                resolve(topOrder.user === TRIBECA_BOT_ID ? 'TRIBECA' : 'NOT_TRIBECA');
            } else {
                resolve('NO_OPEN_ORDERS');
            }
        })
        .catch(err => {
            console.error(`--> ERROR ENCOUNTERED WHILE CHECKING FOR TOP ORDER ON ${marketSide == 1 ? 'SELL' : 'BUY'} SIDE : `, err);
            reject('ERROR_CHECKING_TOP_ORDER');
        })
    });
}

// LTP - Last Traded Price
module.exports = {
    getMarketLTP: market => {
        return new Promise((resolve, reject) => {
            const requestBody = {
                id: 1,
                method: 'market.last',
                params: [
                    market
                ]
            }

            return sendPostRequest(tradingEngineURL, requestBody)
                .then(data => {
                    if (data.error) throw Error(data.error);

                    resolve(Number(data.result));
                })
                .catch(err => {
                    reject(err);
                })
        })
    },

    placeMarketOrder: async (coinAmt, marketSide, market) => {    
        try {
            const requestBody = {
                "id": 1,
                "method":"order.put_market",
                "params":[
                    1,
                    market,
                    marketSide,
                    coinAmt.toString(), 
                    "0",
                    "api.v1"
                ]
            }
        
            /**
             * check whether the other side has tribeca's order or not.
             * if yes, proceed.
             * if no, don't place an order
             */
        
            const otherSide = marketSide === 1 ? 2 : 1;

            console.log(`\n## INITIATING A MARKET ORDER OF ${coinAmt} COINS ON ${marketSide == 1 ? 'SELL' : 'BUY'} SIDE...`);
            const topOrderUser = await checkTopOrderUser(otherSide);

            switch(topOrderUser) {
                case 'TRIBECA':
                    sendPostRequest(MARKET_ORDER_URL, requestBody)
                    .then((result) => {
                        if(result.error) {
                            Promise.reject(result.error.message);
                        } else {
                            console.log(`DEAL OCCURRED : `, result.result);
                        }
                    })
                    .catch((err) => {
                        console.error(`--> ERROR ENCOUNTERED WHILE PLACING MARKET ORDER OF AMOUNT ${coinAmt} ON ${marketSide == 1 ? 'SELL' : 'BUY'} SIDE : `, err);
                        throw "ERROR_PLACING_MARKET_ORDER";
                    })
                    break;
                    
                case 'NOT_TRIBECA':
                    console.log(`## ORDER ON ${otherSide == 1 ? 'SELL' : 'BUY'} SIDE IS NOT OF TRIBECA. SKIPPING THE ORDER...`);
                    break;
                
                case 'NO_OPEN_ORDERS':
                    console.log(`## NO OPEN ORDERS ON ${otherSide == 1 ? 'SELL' : 'BUY'} SIDE. SKIPPING THE ORDER...`);
                    break;
            }
    
        } catch (e) {
            console.error("--> ERROR TOPIC : ",e);
            return;
        }
    
    }
}