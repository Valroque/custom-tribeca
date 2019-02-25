/// <reference path="../utils.ts" />
/// <reference path="../../common/models.ts" />
/// <reference path="nullgw.ts" />
/// <reference path="../interfaces.ts"/>

import Config = require("../config");
import crypto = require('crypto');
import request = require('request');
import url = require("url");
import querystring = require("querystring");
import NullGateway = require("./nullgw");
import Models = require("../../common/models");
import Utils = require("../utils");
import Interfaces = require("../interfaces");
import io = require("socket.io-client");
import moment = require("moment");
import util = require("util");
import * as Q from "q";
import log from "../logging";
import WebSocket = require('ws');
import _ = require('lodash');
const shortId = require("shortid");
const SortedMap = require("collections/sorted-map");

const _lotMultiplier = 1;

//socket =============================
class ws {
    public socket;
    private readonly _authenticationBearer;
    private readonly _clientId;
    private readonly _clientSecret;
    private readonly _socketUrl;
    private readonly config;

    constructor(onTrade?) {
        this.config = new Config.ConfigProvider();

        this._authenticationBearer = this.config.GetString("AuthorizationBearer");
        this._clientId = this.config.GetString("TribecaClientId");
        this._clientSecret = this.config.GetString("TribecaClientSecret");
        this._socketUrl = this.config.GetString('CryptokartSocketUrl');

        this.socket = new WebSocket(this._socketUrl, {rejectUnauthorized: false});

        let onOpen = (event) => {
            console.log('Socket Connected');
        };
        
        let onClose = (event) => {
            console.log('Socket disconnected');
        };
        
        let onError = (event) => {
            console.log('Socket error:', event);
        };
        
        let onMessage = (event) => {
            let data = JSON.parse(event.data);
            //console.log("@@ onMessage data : ",data);
            switch(data && data.id) {
                case 1001:
                            console.log("## Socket Sign and Authenticate Done");
                            if(data.result) {
                                this.socket.isAuthenticated = true;
                            } else {
                                this.socket.isAuthenticated = false;
                            }
                case 1041:  //queryMarketDeals(data);
                            break;
                case 1042:  console.log("## Subscribe: OrderHistory", data);
                            break;
                case 1043:  console.log("## Unscubscribe: OrderHistory", data);
                            break;
                case 1051:  //queryAssetBalance(data);
                            break;
                case 1052:  console.log("## Subscribe: All Asset Balances", data);
                            break;
                case 1062:  console.log("## Subscribe: Market Order Depth", data);
                            //onTrade(data);
                            break;
                case 1063:  console.log("## Unscubscribe: Market Order Depth", data);
                            break; 
                // positions update case
                case 12021: console.log("## Subscribe: Positions Data", data);
                            //onTrade(data);
                            break;   
                case 6569: console.log("## Subscribe: Order Deals Status",data); 
                            break;
                default:   switch(data.method) {
                                case 'asset.update':    //updateAssetBalance(data);
                                                        console.log("## asset.update data received ##");
                                                        onTrade(data);
                                                        break;
                                case 'deals.update':    //updateOrderDeals(data);
                                                        console.log("## deals.update data received ## ");
                                                        onTrade(data);
                                                        break;
                                case 'depth.update':    //onTrade(data);
                                                        console.log("## depth.update data received ##");
                                                        onTrade(data);
                                                        break;
                                case 'order.update':    console.log("## Order Match Data Received ##");
                                                        onTrade(data);
                                                        break;
                                default:                console.log('what omg', data, typeof data, data.id);
                            }
            }
        };
        
        let customSend = (payloadString) => {
            let isSocketReady = (callback) => {
                console.log("## isSocketReady called for : ", JSON.parse(payloadString));
                console.log("## isSocketAuthenticated? : ", this.socket.isAuthenticated);
                if (this.socket.readyState === 1 && (this.socket.isAuthenticated === true  || JSON.parse(payloadString).method === 'server.sign')) {
                    console.log("### Callback Called to send the payloadString");
                    callback();
                } else {
                    setTimeout(() => {
                        isSocketReady(callback);
                    }, 3000);
                }
            };
        
            isSocketReady(() => {
                this.socket.send(payloadString);
            });
        };
        
        this.socket.onopen = (event) => {
            this.socket.send(JSON.stringify({
                id: 1001,
                method: 'server.sign',
                params: [
                    this._clientId,
                    this._clientSecret,
                    Math.round(Date.now()/1000)
                ]
            }));
            onOpen(event);
        };
        this.socket.onclose = (event) => {
            onClose(event);
        };
        this.socket.onerror = (event) => {
            onError(event);
        };
        this.socket.onmessage = (event) => {
            console.log("@@ Message Event Called : ");
            onMessage(event);
        };
        this.socket.customSend = customSend;

    }
}
//socket ================================


interface NoncePayload<T> {
    nonce: number;
    payload: T;
}

interface AuthorizedHitBtcMessage<T> {
    apikey : string;
    signature : string;
    message : NoncePayload<T>;
}

interface HitBtcPayload {
}

interface Login extends HitBtcPayload {
}

interface CKOrder extends HitBtcPayload {
    clientOrderId : string;
    market_name : string;
    side : number;
    amount : string;
    price : string;
}

interface OrderCancel extends HitBtcPayload {
    clientOrderId : string;
    cancelRequestClientOrderId : string;
    symbol : string;
    side : string;
}

interface HitBtcOrderBook {
    asks : [string, string][];
    bids : [string, string][];
}

interface Update {
    id : number,
    market : string,
    side : number,
    type : number,
    left : string,
    price : string,
    amount : string
}

interface MarketDataSnapshotFullRefresh {
    symbol : string;
    ask : Array<Update>;
    bid : Array<Update>
}

