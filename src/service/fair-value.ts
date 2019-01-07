/// <reference path="../common/models.ts" />
/// <reference path="../common/messaging.ts" />
/// <reference path="config.ts" />
/// <reference path="utils.ts" />
/// <reference path="quoter.ts"/>
/// <reference path="safety.ts"/>
/// <reference path="persister.ts"/>
/// <reference path="statistics.ts"/>
/// <reference path="active-state.ts"/>
/// <reference path="market-filtration.ts"/>
/// <reference path="quoting-parameters.ts"/>

import Models = require("../common/models");
import Messaging = require("../common/messaging");
import Utils = require("./utils");
import Interfaces = require("./interfaces");
import Quoter = require("./quoter");
import Safety = require("./safety");
import util = require("util");
import _ = require("lodash");
import Persister = require("./persister");
import Statistics = require("./statistics");
import Active = require("./active-state");
import MarketFiltration = require("./market-filtration");
import QuotingParameters = require("./quoting-parameters");
import moment = require("moment");

export class FairValueEngine {
    public FairValueChanged = new Utils.Evt<Models.FairValue>();

    private _latest: Models.FairValue = null;
    public get latestFairValue() { return this._latest; }
    public set latestFairValue(val: Models.FairValue) {
        if (this._latest != null
            && val != null
            && Math.abs(this._latest.price - val.price) < this._details.minTickIncrement) return;

        this._latest = val;
        this.FairValueChanged.trigger();
        this._fvPublisher.publish(this._latest);

        if (this._latest !== null)
            this._fvPersister.persist(this._latest);
    }

    private hitBtcOrderBookSocket;

    constructor(
        private _details: Interfaces.IBroker,
        private _timeProvider: Utils.ITimeProvider,
        private _filtration: MarketFiltration.MarketFiltration,
        private _qlParamRepo: QuotingParameters.QuotingParametersRepository, // should not co-mingle these settings
        private _fvPublisher: Messaging.IPublish<Models.FairValue>,
        private _fvPersister: Persister.IPersist<Models.FairValue>) {
        this.askHitBtc = [];
        this.bidHitBtc = [];
        //_qlParamRepo.NewParameters.on(() => this.recalcFairValue(_timeProvider.utcNow()));
        //_filtration.FilteredMarketChanged.on(() => this.recalcFairValue(Utils.timeOrDefault(_filtration.latestFilteredMarket, _timeProvider)));
        _fvPublisher.registerSnapshot(() => this.latestFairValue === null ? [] : [this.latestFairValue]);
        this.hitBtcOrderBookSocket = new Utils.WebSoc('wss://api.hitbtc.com/api/2/ws', this.recalcFairValueHitBtc, this.onHitBtcSocket);

    }

    private onHitBtcSocket = () => {
        this.hitBtcOrderBookSocket.socket.send(JSON.stringify({
            "method": "login",
            "params": {
              "algo": "BASIC",
              "pKey": "86fff2e276517e282255de7045ee5f08",
              "sKey": "609be53f69cfa98d16f7d10757dde91f"
            }
          }))

        setTimeout(()=> {
            this.hitBtcOrderBookSocket.socket.send(JSON.stringify({
                "method": "subscribeOrderbook",
                "params": {
                  "symbol": "BTCUSD",
                  "limit": 50
                },
              "id": 123
              }))
        },5000)
    }

    private static ComputeFVUnrounded(ask: Models.MarketSide, bid: Models.MarketSide, model: Models.FairValueModel) {
        switch (model) {
            case Models.FairValueModel.BBO:
                return (ask.price + bid.price) / 2.0;
            case Models.FairValueModel.wBBO:
                return (ask.price * ask.size + bid.price * bid.size) / (ask.size + bid.size);
        }
    }

    private ComputeFV(ask: Models.MarketSide, bid: Models.MarketSide, model: Models.FairValueModel) {
        var unrounded = FairValueEngine.ComputeFVUnrounded(ask, bid, model);
        return Utils.roundNearest(unrounded, this._details.minTickIncrement);
    }

