const request = require('request');

const CLIENT_ID = '7c44fe3e-afc0-41d3-ae13-da6a76889534';
const CLIENT_SECRET = '217ba7ee-f3f0-4cb2-a71d-30669ea95baf';
const TRIBECA_BOT_ID = 2;

function sendPostRequest(REQUEST_BODY) {
    const URL = `http://test.cryptokart.io:8080`;
    return new Promise((resolve, reject) => {
        request({
            url: URL,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'clientId': CLIENT_ID,
                'clientSecret': CLIENT_SECRET
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
    const requestBody = {
        "id": 1,
        "method":"order.book",
        "params":[
            "BCHBTC",
            1,
            0,
            10
          ]
     }

     sendPostRequest(requestBody)
     .then((result) => {
         console.log(result);
     })
}

function placeMarketOrder() {
    const requestBody = {
        "id": 1,
        "method":"order.put_market",
        "params":[
             1,
             "BTCUSDT",
             1,
             "0.1", 
             "0.002",
             "api.v1"
        ]
     }

     sendPostRequest(requestBody)
     .then((result) => {
         console.log(result);
     })
}