interface MarketDataIncrementalRefresh {
    seqNo : number;
    timestamp : number;
    symbol : string;
    exchangeStatus : string;
    ask : Array<Update>;
    bid : Array<Update>
    trade : Array<Update>
}

interface ExecutionReport {
    orderId : string;
    clientOrderId : string;
    execReportType : "new"|"canceled"|"rejected"|"expired"|"trade"|"status";
    orderStatus : "new"|"partiallyFilled"|"filled"|"canceled"|"rejected"|"expired";
    orderRejectReason? : string;
    symbol : string;
    side : string;
    timestamp : number;
    price : number;
    quantity : number;
    type : string;
    timeInForce : string;
    tradeId? : string;
    lastQuantity? : number;
    lastPrice? : number;
    leavesQuantity? : number;
    cumQuantity? : number;
    averagePrice? : number;
}

interface CancelReject {
    clientOrderId : string;
    cancelRequestClientOrderId : string;
    rejectReasonCode : string;
    rejectReasonText : string;
    timestamp : number;
}

interface MarketTrade {
    price: number;
    amount: number;
    type: number;
    time: number;
}

interface MarketTradeQueryObject {
    error: any,
    params: MarketTrade[]
}

interface MarketTradeUpdateObject {
    error: any,
    result: MarketTrade[]
}

class SideMarketData {
    private readonly _data : Map<string, Models.MarketSide>;
    private readonly _collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'})

    constructor(side: Models.Side) {
        const compare = side === Models.Side.Bid ? 
            ((a,b) => this._collator.compare(b,a)) : 
            ((a,b) => this._collator.compare(a,b));
        this._data = new SortedMap([], null, compare);
    }

    public update = (k: string, v: Models.MarketSide) : void => {
        if (v.size === 0) {
            this._data.delete(k);
            return;
        }

        const existing = this._data.get(k);
        if (existing) {
            existing.size = v.size;
        }
        else {
            this._data.set(k, v);
        }
    }

    public clear = () : void => this._data.clear();

    public getBest = (n: number) : Models.MarketSide[] => {
        const b = new Array<Models.MarketSide>();
        const it = (<any>(this._data)).iterator();

        while (b.length < n) {
            let x : {done: boolean, value: {key: string, value: Models.MarketSide}} = it.next();
            if (x.done) return b;
            b.push(x.value.value);
        }

        return b;
    };

    public any = () : boolean => (<any>(this._data)).any();
    public min = () : Models.MarketSide => (<any>(this._data)).min();
    public max = () : Models.MarketSide => (<any>(this._data)).max();
}

interface CryptokartOrderSymbol {
    id: number,
    market: string,
    side: number,
    type: number,
    left: string,
    price: string,
    amount: string
}

interface CryptokartOrderBook {
    result: {
        offset: number,
        limit: number,
        total: number,
        orders: Array<CryptokartOrderSymbol>
    },
    error: any
}

interface CryptokartTradeSymbol {
    id : number,
    amount : string,
    ctime : number,
    side : number,
    taker_fee : string,
    user : number,
    type : number,
    ftime : number,
    deal_fee : string,
    market : string,
    price : string,
    maker_fee : string,
    deal_stock : string,
    deal_money : string
}

interface CryptokartTradeHistory {
    error: any,
    result: {
        offset: number,
        limit: number,
        records: Array<CryptokartTradeSymbol>
    }
}

class CryptokartMarketDataGateway implements Interfaces.IMarketDataGateway {
    MarketData = new Utils.Evt<Models.Market>();
    MarketTrade = new Utils.Evt<Models.GatewayMarketTrade>();

    private readonly marketPair: string;

    private updateDealData = (t) => {
        console.log("\n## deals data : \n",t.params[1]);
        if (t.params && t.params.length) {
            t.params[1].forEach( trade => {
                this.MarketTrade.trigger(new Models.GatewayMarketTrade(trade.price, trade.amount, trade.time, false, trade.type === 'buy' ? Models.Side.Ask : Models.Side.Bid));
            })
        }
        this.ConnectChanged.trigger(Models.ConnectivityStatus.Connected);
    };

    private bidsArray : Models.MarketSide[] = [];
    private asksArray : Models.MarketSide[] = [];

    private updateDepthData = (t) => {
        console.log('\n## depth data : \n', t.params[1]);

        if(t.params[0]) {

            this.bidsArray = [];
            this.asksArray = [];

            if(t.params[1].hasOwnProperty("bids")) {
                t.params[1].bids.forEach(order => {
                    this.bidsArray.push(new Models.MarketSide(Number(order[0]), Number(order[1])));
                })
            }
    
            if(t.params[1].hasOwnProperty("asks")) {
                t.params[1].asks.forEach(order => {
                    this.asksArray.push(new Models.MarketSide(Number(order[0]), Number(order[1])));
                })
            }
    
            console.log('\n## Whole Order Book Built : \n', this.bidsArray, this.asksArray);
            this.MarketData.trigger(new Models.Market(this.bidsArray, this.asksArray, new Date()));

        } else {

            if(t.params[1].hasOwnProperty("bids")) {
                t.params[1].bids.forEach(order => {

                    let bidsArrayUpdated = false;
                    for(let bid in this.bidsArray) {
                        if(Number(order[0]) == this.bidsArray[bid].price) {
                            this.bidsArray[bid].size = Number(order[1]);
                            bidsArrayUpdated = true;
                            break;
                        }
                    }

                    if(!bidsArrayUpdated) {
                        this.bidsArray.push(new Models.MarketSide(Number(order[0]), Number(order[1])));
                    }
                })

                this.bidsArray = this.bidsArray.filter((bid) => {
                    if(bid.size > 0) {
                        return bid;
                    }
                })

                this.bidsArray.sort((a,b) => {
                    if(a.price < b.price) {
                        return 1;
                    } else if(a.price > b.price) {
                        return -1;
                    } else {
                        return 0;
                    }
                })
            }

            if(t.params[1].hasOwnProperty("asks")) {
                t.params[1].asks.forEach(order => {

                    let asksArrayUpdated = false;
                    for(let ask in this.asksArray) {
                        if(Number(order[0]) == this.asksArray[ask].price) {
                            this.asksArray[ask].size = Number(order[1]);
                            asksArrayUpdated = true;
                            break;
                        }
                    }

                    if(!asksArrayUpdated) {
                        this.asksArray.push(new Models.MarketSide(Number(order[0]), Number(order[1])));
                    }
                })

                this.asksArray = this.asksArray.filter((ask) => {
                    if(ask.size > 0) {
                        return ask;
                    }
                })

                this.asksArray.sort((a,b) => {
                    if(a.price < b.price) {
                        return -1;
                    } else if(a.price > b.price) {
                        return 1;
                    } else {
                        return 0;
                    }
                })
            }

            console.log('\n## Partial Order Book Built : \n', this.bidsArray, this.asksArray);
            this.MarketData.trigger(new Models.Market(this.bidsArray, this.asksArray, new Date()));
        }
        this.ConnectChanged.trigger(Models.ConnectivityStatus.Connected);
        // console.log(this.MarketData);
    }