    private recalcFairValue = (t: Date) => {
        var mkt = this._filtration.latestFilteredMarket;

        if (mkt == null) {
            this.latestFairValue = null;
            return;
        }

        var bid = mkt.bids;
        var ask = mkt.asks;

        if (ask.length < 1 || bid.length < 1) {
            this.latestFairValue = null;
            return;
        }

        var fv = new Models.FairValue(this.ComputeFV(ask[0], bid[0], this._qlParamRepo.latest.fvModel), t);
        this.latestFairValue = fv;
    };

    private askHitBtc : Models.MarketSide[];
    private bidHitBtc : Models.MarketSide[];

    private recalcFairValueHitBtc = (data) => {
        const result = (JSON.parse(data.data));
        
        switch(result.result || result.method) {
            case true: 
                console.log("HitBtc Orderbook Subscription Successful");
                break;

            case 'snapshotOrderbook':
                console.log("Snapshot of HitBtc Orderbook Received");

                result.params.ask = result.params.ask.slice(0,50);
                result.params.bid = result.params.bid.slice(0,50);

                result.params.ask.forEach((element) => {
                    this.askHitBtc.push(new Models.MarketSide(Number(element.price), Number(element.size)));
                })

                result.params.bid.forEach((element) => {
                    this.bidHitBtc.push(new Models.MarketSide(Number(element.price), Number(element.size)));
                })

                // console.log("\n************");
                // console.log(this.askHitBtc);
                // console.log(this.bidHitBtc);
                // console.log("\n**********");

                break;

            case 'updateOrderbook':

                if(result.params.hasOwnProperty('ask')) {
                    result.params.ask.forEach((order) => {

                        let askArrayUpdated = false;

                        for(let ask in this.askHitBtc) {
                            if(Number(order.price) == this.askHitBtc[ask].price) {
                                this.askHitBtc[ask].size = Number(order.size);
                                askArrayUpdated = true;
                                break;
                            }
                        }

                        if(!askArrayUpdated) {
                            this.askHitBtc.push(new Models.MarketSide(Number(order.price), Number(order.size)));
                        }

                        this.askHitBtc = this.askHitBtc.filter((ask) => {
                            if(ask.size > 0) {
                                return ask;
                            }
                        })

                        this.askHitBtc.sort((a,b) => {
                            if(a.price < b.price) {
                                return -1;
                            } else if(a.price > b.price) {
                                return 1;
                            } return 0;
                        })
                    })
                }

                if(result.params.hasOwnProperty('bid')) {
                    result.params.bid.forEach((order) => {
                        
                        let bidArrayUpdated = false;

                        for(let bid in this.bidHitBtc) {
                            if(Number(order.price) == this.bidHitBtc[bid].price) {
                                this.bidHitBtc[bid].size == Number(order.size);
                                bidArrayUpdated = true;
                                break;
                            }
                        }

                        if(!bidArrayUpdated) {
                            this.bidHitBtc.push(new Models.MarketSide(Number(order.price), Number(order.size)));
                        }

                        this.bidHitBtc = this.bidHitBtc.filter((bid) => {
                            if(bid.size > 0) {
                                return bid;
                            }
                        })

                        this.bidHitBtc.sort((a,b) => {
                            if(a.price < b.price) {
                                return 1;
                            } else if(a.price > b.price) {
                                return -1;
                            } return 0;
                        })
                    })
                }

                this.askHitBtc = this.askHitBtc.slice(0,50);
                this.bidHitBtc = this.bidHitBtc.slice(0,50);

                // console.log("\n +++++++++++++++");
                // console.log(this.askHitBtc);
                // console.log(this.bidHitBtc);
                // console.log("+++++++++++++++");

                var fv = new Models.FairValue(this.ComputeFV(this.askHitBtc[0], this.bidHitBtc[0], this._qlParamRepo.latest.fvModel), this._timeProvider.utcNow());
                console.log("\n*** NEW FV : ",fv);
                this.latestFairValue = fv;
        }
    }
}