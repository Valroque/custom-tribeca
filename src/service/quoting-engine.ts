/// <reference path="../common/models.ts" />
/// <reference path="../common/messaging.ts" />
/// <reference path="config.ts" />
/// <reference path="utils.ts" />
/// <reference path="interfaces.ts"/>
/// <reference path="quoter.ts"/>
/// <reference path="safety.ts"/>
/// <reference path="statistics.ts"/>
/// <reference path="active-state.ts"/>
/// <reference path="fair-value.ts"/>
/// <reference path="market-filtration.ts"/>
/// <reference path="quoting-parameters.ts"/>
/// <reference path="position-management.ts"/>
/// <reference path="./quoting-styles/style-registry.ts"/>

import Config = require("./config");
import Models = require("../common/models");
import Messaging = require("../common/messaging");
import Utils = require("./utils");
import Interfaces = require("./interfaces");
import Quoter = require("./quoter");
import Safety = require("./safety");
import util = require("util");
import _ = require("lodash");
import Statistics = require("./statistics");
import Active = require("./active-state");
import FairValue = require("./fair-value");
import MarketFiltration = require("./market-filtration");
import QuotingParameters = require("./quoting-parameters");
import PositionManagement = require("./position-management");
import moment = require('moment');
import QuotingStyleRegistry = require("./quoting-styles/style-registry");
import {QuoteInput} from "./quoting-styles/helpers";
import log from "./logging";
import { clearInterval } from "timers";
import { BinanceOrderBookManager } from "./binanceOrderBook";

export class QuotingEngine {
    private _log = log("quotingengine");

    public QuoteChanged = new Utils.Evt<Models.TwoSidedQuote>();

    private _latest: Models.TwoSidedQuote = null;
    public get latestQuote() { return this._latest; }
    public set latestQuote(val: Models.TwoSidedQuote) {
        if (!quotesChanged(this._latest, val, this._details.minTickIncrement)) 
            return;

        this._latest = val;
        this.QuoteChanged.trigger();
        this._quotePublisher.publish(this._latest);
    }

    private recalcQuotesTimer;
    private currentQuotingMode = [];
    private marketPair;
    private binanceOrderBook: Models.Market;
    private binanceTimer;
    private recalcBinanceTimer;

    constructor(
        private _registry: QuotingStyleRegistry.QuotingStyleRegistry,
        private _timeProvider: Utils.ITimeProvider,
        private _filteredMarkets: MarketFiltration.MarketFiltration,
        private _fvEngine: FairValue.FairValueEngine,
        private _qlParamRepo: QuotingParameters.QuotingParametersRepository,
        private _quotePublisher: Messaging.IPublish<Models.TwoSidedQuote>,
        private _orderBroker: Interfaces.IOrderBroker,
        private _positionBroker: Interfaces.IPositionBroker,
        private _details: Interfaces.IBroker,
        private _ewma: Interfaces.IEwmaCalculator,
        private _targetPosition: PositionManagement.TargetBasePositionManager,
        private _safeties: Safety.SafetyCalculator,
        private _binanceOB: BinanceOrderBookManager) {

        this.marketPair = new Config.ConfigProvider().GetString("TradedPair").split("/").join("");
        _quotePublisher.registerSnapshot(() => this.latestQuote === null ? [] : [this.latestQuote]);

        this.decideAndCalculateQuote(_qlParamRepo.latest.mode);
        _qlParamRepo.NewParameters.on(() => this.decideAndCalculateQuote(_qlParamRepo.latest.mode))
    }

    private recalcWithoutInputTime = () => this.recalcQuote(this._timeProvider.utcNow());
    private recalcWithoutInputTimeBinance = () => this.recalcQuoteBinance(this._timeProvider.utcNow());