    // private queryDealData = (t) => {
    //     if (t.error) {
    //         console.log('Unable to fetch market deals:', t.error)
    //     } else {
    //         t = t.result;

    //     }

    //     let side : Models.Side = Models.Side.Unknown;
    //     if (this._lastAsks.any() && this._lastBids.any()) {
    //         const distance_from_bid = Math.abs(this._lastBids.max().price - t.price);
    //         const distance_from_ask = Math.abs(this._lastAsks.min().price - t.price);
    //         if (distance_from_bid < distance_from_ask) side = Models.Side.Bid;
    //         if (distance_from_bid > distance_from_ask) side = Models.Side.Ask;
    //     }
        
    //     this.MarketTrade.trigger(new Models.GatewayMarketTrade(t.price, t.amount, new Date(), false, side));
    // };

    private readonly _tradesClient = new ws(this.updateDealData);
    // private _hasProcessedSnapshot = false;
    private readonly _marketDataWs = new ws(this.updateDepthData);

    // private readonly _lastBids = new SideMarketData(Models.Side.Bid);
    // private readonly _lastAsks = new SideMarketData(Models.Side.Ask);
    // private onMarketDataIncrementalRefresh = (msg : MarketDataIncrementalRefresh, t : Date) => {
    //     if (msg.symbol !== this._symbolProvider.symbol || !this._hasProcessedSnapshot) return;
    //     this.onMarketDataUpdate(msg.bid, msg.ask, t);
    // };

    // private onMarketDataSnapshotFullRefresh = (msg : MarketDataSnapshotFullRefresh, t : Date) => {
    //     if (msg.symbol !== this._symbolProvider.symbol) return;
    //     this._lastAsks.clear();
    //     this._lastBids.clear();
    //     this.onMarketDataUpdate(msg.bid, msg.ask, t);
    //     this._hasProcessedSnapshot = true;
    // };

    // private onMarketDataUpdate = (bids : Update[], asks : Update[], t : Date) => {
    //     const ordBids = this.applyUpdates(bids, this._lastBids);
    //     const ordAsks = this.applyUpdates(asks, this._lastAsks);

    //     this.MarketData.trigger(new Models.Market(ordBids, ordAsks, t));
    // };

    // private applyUpdates(incomingUpdates : Update[], side : SideMarketData) {
    //     for (let u of incomingUpdates) {
    //         const ms = new Models.MarketSide(parseFloat(u.price), parseFloat(u.amount) / _lotMultiplier);            
    //         side.update(u.price, ms);
    //     }

    //     return side.getBest(25);
    // }

    ConnectChanged = new Utils.Evt<Models.ConnectivityStatus>();

