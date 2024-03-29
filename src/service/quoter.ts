/// <reference path="../common/models.ts" />
/// <reference path="config.ts" />
/// <reference path="utils.ts" />
///<reference path="interfaces.ts"/>

import * as moment from "moment";
import Config = require("./config");
import Models = require("../common/models");
import Utils = require("./utils");
import Interfaces = require("./interfaces");

class QuoteOrder {
    constructor(public quote: Models.Quote, public orderId: string) { }
}

// aggregator for quoting
export class Quoter {
    private _bidQuoter: ExchangeQuoter;
    private _askQuoter: ExchangeQuoter;

    constructor(broker: Interfaces.IOrderBroker,
        exchBroker: Interfaces.IBroker) {
        this._bidQuoter = new ExchangeQuoter(broker, exchBroker, Models.Side.Bid);
        this._askQuoter = new ExchangeQuoter(broker, exchBroker, Models.Side.Ask);
    }

    public updateQuote = async (q: Models.Timestamped<Models.Quote>, side: Models.Side) => {
        console.log("\n## quoter.ts updateQuote is called");
        switch (side) {
            case Models.Side.Ask:
                try {
                    return await this._askQuoter.updateQuote(q);
                }
                catch (e) {
                    return Promise.reject(e);
                }
            case Models.Side.Bid:
                try {
                    return await this._bidQuoter.updateQuote(q);
                }
                catch (e) {
                    return Promise.reject(e);
                }
        }
    };

    public cancelQuote = (s: Models.Timestamped<Models.Side>): Models.QuoteSent => {
        switch (s.data) {
            case Models.Side.Ask:
                return this._askQuoter.cancelQuote(s.time);
            case Models.Side.Bid:
                return this._bidQuoter.cancelQuote(s.time);
        }
    };

    public quotesSent = (s: Models.Side) => {
        console.log("## quoter.ts quotesSent is called");
        switch (s) {
            case Models.Side.Ask:
                return this._askQuoter.quotesSent;
            case Models.Side.Bid:
                return this._bidQuoter.quotesSent;
        }
    };
}

// wraps a single broker to make orders behave like quotes
export class ExchangeQuoter {
    private _activeQuote: QuoteOrder = null;
    private _exchange: Models.Exchange;

    public quotesSent: QuoteOrder[] = [];

    constructor(private _broker: Interfaces.IOrderBroker,
        private _exchBroker: Interfaces.IBroker,
        private _side: Models.Side) {
        this._exchange = _exchBroker.exchange();
        this._broker.OrderUpdate.on(this.handleOrderUpdate);
    }

    private handleOrderUpdate = (o: Models.OrderStatusReport) => {
        console.log("\n## quoter.ts handleOrderUpdate is called");
        switch (o.orderStatus) {
            case Models.OrderStatus.Cancelled:
            case Models.OrderStatus.Complete:
            case Models.OrderStatus.Rejected:
                const bySide = this._activeQuote;
                if (bySide !== null && bySide.orderId === o.orderId) {
                    this._activeQuote = null;
                }

                this.quotesSent = this.quotesSent.filter(q => q.orderId !== o.orderId);
        }
    };

    public updateQuote = async (q: Models.Timestamped<Models.Quote>) => {
        console.log("\n## quoter.ts updateQuote is called");
        if (this._exchBroker.connectStatus !== Models.ConnectivityStatus.Connected)
            return Models.QuoteSent.UnableToSend;

        if (this._activeQuote !== null) {
            return this.modify(q);
        }
         
        try {
            return await this.start(q);
        } 
        catch(e) {
            return Promise.reject(e);
        }
    };

    public cancelQuote = (t: Date): Models.QuoteSent => {
        if (this._exchBroker.connectStatus !== Models.ConnectivityStatus.Connected)
            return Models.QuoteSent.UnableToSend;

        return this.stop(t);
    };

    private modify = (q: Models.Timestamped<Models.Quote>): Models.QuoteSent => {
        this.stop(q.time);
        this.start(q).catch((err) => console.log(err));
        return Models.QuoteSent.Modify;
    };

    private start = async (q: Models.Timestamped<Models.Quote>) => {
        console.log("\n## quoter.ts start is called");
        const existing = this._activeQuote;

        const newOrder = new Models.SubmitNewOrder(this._side, q.data.size, Models.OrderType.Limit,
            q.data.price, Models.TimeInForce.GTC, this._exchange, q.time, true, Models.OrderSource.Quote);

        let sent;
        try {
            sent = await this._broker.sendOrder(newOrder);    
        }
        catch(e) {
            return Promise.reject(e);
        }

        console.log("\n## quoter.ts start : sent : ",sent);
        const quoteOrder = new QuoteOrder(q.data, sent.sentOrderClientId);
        this.quotesSent.push(quoteOrder);
        this._activeQuote = quoteOrder;
        return Models.QuoteSent.First;
    };

    private stop = (t: Date): Models.QuoteSent => {
        if (this._activeQuote === null) {
            return Models.QuoteSent.UnsentDelete;
        }

        console.log("\n## quoter.ts stop : this._activeQuote : ", this._activeQuote);

        const cxl = new Models.OrderCancel(this._activeQuote.orderId, this._exchange, t);
        this._broker.cancelOrder(cxl);
        this._activeQuote = null;
        return Models.QuoteSent.Delete;
    };
}