    private decideAndCalculateQuote(quotingMode: Models.QuotingMode) {
        
        if(!_.includes(this.currentQuotingMode,quotingMode)) {
            switch(quotingMode) {
                case Models.QuotingMode.BinanceQuote:

                    console.log("\n == CHANGING THE QUOTING MODE TO BINANCE .. ");
                    //this._filteredMarkets.FilteredMarketChanged.off(m => this.recalcQuote(Utils.timeOrDefault(m, this._timeProvider)));
                    // this._ewma.Updated.off(this.recalcWithoutInputTime);
                    // this._targetPosition.NewTargetPosition.off(this.recalcWithoutInputTime);
                    // this._safeties.NewValue.off(this.recalcWithoutInputTime);        
                    // this._orderBroker.Trade.off(this.recalcWithoutInputTime);
                    clearInterval(this.recalcQuotesTimer);

                    //this._targetPosition.NewTargetPosition.on(this.recalcWithoutInputTimeBinance);
                    this.callRecalcBinanceRandom();
                    this.currentQuotingMode = [Models.QuotingMode.BinanceQuote];
                    console.log("\n == CHANGED THE QUOTING MODE TO BINANCE == ");
                    break;

                default:
                    console.log("\n == CHANGING THE QUOTING MODE TO DEFAULTS .. ");

                    //this._targetPosition.NewTargetPosition.off(this.recalcWithoutInputTimeBinance);
                    clearTimeout(this.binanceTimer);                        

                    //this._filteredMarkets.FilteredMarketChanged.on(m => this.recalcQuote(Utils.timeOrDefault(m, this._timeProvider)));
                    // this._ewma.Updated.on(this.recalcWithoutInputTime);
                    // this._targetPosition.NewTargetPosition.on(this.recalcWithoutInputTime);
                    // this._safeties.NewValue.on(this.recalcWithoutInputTime);        
                    // this._orderBroker.Trade.on(this.recalcWithoutInputTime);
                    this.recalcQuotesTimer = this._timeProvider.setInterval(this.recalcWithoutInputTime, moment.duration(1, "seconds"));
                    this.currentQuotingMode = [Models.QuotingMode.Depth, Models.QuotingMode.InverseJoin, Models.QuotingMode.InverseTop, Models.QuotingMode.Join, Models.QuotingMode.Mid, Models.QuotingMode.PingPong, Models.QuotingMode.Top];
                    console.log("\n == CHANGED THE QUOTING MODE TO DEFAULTS == ");
                    break;    
            }
        }

    }

    private callRecalcBinanceRandom() {
        this.binanceTimer = setTimeout(() => {
            this.recalcQuoteBinance(this._timeProvider.utcNow());
            this.callRecalcBinanceRandom();
        },Math.random() * 5000)
    }