    // private readonly _tradesClient : SocketIOClient.Socket;
    private readonly _log = log("tribeca:gateway:CryptokartMD");
    private readonly _authorizationBearer : string;
    constructor(
        config : Config.IConfigProvider, 
        private readonly _symbolProvider: CryptokartSymbolProvider, 
        private readonly _minTick: number) {

        this._authorizationBearer = config.GetString("AuthorizationBearer");
        this.marketPair = config.GetString("TradedPair").split("/").join("");

        // this.MarketData.on((data) => {
        //     console.log('***Console all market data updates:', data);
        // })

        this._tradesClient.socket.customSend(JSON.stringify({
            id: 1042,
            method: 'deals.subscribe',
            params: [
                _symbolProvider.symbol
            ]
        }))

        // //Subscribe to market deals
        this._marketDataWs.socket.customSend(JSON.stringify({
            id: 1062,
            method: 'depth.subscribe',
            params: [
                _symbolProvider.symbol,
                50,
                '0.000001'
            ]
        }))

        // Utils.sendPostRequest(url.resolve(config.GetString("CryptokartPullUrl"), "/matchengine/order/book"),{
        //     "market_name" : this._symbolProvider.symbol,
        //     "side" : 2,
        //     "offset" : 0,
        //     "limit" : 100
        // })
        // .then( (data: CryptokartOrderBook) => {
        //     if (!data.error) {
        //         let ask = data.result.orders;

        //         Utils.sendPostRequest(url.resolve(config.GetString("CryptokartPullUrl"), "/matchengine/order/book"),{
        //             "market_name" : this._symbolProvider.symbol,
        //             "side" : 1,
        //             "offset" : 0,
        //             "limit" : 100
        //         }).then( (data: CryptokartOrderBook) => {
        //             if (!data.error) {
        //                 let bid = data.result.orders;
        
        //                 this.onMarketDataSnapshotFullRefresh({
        //                     symbol: this._symbolProvider.symbol,
        //                     ask,
        //                     bid
        //                 }, Utils.date());
        //             } else {
        //                 throw data.error;
        //             }
        //         })        
        //     } else {
        //         throw data.error;
        //     }
        // })
        // .catch(err => {
        //     console.log(err);
        //     throw err;
        // })

        // Utils.sendPostRequest(url.resolve(config.GetString("CryptokartPullUrl"), "/matchengine/order/finished"),{
        //     market_name : this._symbolProvider.symbol,
        //     start_time : 0,
        //     end_time : Math.round(Date.now()),
        //     offset : 0,
        //     limit : 100,
        //     market_side : 1
        // }).then( (data: CryptokartTradeHistory) => {
        //     if (!data.error) {
        //         let trades = data.result.records;

        //         trades.forEach(t => {
        //             const price = t.price;
        //             const size = t.deal_stock;
        //             const time = new Date(t.ftime);
        //             this.MarketTrade.trigger(new Models.GatewayMarketTrade(parseFloat(price), parseFloat(size), time, true, Models.Side.Bid));
        //         });
        //     } else {
        //         throw data.error;
        //     }
        // })
        // .catch( err => {
        //     console.log(err);
        //     throw err;
        // })

        // Utils.sendPostRequest(url.resolve(config.GetString("CryptokartPullUrl"), "/matchengine/order/finished"),{
        //     market_name : this._symbolProvider.symbol,
        //     start_time : 0,
        //     end_time : Math.round(Date.now()),
        //     offset : 0,
        //     limit : 100,
        //     market_side : 2
        // }).then( (data: CryptokartTradeHistory)  => {
        //     if (!data.error) {
        //         let trades = data.result.records;

        //         trades.forEach(t => {
        //             const price = t.price;
        //             const size = t.deal_stock;
        //             const time = new Date(t.ftime);
        //             this.MarketTrade.trigger(new Models.GatewayMarketTrade(parseFloat(price), parseFloat(size), time, true, Models.Side.Ask));
        //         });
        //     } else {
        //         throw data.error;
        //     }
        // })
        // .catch( err => {
        //     console.log(err);
        //     throw err;
        // })

        this.ConnectChanged.trigger(Models.ConnectivityStatus.Connected);
        console.log('Finished constructor');
    }
}

class CryptokartOrderEntryGateway implements Interfaces.IOrderEntryGateway {
    OrderUpdate = new Utils.Evt<Models.OrderStatusUpdate>();
    public cancelsByClientOrderId = true;
    
    supportsCancelAllOpenOrders = () : boolean => { return true; };

    cancelAllOpenOrders = async () => { 
        const cancelAllUrl = new Config.ConfigProvider().GetString("CryptokartPullUrl") + '/matchengine/order/cancelAll';
        const cancelAllResponse = await Utils.sendPostRequest(cancelAllUrl,{}).catch(err => console.error("\nERROR while Cancelling Open Orders : ",err));
        console.log("\n## CANCEL ALL RESPONSE : ",cancelAllResponse);
    };

    _nonce = 1;

    cancelOrder = (cancel : Models.OrderStatusReport) => {

        console.log("## testing cancel order : ", cancel);
        Utils.sendPostRequest('https://test.cryptokart.io:1337/matchengine/order/cancel', {
            "market_name" : this._symbolProvider.symbol,
            "order_id" : parseInt(cancel.orderId)
        })
        .then( data => {
            console.log('Order Cancel:', data);
            this.changeConnectionStatus(Models.ConnectivityStatus.Connected);
        })
        .catch( e => {
            this._log.error(e, "Error processing JSON response ", e);
        })
    };

    replaceOrder = async (replace : Models.OrderStatusReport) => {
        console.log("\n## in replace order...");
        this.cancelOrder(replace);
        try {
            return await this.sendOrder(replace);
        }
        catch (e) {
            console.log("## error in replace order : ",e);
        }
    };

    sendOrder = async (order : Models.OrderStatusUpdate) => {

        console.log("## testing sendOrder : ", order)

        const CryptokartOrder : CKOrder = {
            clientOrderId : order.orderId,
            market_name : this._symbolProvider.symbol,
            side: CryptokartOrderEntryGateway.getSide(order.side),
            amount: (order.quantity * _lotMultiplier).toString(),
            price: order.price.toString()
        };

        let url: string;

        let finalOrderToSend = {};

        if(CryptokartOrderEntryGateway.getType(order.type) === 'limit') {

            url = `https://test.cryptokart.io:1337/matchengine/order/putLimit`;
            finalOrderToSend = {
                "market_name" : this._symbolProvider.symbol,
                "side" : CryptokartOrderEntryGateway.getSide(order.side),
                "amount" : (order.quantity * _lotMultiplier).toString(),
                "price" : (Math.floor(order.price*100)/100).toString(),
            }
        } else {

            url = `https://test.cryptokart.io:1337/matchengine/order/putMarket`;            
            finalOrderToSend = {
                "market_name" : this._symbolProvider.symbol,
                "side" : CryptokartOrderEntryGateway.getSide(order.side),
                "amount" : (order.quantity * _lotMultiplier).toString(),
                "user_id" : '121', // check for the user ID
            }
        }

        console.log('## final order to send : ',finalOrderToSend)

        let finalOrderId : number;

        // order ID is returned to be saved, updated by the tribeca for its internal use. It is used to replace the existing alphanumeric ID which tribeca uses ( which we can't work with )
        // return Utils.sendPostRequest(url, finalOrderToSend)
        // .then( (data: {error,result}) => {
        //     if(!data.error) {
        //         console.log('Order Sent:', data);
        //         finalOrderId =  (data.result.id);
        //         this.changeConnectionStatus(Models.ConnectivityStatus.Connected);
        //         return finalOrderId;
        //     } else {
        //         return Promise.reject(data.error);
        //     }
        // })
        // .catch( e => {
        //     this._log.error(e, "Error processing JSON response ", e);
        // })

        let sendPostResult;

        try {
            sendPostResult = await Utils.sendPostRequest(url, finalOrderToSend);
        }
        catch (e) {
            console.log("\n## sendPostError in cryptokart.ts");
            return Promise.reject(e)
        }

        if(!sendPostResult['error']) {
            console.log('Order Sent:', sendPostResult);
            finalOrderId =  (sendPostResult['result']['id']);
            this.changeConnectionStatus(Models.ConnectivityStatus.Connected);
            return finalOrderId;
        } else {
            console.log("\n## Error in placing a send order : ",sendPostResult['error']);
            return Promise.reject(sendPostResult['error'])
        }

    };

