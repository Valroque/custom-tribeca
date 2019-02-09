const request = require('request');

const CLIENT_ID = '7c44fe3e-afc0-41d3-ae13-da6a76889534';
const CLIENT_SECRET = '217ba7ee-f3f0-4cb2-a71d-30669ea95baf';
const TRIBECA_BOT_ID = 10;
const MARKET = "BTCUSDT";
const ORDERBOOK_URL = 'http://13.127.78.141:8080'; //'https://test.cryptokart.io:1337/matchengine/order/book';
const MARKET_ORDER_URL = 'http://13.127.78.141:8080'; //'https://test.cryptokart.io:1337/matchengine/order/putMarket';

function sendPostRequest(URL, REQUEST_BODY) {
    return new Promise((resolve, reject) => {
        REQUEST_BODY['client_id'] = CLIENT_ID;
        REQUEST_BODY['client_secret'] = CLIENT_SECRET;
        request({
            url: URL,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            json: REQUEST_BODY
        }, (err, body, resp) => {
            if (err) {
                reject(err);
            } else {
                resolve(resp);
            }
        })
    })
}

function checkTopOrderUser(marketSide) {
    // const requestBody = {
    //     'market_name': MARKET,
    //     'side': marketSide,
    //     'offset': 0,
    //     'limit': 10
    // }

    const requestBody = {
        "id": 1,
        "method":"order.book",
        "params":[
            MARKET,
            marketSide,
            0,
            10
        ]
    }

    return sendPostRequest(ORDERBOOK_URL, requestBody)
    .then((result) => {
        const topOrder = result.result.orders[0];
        if(topOrder) {
            return (topOrder.user === TRIBECA_BOT_ID ? 'TRIBECA' : 'NOT_TRIBECA')
        } else {
            return 'NO_OPEN_ORDERS';
        }
    })
    .catch((err) => {
        console.error(`--> ERROR ENCOUNTERED WHILE CHECKING FOR TOP ORDER ON ${marketSide == 1 ? 'SELL' : 'BUY'} SIDE : `, err);
        return Promise.reject('ERROR_CHECKING_TOP_ORDER');
    })
}

async function placeMarketOrder(coinAmt, marketSide) {
    // const requestBody = {
    //     "market_name" : MARKET,
    //     "side" : marketSide,
    //     "amount" : coinAmt
    // }

    const requestBody = {
        "id": 1,
        "method":"order.put_market",
        "params":[
            1,
            MARKET,
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

    try {
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

module.exports = placeMarketOrder;