    private computeQuote(filteredMkt: Models.Market, fv: Models.FairValue) {
        const params = this._qlParamRepo.latest;
        const minTick = this._details.minTickIncrement;
        //console.log("\n ## filteredMkt in Quoting Engine : ",filteredMkt);
        const input = new QuoteInput(filteredMkt, fv, params, minTick);
        //console.log("\n ## INPUT : ",input);
        const unrounded = this._registry.Get(params.mode).GenerateQuote(input);

        //console.log("\n## computeQuote : unrounded 1: ",unrounded);
        
        if (unrounded === null)
            return null;

        if (params.ewmaProtection && this._ewma.latest !== null) {
            if (this._ewma.latest > unrounded.askPx) {
                unrounded.askPx = Math.max(this._ewma.latest, unrounded.askPx);
            }

            if (this._ewma.latest < unrounded.bidPx) {
                unrounded.bidPx = Math.min(this._ewma.latest, unrounded.bidPx);
            }
        }

        //console.log("\n## computeQuote : unrounded 2: ",unrounded);

        const tbp = this._targetPosition.latestTargetPosition;
        if (tbp === null) {
            this._log.warn("cannot compute a quote since no position report exists!");
            return null;
        }
        const targetBasePosition = tbp.data;
        
        const latestPosition = this._positionBroker.latestReport;
        const totalBasePosition = latestPosition.baseAmount + latestPosition.baseHeldAmount;
        
        if (totalBasePosition < targetBasePosition - params.positionDivergence) {
            unrounded.askPx = null;
            unrounded.askSz = null;
            if (params.aggressivePositionRebalancing)
                unrounded.bidSz = Math.min(params.aprMultiplier*params.size, targetBasePosition - totalBasePosition);
        }
        
        // console.log("\n## latestPosition : ",latestPosition);
        // console.log("## totalBasePosition : ",totalBasePosition);
        // console.log("## targetBasePosition : ",targetBasePosition);
        // console.log("## params.positionDivergence : ", params.positionDivergence);

        if (totalBasePosition > targetBasePosition + params.positionDivergence) {
            unrounded.bidPx = null;
            unrounded.bidSz = null;
            if (params.aggressivePositionRebalancing)
                unrounded.askSz = Math.min(params.aprMultiplier*params.size, totalBasePosition - targetBasePosition);
        }

        //console.log("\n## computeQuote : unrounded 3: ",unrounded);
        
        const safety = this._safeties.latest;
        if (safety === null) {
            return null;
        }
        
        if (params.mode === Models.QuotingMode.PingPong) {
          if (unrounded.askSz && safety.buyPing && unrounded.askPx < safety.buyPing + params.width)
            unrounded.askPx = safety.buyPing + params.width;
          if (unrounded.bidSz && safety.sellPong && unrounded.bidPx > safety.sellPong - params.width)
            unrounded.bidPx = safety.sellPong - params.width;
        }

        //console.log("\n## computeQuote : unrounded 4: ",unrounded);
        
        if (safety.sell > params.tradesPerMinute) {
            unrounded.askPx = null;
            unrounded.askSz = null;
        }

        //console.log("\n## computeQuote : unrounded 5: ",unrounded);

        if (safety.buy > params.tradesPerMinute) {
            unrounded.bidPx = null;
            unrounded.bidSz = null;
        }

        //console.log("\n## computeQuote : unrounded 6: ",unrounded);
        
        if (unrounded.bidPx !== null) {
            unrounded.bidPx = Utils.roundSide(unrounded.bidPx, minTick, Models.Side.Bid);
            unrounded.bidPx = Math.max(0, unrounded.bidPx);
        }

        //console.log("\n## computeQuote : unrounded 7: ",unrounded);
        
        if (unrounded.askPx !== null) {
            unrounded.askPx = Utils.roundSide(unrounded.askPx, minTick, Models.Side.Ask);
            unrounded.askPx = Math.max(unrounded.bidPx + minTick, unrounded.askPx);
        }

        //console.log("\n## computeQuote : unrounded 8: ",unrounded);
        
        if (unrounded.askSz !== null) {
            unrounded.askSz = Utils.roundDown(unrounded.askSz, minTick);
            unrounded.askSz = Math.max(minTick, unrounded.askSz);
        }

        //console.log("\n## computeQuote : unrounded 9: ",unrounded);
        
        if (unrounded.bidSz !== null) {
            unrounded.bidSz = Utils.roundDown(unrounded.bidSz, minTick);
            unrounded.bidSz = Math.max(minTick, unrounded.bidSz);
        }

        //console.log("## quoting-engine.ts computeQuote : ", unrounded);
        return unrounded;
    }

    private recalcQuote = (t: Date) => {
        const fv = this._fvEngine.latestFairValue;

        //console.log("## quoting-engine.ts recalcQuote : fv : ",fv);
        if (fv == null) {
            this.latestQuote = null;
            return;
        }

        const filteredMkt = this._filteredMarkets.latestFilteredMarket;
        if (filteredMkt == null) {
            this.latestQuote = null;
            return;
        }

        /**
         * handled the case when filtered market bids,asks are empty, leading to crash of tribeca when the default modes try to calculate quotes.
         * Tribeca assumes that there exists a top quote...
         */
        if(filteredMkt.asks.length < 1 || filteredMkt.bids.length < 1) return; 

        const genQt = this.computeQuote(filteredMkt, fv);

        if (genQt === null) {
            this.latestQuote = null;
            return;
        }

        this.latestQuote = new Models.TwoSidedQuote(
            this.quotesAreSame(new Models.Quote(genQt.bidPx, genQt.bidSz), this.latestQuote, Models.Side.Bid),
            this.quotesAreSame(new Models.Quote(genQt.askPx, genQt.askSz), this.latestQuote, Models.Side.Ask),
            t
            );

        console.log("## quoting-engine.ts recalcQuote : latestQuote : ",this.latestQuote);
    };