    private static getStatus(m : ExecutionReport) : Models.OrderStatus {
        switch (m.execReportType) {
            case "new":
            case "status":
                return Models.OrderStatus.Working;
            case "canceled":
            case "expired":
                return Models.OrderStatus.Cancelled;
            case "rejected":
                return Models.OrderStatus.Rejected;
            case "trade":
                if (m.orderStatus == "filled")
                    return Models.OrderStatus.Complete;
                else
                    return Models.OrderStatus.Working;
            default:
                return Models.OrderStatus.Other;
        }
    }

    private static getTif(tif : Models.TimeInForce) {
        // switch (tif) {
        //     case Models.TimeInForce.FOK:
        //         return "FOK";
        //     case Models.TimeInForce.GTC:
        //         return "GTC";
        //     case Models.TimeInForce.IOC:
        //         return "IOC";
        // }
        return "GTC";
    }

    private static getSide(side : Models.Side) {
        switch (side) {
            case Models.Side.Bid:
                return 2;
            case Models.Side.Ask:
                return 1;
            default:
                throw new Error("Side " + Models.Side[side] + " not supported in HitBtc");
        }
    }

    private static getType(t : Models.OrderType) {
        switch (t) {
            case Models.OrderType.Limit:
                return "limit";
            case Models.OrderType.Market:
                return "market";
        }
    }

    // private onExecutionReport = (tsMsg : Models.Timestamped<ExecutionReport>) => {
    //     const t = tsMsg.time;
    //     const msg = tsMsg.data;

    //     const ordStatus = CryptokartOrderEntryGateway.getStatus(msg);

    //     let lastQuantity : number = undefined;
    //     let lastPrice : number = undefined;
        
    //     const status : Models.OrderStatusUpdate = {
    //         exchangeId: msg.orderId,
    //         orderId: msg.clientOrderId,
    //         orderStatus: ordStatus,
    //         time: t,
    //     };

    //     if (msg.lastQuantity > 0 && msg.execReportType === "trade") {
    //         status.lastQuantity = msg.lastQuantity / _lotMultiplier;
    //         status.lastPrice = msg.lastPrice;
    //     }

    //     if (msg.orderRejectReason)
    //         status.rejectMessage = msg.orderRejectReason;

    //     if (status.leavesQuantity)
    //         status.leavesQuantity = msg.leavesQuantity / _lotMultiplier;
        
    //     if (msg.cumQuantity)
    //         status.cumQuantity = msg.cumQuantity / _lotMultiplier;

    //     if (msg.averagePrice)
    //         status.averagePrice = msg.averagePrice;

    //     this.OrderUpdate.trigger(status);
    // };

    // private onCancelReject = (tsMsg : Models.Timestamped<CancelReject>) => {
    //     const msg = tsMsg.data;
    //     const status : Models.OrderStatusUpdate = {
    //         orderId: msg.clientOrderId,
    //         rejectMessage: msg.rejectReasonText,
    //         orderStatus: Models.OrderStatus.Rejected,
    //         cancelRejected: true,
    //         time: tsMsg.time
    //     };
    //     this.OrderUpdate.trigger(status);
    // };

    // private authMsg = <T>(payload : T) : AuthorizedHitBtcMessage<T> => {
    //     const msg = {nonce: this._nonce, payload: payload};
    //     this._nonce += 1;

    //     const signMsg = m => {
    //         return crypto.createHmac('sha512', this._secret)
    //             .update(JSON.stringify(m))
    //             .digest('base64');
    //     };

    //     return {apikey: this._apiKey, signature: signMsg(msg), message: msg};
    // };

    // private sendAuth = <T extends HitBtcPayload>(msgType : string, msg : T, cb?: () => void) => {
    //     const v = {};
    //     v[msgType] = msg;
    //     const readyMsg = this.authMsg(v);
    //     this._orderEntryWs.send(JSON.stringify(readyMsg), cb);
    // };

    ConnectChanged = new Utils.Evt<Models.ConnectivityStatus>();

    private changeConnectionStatus = (c : Models.ConnectivityStatus) => {
        this.ConnectChanged.trigger(c)
    }
    // this.ConnectChanged.trigger(Models.ConnectivityStatus.Connected);
    // private onConnectionStatusChange = () => {
    //     console.log("==========  ", this._orderEntryWs.isConnected, "  ================");
    //     if (this._orderEntryWs.isConnected) {
    //         this.ConnectChanged.trigger(Models.ConnectivityStatus.Connected);
    //     }
    //     else {
    //         this.ConnectChanged.trigger(Models.ConnectivityStatus.Disconnected);
    //     }
    // };

    // private onOpen = () => {
    //     // this.sendAuth("Login", {});
    //     this.onConnectionStatusChange();
    // };

    // private onMessage = (raw : Models.Timestamped<string>) => {
    //     try {
    //         const msg = JSON.parse(raw.data);

    //         if (this._log.debug())
    //             this._log.debug(msg, "message");

