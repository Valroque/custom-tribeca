const request = require('request');
const CLIENT_ID = process.env.NODE_ENV === 'production' ? 'd48faf86-bc4e-4e0b-b3b6-3b37f03e3c7e' : 'ed1d9e30-1d49-4e82-bb40-740b52bc2786';
const CLIENT_SECRET = process.env.NODE_ENV === 'production' ? '3c5f0143-a48c-4f3f-80c0-17908ee3f258' : 'aed3e712-af2f-4d60-8011-5d4c08cedfb6';
const TRIBECA_BOT_ID = 56;
// const tradingEngineURL = 'http://13.127.78.141:8080';
// const tradingEngineURLprod = 'http://13.127.5.194:8080';
const tradingEngineURL = process.env.NODE_ENV && (process.env.NODE_ENV === 'production') ? 'http://13.127.5.194:8080' : 'http://13.127.78.141:8080';

async function sendPostRequest(url, requestBody) {
    return new Promise((resolve, reject) => {
        requestBody['client_id'] = CLIENT_ID;
        requestBody['client_secret'] = CLIENT_SECRET;

        //console.log(requestBody);

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

function getJSON(url) {
    return new Promise((resolve, reject) => {
        request({
            url,
            method: 'GET'
        }, (err, body, resp) => {
            if(err) {
                reject(err);
            } else {
                resolve(JSON.parse(resp));
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
            if (result.error) {
                //console.log(result);
                throw Error(result);
            }
    
            const topOrder = result.result.orders[0];
            if(topOrder) {
                resolve(topOrder.user === TRIBECA_BOT_ID ? 'TRIBECA' : 'NOT_TRIBECA');
            } else {
                resolve('NO_OPEN_ORDERS');
            }
        })
        .catch(err => {
            console.error(`--> ERROR ENCOUNTERED WHILE CHECKING FOR TOP ORDER ON ${marketSide == 1 ? 'SELL' : 'BUY'} SIDE : `);
            console.log(err);
            reject('ERROR_CHECKING_TOP_ORDER');
        })
    });
}

// LTP - Last Traded Price
module.exports = {
    getMarketLTP: market => {
        return new Promise((resolve, reject) => {
            return getJSON('https://api.binance.com/api/v3/ticker/price?symbol=' + market)
                .then(data => {
                    resolve(Number(data.price));
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
                    57,
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
            const topOrderUser = await checkTopOrderUser(otherSide, market);

            switch(topOrderUser) {
                case 'TRIBECA':
                    sendPostRequest(tradingEngineURL, requestBody)
                    .then((result) => {
                        if(result.error) {
                            Promise.reject(result.error.message);
                        } else {
                            console.log(`DEAL OCCURRED : `, result.result);
                        }
                    })
                    .catch((err) => {
                        console.error(`--> ERROR ENCOUNTERED WHILE PLACING MARKET ORDER OF AMOUNT ${coinAmt} ON ${marketSide == 1 ? 'SELL' : 'BUY'} SIDE : `);
                        console.error(err);
                        throw "ERROR_PLACING_MARKET_ORDER";
                    })
                    break;
                    
                case 'NOT_TRIBECA':
                    console.log(`## ORDER ON ${otherSide == 1 ? 'SELL' : 'BUY'} SIDE IS NOT OF TRIBECA. SKIPPING THE ORDER...`);
                    break;
                
                case 'NO_OPEN_ORDERS':
                    console.log(`## NO OPEN ORDERS ON ${otherSide == 1 ? 'SELL' : 'BUY'} SIDE. SKIPPING THE ORDER...`);
                    break;
                
                default:
                    console.log("## ERROR IN CHECKING TOP ORDER : ", topOrderUser);
                    break;
            }
    
        } catch (e) {
            console.error("--> ERROR TOPIC : ",e);
            return;
        }
    
    }
}
