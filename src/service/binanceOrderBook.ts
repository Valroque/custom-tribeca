import Utils = require('./utils');
import { ConfigProvider } from './config';

export class BinanceOrderBookManager {
    private binanceOrderBook;
    private binanceContext;
    private proceedFurtherViaSocketMessages;
    private binanceSocket;
    private marketPair;
    private socketResetHours;

    private socketInterval;
    private count = 0;

    constructor(private config: ConfigProvider) {
        this.marketPair = this.config.GetString("TradedPair").split("/").join("");
        this.socketResetHours = this.config.GetString("BinanceSocketResetHours");

        this.binanceOrderBook = {
            bids: {},
            asks: {},
            lastUpdateId: null
        }

        this.binanceContext = {
            snapshotUpdateId: null,
            lastEventUpdateId: null,
            lastEventUpdateTime: null,
            messageQueue: []
        }

        this.proceedFurtherViaSocketMessages = false;

        this.handleSocketConnection();
        this.socketInterval = setInterval(this.handleSocketConnection, parseFloat(this.socketResetHours) * 60 * 60 * 1000);
    }

    private handleSocketConnection = () => {
        try {
            this.binanceSocket.socket.close();
        } catch (e) {
            console.log("\n Binance Socket Already Closed...");
        }
        this.resetData();
        try {
            this.startBinanceSocket();
            this.getBinanceSnapshot();
        } catch (e) {
            console.log("\nError : ",e)
            this.onSocketError();
        }
    }

    private onSocketError = (event?) => {
        console.log("\n== Error in Binance Socket Connection. Retrying Binance Socket Connection... == ", ++this.count);
        clearInterval(this.socketInterval);
        try {
            this.binanceSocket.socket.close();
        } catch (e) {
            console.log("\n Binance Socket Already Closed...");
        }

        Utils.delay(2000).then(() => {
            this.socketInterval = setInterval(this.handleSocketConnection, parseFloat(this.socketResetHours) * 60 * 60 * 1000);
            this.handleSocketConnection();
        })
    }

    private startBinanceSocket = () => {
        //console.log("\nStarting Binance Socket...");
        this.binanceSocket = new Utils.WebSoc(`wss://stream.binance.com:9443/ws/${this.marketPair.toLowerCase()}@depth`, {onMessage: this.decideDepthHandler, socketInfo: "Binance Orderbook Manager", onError: this.onSocketError});
    }

    private decideDepthHandler = (event) => {
        const depth = JSON.parse(event.data);

        if(this.proceedFurtherViaSocketMessages) {
            this.depthHandler(depth);
        } else {
            this.binanceContext.messageQueue.push(depth);
        }
        //console.log(this.getBest());
    }

    private getBinanceSnapshot = () => {
        Utils.getJSON(`https://www.binance.com/api/v1/depth?symbol=${this.marketPair}&limit=1000`)
        .then((orderBook: {bids, asks, lastUpdateId}) => {
            for(let bid of orderBook.bids) {
                this.binanceOrderBook.bids[bid[0]] = parseFloat(bid[1]);
            }

            for(let ask of orderBook.asks) {
                this.binanceOrderBook.asks[ask[0]] = parseFloat(ask[1]);
            }

            this.binanceOrderBook.lastUpdateId = orderBook.lastUpdateId;
            this.binanceContext.snapshotUpdateId = orderBook.lastUpdateId;
            this.binanceContext.messageQueue = this.binanceContext.messageQueue.filter(depth => depth.u > this.binanceContext.snapshotUpdateId)
            //console.log("\nReceived Snapshot From Binance...");
            this.updateBinanceOrderbook();
        })
        .catch(() => {
            console.log("\nBinance Snapshot Fetch Error");
        })
    }

    private updateBinanceOrderbook = () => {
        for (let depth of this.binanceContext.messageQueue) {
            console.log("\nDepth Updated from the Queue...");
            this.depthHandler(depth);
        }
        this.proceedFurtherViaSocketMessages = true;
    }

    private depthHandler = (depth) => {

        let updateDepthOrderbook = () => {
            for(let obj of depth.b) {
                this.binanceOrderBook.bids[obj[0]] = parseFloat(obj[1]);
                if(obj[1] == '0.00000000') {
                    delete this.binanceOrderBook.bids[obj[0]];
                }
            }
    
            for(let obj of depth.a) {
                this.binanceOrderBook.asks[obj[0]] = parseFloat(obj[1]);
                if(obj[1] == '0.00000000') {
                    delete this.binanceOrderBook.asks[obj[0]];
                }
            }
    
            this.binanceContext.lastEventUpdateId = depth.u;
            this.binanceContext.lastEventUpdateTime = depth.E;
        }
    
        if(this.binanceContext.lastEventUpdateId) {
            // when the snapshot was updated using the socket last time... continue via this ...
            const expectedUpdateId = this.binanceContext.lastEventUpdateId + 1;
            if(depth.U <= expectedUpdateId) {
                //console.log("\nSubsequent Depth Updates...");
                updateDepthOrderbook();
            } else {
                console.log("\n Unexpected Update Id..");
            }
        } else if(depth.U > this.binanceContext.snapshotUpdateId + 1) {
            console.log("\n Screwed data...");
            this.resetData();
            this.getBinanceSnapshot();
        } else if(depth.u < this.binanceContext.snapshotUpdateId + 1) {
            console.log("\n purana data ... no need to update the snapshot");
        } else {
            //console.log("\nFirst Time Depth Update...");
            updateDepthOrderbook();
        }
    }

    private resetData = () => {
        this.proceedFurtherViaSocketMessages = false;
        this.binanceOrderBook = { bids: {}, asks: {}, lastUpdateId: null };
        this.binanceContext = {
            snapshotUpdateId: null,
            lastEventUpdateId: null,
            lastEventUpdateTime: null,
            messageQueue: []
        }
    }

    private sortBids = () => {
        let sortedBids = {};
        let sorted = Object.keys(this.binanceOrderBook.bids).sort((a,b) => parseFloat(b) - parseFloat(a));
        for (let price of sorted) {
            sortedBids[price] = this.binanceOrderBook.bids[price];
        }
        return sortedBids;
    }

    private sortAsks = () => {
        let sortedAsks = {};
        let sorted = Object.keys(this.binanceOrderBook.asks).sort((a,b) => parseFloat(a) - parseFloat(b));
        for (let price of sorted) {
            sortedAsks[price] = this.binanceOrderBook.asks[price];
        }
        return sortedAsks;
    }
    
    private first = (object) => {
        return Object.keys(object).shift();
    }
    
    private printBest = () => {
        const bids = this.sortBids();
        const asks = this.sortAsks();
        console.log("\nBest Bid : ", this.first(bids));
        console.log("\nBest Ask : ", this.first(asks));
    }

    public getBest = () => {
        const asks = this.sortAsks();
        const bids = this.sortBids();
        const bestAskPrice = this.first(asks);
        const bestBidPrice = this.first(bids);

        const finalObject = {
            'ask': {
                'price': bestAskPrice,
                'size': asks[bestAskPrice]
            },
            'bid': {
                'price': bestBidPrice,
                'size': bids[bestBidPrice]
            }
        }

        return finalObject;
    }

    public getOrderBook = () => {
        const finalObject = {
            'asks': this.sortAsks(),
            'bids': this.sortBids()
        }

        return finalObject;
    }
}