    //         if (msg.hasOwnProperty("ExecutionReport")) {
    //             this.onExecutionReport(new Models.Timestamped(msg.ExecutionReport, raw.time));
    //         }
    //         else if (msg.hasOwnProperty("CancelReject")) {
    //             this.onCancelReject(new Models.Timestamped(msg.CancelReject, raw.time));
    //         }
    //         else {
    //             this._log.info("unhandled message", msg);
    //         }
    //     }
    //     catch (e) {
    //         this._log.error(e, "exception while processing message", raw);
    //         throw e;
    //     }
    // };

    generateClientOrderId = () => {
        return shortId.generate();
    }

    /**
     * Purpose:- To keep a note of the orders placed by the bot so as to forward them to Binance whenever a deal takes place.
     * contains the orders placed by the bot and the deals info of that specific order.
     * format:- { orderID_1: [orderID of Orders which led to a deal...], orderID_2...}.
     * order_ID_x is removed whenever that order has finished matching totally.
     */
    private orderDealsSentData = {};

    /**
     * Purpose:- To decide what should be done whenever an order matches with the order placed by the bot.
     * Case 1:- When the order is initiated by the bot, its ID is saved in orderDealsSentData.
     * Case 2:- When the Order is Partially Matched
     * Case 3:- When the Order is Finished Totally
     * 
     * STEPS:-
     * 1. Fetch the deals related to the order.
     * 2. Fetch the users who placed those orders which were matched with bot's order.
     * 3. If the user's are not Cryptokart's Accounts, Place a 'vice-versa' Order on Binance.
     * 4. Else, Don't forward the Order to Binance
     */
    onOrderUpdate = async (order) => {
        console.log("\nOrder Data : ",order.params);
        const orderData = order.params;

        switch(orderData[0]) {

            case 1 :
                this.orderDealsSentData[orderData[1].id+''] = [];       // add the new order by bot in a data store
                console.log(`## Inserted a New Order : ${orderData[1].id} in `, this.orderDealsSentData);
                break;
            case 2 :
            case 3 :
                const orderDealReqObj = {
                    "id": 8,
                    "method":"order.deals",
                    "params":[
                         orderData[1].id,
                         0,
                         10
                    ]
                 }

                 // Delay is added since the subsequent API couldn't fetch the deals record related to that order even though the order update was specificed by the sockets.
                 await Utils.delay(100);    
                 const orderDealData = await Utils.sendPostRequest(this.cryptokartTradeEngineUrl,orderDealReqObj).catch((err) => {
                     console.error("\nERROR in orderDealData Fetch : ",err);
                     return;
                 });

                 const records = orderDealData['result']['records'];
                 console.log("\n## RECORDS : ",records);

                 for(let rec of records) {

                     const dealOrderId = +rec['deal_order_id'];
                     
                     // check whether we have already considered the deal for forwarding to Binance..
                     if(!_.includes(this.orderDealsSentData[orderData[1].id+''], dealOrderId)) {

                        this.orderDealsSentData[orderData[1].id+''].push(dealOrderId);
                        
                        const orderFinishedDataReqObj = {
                            "id": 1,
                            "method":"order.finished_detail",
                            "params":[
                                dealOrderId
                            ]
                         }

                         // Fetch the USER who placed the order which got matched with bot's order
                         let orderFinishedData;
                         try {
                            orderFinishedData = await Utils.sendPostRequest(this.cryptokartTradeEngineUrl, orderFinishedDataReqObj);
                         } catch (e) {
                            console.error("\nERROR in orderFinishedData Fetch : ",e);
                            return;
                         }

                         console.log("\n## ORDER FINISHED DATA : ",orderFinishedData);

                         // check whether that USER doesn't belong to Cryptokart's Accounts
                         if(!_.includes(this.cryptokartAccounts, orderFinishedData['result']['user'])) {

                            const binanceRequestObject = {
                                'newClientOrderId': orderData[1].id + '',
                                'side': orderData[1].side === 2 ? 'SELL' : 'BUY',
                                'symbol': this.marketPair,
                                'quantity': +rec.amount,
                                'type': 'MARKET',
                                'timestamp': new Date().getTime()
                            }
            
                            // signature is the sha256 of query string and BINANCE_SECRET_KEY
                            const {query, signature} = Utils.createSignature(binanceRequestObject);
                            let binanceResponse;

                            try {
                                binanceResponse = await Utils.sendOrderBinance(query,signature);
                                console.log("\n Binance Response : ",binanceResponse);

                                // demo binance response till the time we don't execute it on PROD Binance
                                binanceResponse = {
                                    "symbol": "BTCUSDT",
                                    "orderId": 28,
                                    "clientOrderId": "6gCrw2kRUAF9CvJDGP16IP",
                                    "transactTime": 1507725176595,
                                    "price": "4000.00000000",
                                    "origQty": "10.00000000",
                                    "executedQty": "0.500000000",
                                    "cummulativeQuoteQty": "10.00000000",
                                    "status": "FILLED",
                                    "timeInForce": "GTC",
                                    "type": "MARKET",
                                    "side": "SELL",
                                    "fills": [
                                    {
                                        "price": "4000.00000000",
                                        "qty": "1.00000000",
                                        "commission": "4.00000000",
                                        "commissionAsset": "USDT"
                                    },
                                    {
                                        "price": "3999.00000000",
                                        "qty": "5.00000000",
                                        "commission": "19.99500000",
                                        "commissionAsset": "USDT"
                                    },
                                    {
                                        "price": "3998.00000000",
                                        "qty": "2.00000000",
                                        "commission": "7.99600000",
                                        "commissionAsset": "USDT"
                                    },
                                    {
                                        "price": "3997.00000000",
                                        "qty": "1.00000000",
                                        "commission": "3.99700000",
                                        "commissionAsset": "USDT"
                                    },
                                    {
                                        "price": "3995.00000000",
                                        "qty": "1.00000000",
                                        "commission": "3.99500000",
                                        "commissionAsset": "USDT"
                                    }
                                    ]
                                }

                                /**
                                 * Profit Calculation for Cryptokart
                                 */

                                let profitData = {};
                                const totalQuoteAmount = +rec.price * +rec.amount;
                                const totalCommissionBinance = binanceResponse.fills.reduce((commission,deal) => commission += +deal.commission,0);
                                let totalQuoteAmountBinance;
                                let finalQuoteAmount;
                                let profitPercentage;

                                switch(orderData[1].side) {
                                    case 2: // when bot places a buy order, binance places a sell order

                                        totalQuoteAmountBinance = +binanceResponse.price * +binanceResponse.executedQty - totalCommissionBinance;
                                        finalQuoteAmount = totalQuoteAmountBinance - totalQuoteAmount;
                                        profitPercentage = (totalQuoteAmountBinance - totalQuoteAmount) * 100 / totalQuoteAmount;
                                        break;
                                    
                                    case 1: 
                                        /**
                                         * when bot places a sell order, binance places a buy order of the same quantity.
                                         * But that quantity is reduced by the commission charged by the Binance.
                                         * Therefore, the totalQuoteAmounts are calculated as it is with the original quantity and a "0.1%" of loss is considered from the final profit percentage
                                         */
                                        totalQuoteAmountBinance = +binanceResponse.price * +binanceResponse.executedQty;
                                        finalQuoteAmount = totalQuoteAmount - totalQuoteAmountBinance;
                                        profitPercentage = ((totalQuoteAmount - totalQuoteAmountBinance) * 100 / totalQuoteAmount) - 0.1; // 0.1 is the percentage loss considered here
                                        break;
                                }

                                profitData = {
                                    'totalCryptokart': totalQuoteAmount,
                                    'totalCommissionBinance': totalCommissionBinance,
                                    'totalBinance': totalQuoteAmountBinance,
                                    'profit': finalQuoteAmount,
                                    'profitPercentage': profitPercentage
                                }

                                binanceResponse['profitData'] = profitData;

                                console.log(binanceResponse);

                                // save it in DB
                                const binanceCollection = await this.mongoBinance.connectToCollection();
                                await binanceCollection.insertOne(binanceResponse).catch((err) => console.error("\nERROR in binanceCollection Insert : ",err));

                            } catch (err) {
                                console.log("\nERROR in binanceResponse : ",err);
                            }                            

                         } else {
                             console.log("\nBot Order Finished by Cryptokart's Account. Not Forwarding to Binance..");
                         }

                     } else {
                         break;
                     }
                 }

                if(orderData[0] == 3) {
                    delete this.orderDealsSentData[orderData[1].id+''];             
                }

                console.log("\n## FINAL LIST : ",this.orderDealsSentData);
                break;
        }
    }