    private recalcQuoteBinance = async (t: Date) => {
        
        const orderBook = this._binanceOB.getOrderBook();

        let askBinance: Models.MarketSide[] = [];
        let bidBinance: Models.MarketSide[] = [];

        let totalBids = 0;
        for(let price of Object.keys(orderBook.bids)) {
            bidBinance.push(new Models.MarketSide(Number(price), Number(orderBook.bids[price])));
            if(++totalBids == 10) break;
        }

        let totalAsks = 0;
        for(let price of Object.keys(orderBook.asks)) {
            askBinance.push(new Models.MarketSide(Number(price), Number(orderBook.asks[price])));
            if(++totalAsks == 10) break;
        }

        this.binanceOrderBook = new Models.Market(bidBinance, askBinance, this._timeProvider.utcNow());

        const fv = this._fvEngine.latestFairValue;
        const genQt = this.computeQuote(this.binanceOrderBook, fv);

        if (genQt === null) {
            this.latestQuote = null;
            return;
        }

        this.latestQuote = new Models.TwoSidedQuote(
            this.quotesAreSame(new Models.Quote(genQt.bidPx, genQt.bidSz), this.latestQuote, Models.Side.Bid),
            this.quotesAreSame(new Models.Quote(genQt.askPx, genQt.askSz), this.latestQuote, Models.Side.Ask),
            t
            );

        console.log("## quoting-engine.ts recalcQuote : latestQuote : ",this.latestQuote);
    }

    private quotesAreSame(
            newQ: Models.Quote, 
            prevTwoSided: Models.TwoSidedQuote, 
            side: Models.Side): Models.Quote {
                
        if (newQ.price === null && newQ.size === null) return null;
        if (prevTwoSided == null) return newQ;
        
        const previousQ = Models.Side.Bid === side ? prevTwoSided.bid : prevTwoSided.ask;
        
        if (previousQ == null && newQ != null) return newQ;
        if (Math.abs(newQ.size - previousQ.size) > 5e-3) return newQ;
        
        if (Math.abs(newQ.price - previousQ.price) < this._details.minTickIncrement) {
            return previousQ;
        }
        
        let quoteWasWidened = true;
        if (Models.Side.Bid === side && previousQ.price < newQ.price) quoteWasWidened = false;
        if (Models.Side.Ask === side && previousQ.price > newQ.price) quoteWasWidened = false;
        
        // prevent flickering
        if (!quoteWasWidened && Math.abs(Utils.fastDiff(new Date(), prevTwoSided.time)) < 300) {
            return previousQ;
        }
        
        return newQ;
    }
}

const quoteChanged = (o: Models.Quote, n: Models.Quote, tick: number) : boolean => { 
    if ((!o && n) || (o && !n)) return true;
    if (!o && !n) return false;

    const oPx = (o && o.price) || 0;
    const nPx = (n && n.price) || 0;
    if (Math.abs(oPx - nPx) > tick) 
        return true;

    const oSz = (o && o.size) || 0;
    const nSz = (n && n.size) || 0;
    return Math.abs(oSz - nSz) > .001;
}

const quotesChanged = (o: Models.TwoSidedQuote, n: Models.TwoSidedQuote, tick: number) : boolean => {
    if ((!o && n) || (o && !n)) return true;
    if (!o && !n) return false;

    if (quoteChanged(o.bid, n.bid, tick)) return true;
    if (quoteChanged(o.ask, n.ask, tick)) return true;
    return false;
}