    private readonly _log = log("tribeca:gateway:HitBtcOE");
    private readonly _apiKey : string;
    private readonly _secret : string;
    private readonly _authorizationBearer : string;

    private readonly orderDealsWs = new ws(this.onOrderUpdate);
    private readonly cryptokartTradeEngineUrl;
    private readonly cryptokartAccounts;
    private readonly marketPair;
    private mongoBinance;

    constructor(config : Config.IConfigProvider, private _symbolProvider: CryptokartSymbolProvider, private _details: CryptokartBaseGateway) {
        this._apiKey = config.GetString("HitBtcApiKey");
        this._secret = config.GetString("HitBtcSecret");
        this._authorizationBearer = config.GetString("AuthorizationBearer");
        this.cryptokartTradeEngineUrl = config.GetString("CryptokartTradeEngine");

        // binanceMarketOrders collection contains the response of binance market orders...
        this.mongoBinance = new Utils.MongoSave('binanceMarketOrders');
        this.cryptokartAccounts = config.GetString("CryptokartAccountIDs").split(',');
        this.cryptokartAccounts = this.cryptokartAccounts.map(x => +x);
        this.marketPair = config.GetString("TradedPair").split("/").join("");

        setTimeout(() => {
            this.changeConnectionStatus(Models.ConnectivityStatus.Connected)
        },7000);

        this.orderDealsWs.socket.customSend(JSON.stringify({
            id: 6569,
            method: 'order.subscribe',
            params: [
                this.marketPair
                ]
            }
        ))

        // this._orderEntryWs = new WebSocket(config.GetString("HitBtcOrderEntryUrl"), 5000, 
        //     this.onMessage, 
        //     this.onOpen, 
        //     this.onConnectionStatusChange);
        // this._orderEntryWs.connect();
    }
}

interface HitBtcPositionReport {
    currency_code : string;
    cash : number;
    reserved : number;
}

class HitBtcPositionGateway implements Interfaces.IPositionGateway {

    private readonly _log = log("tribeca:gateway:cryptokart");
    PositionUpdate = new Utils.Evt<Models.CurrencyPosition>();
    private readonly _tribecaClientId;
    private readonly _tribecaClientSecret;

    private onTick = () => {
        request(
            // this.getAuth("/matchengine/balance/query"),
            {
                method: 'POST',
                url: `https://test.cryptokart.io:1337/matchengine/balance/query`,
                headers: {
                    // 'Authorization': 'Bearer ' + this._authorizationBearer,
                    'Content-Type': 'application/json'
                },
                json: {
                    client_id: this._tribecaClientId,
                    client_secret: this._tribecaClientSecret
                }
            },
            (err, body, resp) => {
                console.log("DHYAN SE DEKHO : ",resp);
                try {
                    let rpts = (resp);
                    
                    if (typeof rpts === 'undefined' || err || rpts.error) {
                        this._log.warn(err, "Trouble getting positions", body.body);
                        return;
                    }

                    rpts = rpts.result;

                    console.log("## Whole Positions Data - Received Once via API : ",rpts);

                    let assets = Object.keys(rpts);

                    assets.forEach(r => {
                        let currency: Models.Currency;
                        console.log(r);
                        try {
                            currency = Models.toCurrency(r);
                        }
                        catch (e) {
                            console.log(currency, err.message);
                            return;
                        }
                        if (currency == null) return;
                        const position = new Models.CurrencyPosition(Number(rpts[r].available), Number(rpts[r].freeze), currency);
                        console.log("YE TRIGGER HOGA : ",position);
                        this.PositionUpdate.trigger(position);
                    });
                }
                catch (e) {
                    this._log.error(e, "Error processing JSON response ", resp);
                }
            });

            this.ConnectChanged.trigger(Models.ConnectivityStatus.Connected);
    };

    private updatePositionData = (position) => {
        let curr = Object.keys(position.params[0]);
        
        curr.forEach((cur) => {
            let currency: Models.Currency;
            try {
                currency = Models.toCurrency(curr[0]);
            }
            catch(e) {
                console.log(currency, e.message);
                return;
            }
    
            if(currency == null) return;
            const positionData = new Models.CurrencyPosition(Number(position.params[0][cur].available), Number(position.params[0][cur].freeze), currency);
            console.log('## position data from socket : ',positionData, cur);
            this.PositionUpdate.trigger(positionData);
        })

        this.ConnectChanged.trigger(Models.ConnectivityStatus.Connected);

    }

    // ============================================= SOCKET TEST ===============================================//
    private readonly _positionUpdateClient = new ws(this.updatePositionData); // needs the update function inside
    ConnectChanged = new Utils.Evt<Models.ConnectivityStatus>();
    private baseSymbol;
    private quoteSymbol;

    private readonly _apiKey : string;
    private readonly _secret : string;
    private readonly _pullUrl : string;
    private readonly _authorizationBearer : string;
    constructor(config : Config.IConfigProvider) {
        this._apiKey = config.GetString("CryptokartApiKey");
        this._secret = config.GetString("CryptokartSecret");
        this._pullUrl = config.GetString("CryptokartPullUrl");
        this._tribecaClientId = config.GetString("TribecaClientId");
        this._tribecaClientSecret = config.GetString("TribecaClientSecret");
        this._authorizationBearer = config.GetString("AuthorizationBearer");
        [this.baseSymbol,this.quoteSymbol] = config.GetString("TradedPair").split("/");

        // this function fetches the initial position status via a http call. the subsequent ones are fetched via a socket subscription.
        //this.onTick();
        setInterval(this.onTick, 15000);
        //setTimeout(this.onTick, 15000);

        // socket for the assets query
        this._positionUpdateClient.socket.customSend(JSON.stringify({
            id: 12021,
            method: 'asset.subscribe',
            params: [
                this.baseSymbol,this.quoteSymbol
            ]
        }))
    }
}

class CryptokartBaseGateway implements Interfaces.IExchangeDetailsGateway {
    public get hasSelfTradePrevention() {
        return true;
    }

    exchange() : Models.Exchange {
        return Models.Exchange.Cryptokart;
    }

    makeFee() : number {
        return 0;
    }

    takeFee() : number {
        return 0;
    }

    name() : string {
        return "Cryptokart";
    }

    constructor(public minTickIncrement: number) {}
}

class CryptokartSymbolProvider {
    public readonly symbol : string;
    
    constructor(pair: Models.CurrencyPair) {
        this.symbol = Models.fromCurrency(pair.base) + Models.fromCurrency(pair.quote);
    }
}

class Cryptokart extends Interfaces.CombinedGateway {
    constructor(config : Config.IConfigProvider, symbolProvider: CryptokartSymbolProvider, step: number, pair: Models.CurrencyPair) {
        const details = new CryptokartBaseGateway(step);
        const orderGateway = config.GetString("CryptokartOrderDestination") == "Cryptokart" ?
            <Interfaces.IOrderEntryGateway>new CryptokartOrderEntryGateway(config, symbolProvider, details)
            : new NullGateway.NullOrderGateway();

        console.log("## inside class Cryptokart");
        // Payment actions are not permitted in demo mode -- helpful.
        let positionGateway : Interfaces.IPositionGateway = new HitBtcPositionGateway(config);
        
        if (config.GetString("HitBtcPullUrl").indexOf("demo") > -1) {
            positionGateway = new NullGateway.NullPositionGateway(pair);
        }

        super(
            new CryptokartMarketDataGateway(config, symbolProvider, step),
            orderGateway,
            positionGateway,
            details);
    }
}

interface CryptokartSymbol {
    money_prec: number,
    name: string,
    fee_prec: number,
    money: string,
    stock: string,
    stock_prec: number,
    min_amount: string
}

interface CryptokartMarketList {
    result: Array<CryptokartSymbol>,
    error: any
}

export async function createCryptokart(config: Config.IConfigProvider, orders: Interfaces.IOrderStateCache, timeProvider: Utils.ITimeProvider, pair: Models.CurrencyPair) : Promise<Interfaces.CombinedGateway> {
    try {
        const symbolsUrl = config.GetString("CryptokartPullUrl") + "/matchengine/market/list";
        let symbols = await Utils.postJSON<CryptokartMarketList>(symbolsUrl);

        console.log("## inside createCryptokart...");
        
        if (symbols.result) {
            const symbolProvider = new CryptokartSymbolProvider(pair);
            console.log(symbols);
            for (let s in symbols.result) {
                if (symbols.result[s].name === symbolProvider.symbol) {
                    let abc = new Cryptokart(config, symbolProvider, parseFloat(symbols.result[s].min_amount), pair);
                    console.log("\n## min tick increment : ",parseFloat(symbols.result[s].min_amount));
                    console.log("## Cryptokart Object Returned")
                    return abc;
                }   
            }

            throw new Error("unable to match pair to a hitbtc symbol " + pair.toString());
        } else {
            throw symbols.error;
        }
    } catch(err) {
        console.log(err);
    }
}