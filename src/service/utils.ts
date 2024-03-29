import Models = require("../common/models");
import moment = require('moment');
import events = require("events");
import util = require("util");
import _ = require("lodash");
import * as request from "request";
import * as Q from "q";
import WebSocket = require('ws');
import crypto = require('crypto');
import mongodb = require('mongodb');
import Config = require("./config");

 

require('events').EventEmitter.prototype._maxListeners = 100;

const config = new Config.ConfigProvider();
const _authorizationBearer: string = config.GetString("AuthorizationBearer");
const _tribecaClientId: string = config.GetString("TribecaClientId");
const _tribecaClientSecret: string = config.GetString("TribecaClientSecret");

export const delay = ms => new Promise(res => setTimeout(res,ms));

export const date = () => new Date();

export function fastDiff(x: Date, y: Date) : number {
    return x.getTime() - y.getTime();
}

export function timeOrDefault(x: Models.ITimestamped, timeProvider : ITimeProvider): Date {
    if (x === null)
        return timeProvider.utcNow();

    if (typeof x !== "undefined" && typeof x.time !== "undefined")
        return x.time;

    return timeProvider.utcNow();
}

// typesafe event raiser
type EvtCallback<T> = (data?: T) => void;
export class Evt<T> {
    private _singleCallback : EvtCallback<T> = null;
    private _multiCallback = new Array<EvtCallback<T>>();

    public on = (handler: EvtCallback<T>) => {
        if (this._singleCallback) {
            this._multiCallback = [this._singleCallback, handler];            
            this._singleCallback = null;
        }
        else if (this._multiCallback.length > 0) {
            this._multiCallback.push(handler);
        }
        else {
            this._singleCallback = handler;
        }
    };
    
    public off = (handler: EvtCallback<T>) => {
        if (this._multiCallback.length > 0) 
            this._multiCallback = _.pull(this._multiCallback, handler);
        if (this._singleCallback === handler) 
            this._singleCallback = null;
    };

    public trigger = (data?: T) => {
        if (this._singleCallback !== null) {
            this._singleCallback(data);
        }
        else {
            const len = this._multiCallback.length;
            for (let i = 0; i < len; i++)
                this._multiCallback[i](data);
        }
    };
}

export function roundSide(x: number, minTick: number, side: Models.Side) {
    switch (side) {
        case Models.Side.Bid: return roundDown(x, minTick);
        case Models.Side.Ask: return roundUp(x, minTick);
        default: return roundNearest(x, minTick);
    }
}

export function roundNearest(x: number, minTick: number) {
    const up = roundUp(x, minTick);
    const down = roundDown(x, minTick);
    return (Math.abs(x - down) > Math.abs(up - x)) ? up : down;
}

export function roundUp(x: number, minTick: number) {
    return Math.ceil(x/minTick)*minTick;
}

export function roundDown(x: number, minTick: number) {
    return Math.floor(x/minTick)*minTick;
}

export interface ITimeProvider {
    utcNow() : Date;
    setTimeout(action: () => void, time: moment.Duration);
    setImmediate(action: () => void);
    setInterval(action: () => void, time: moment.Duration);
}

export interface IBacktestingTimeProvider extends ITimeProvider {
    scrollTimeTo(time : moment.Moment);
}

export class RealTimeProvider implements ITimeProvider {
    constructor() { }
    
    utcNow = () => new Date();
    
    setTimeout = (action: () => void, time: moment.Duration) => setTimeout(action, time.asMilliseconds());
    
    setImmediate = (action: () => void) => setImmediate(action);
    
    setInterval = (action: () => void, time: moment.Duration) => setInterval(action, time.asMilliseconds());
}

export interface IActionScheduler {
    schedule(action: () => void);
}

export class ImmediateActionScheduler implements IActionScheduler {
    constructor(private _timeProvider: ITimeProvider) {}
    
    private _shouldSchedule = true;
    public schedule = (action: () => void) => {
        if (this._shouldSchedule) {
            this._shouldSchedule = false;
            this._timeProvider.setImmediate(() => {
                action();
                this._shouldSchedule = true;
            });
        }
    };
}

export class WebSoc {
    public socket;
    private aboutSocket;

    constructor(url, options: {onMessage?, onError?, onOpen?, onClose?, socketInfo?: string}) {
        this.socket = new WebSocket(url, {rejectUnauthorized: false});
        this.socket.onopen = options.onOpen || this.onOpen;
        this.socket.onclose = options.onClose || this.onClose;
        this.socket.onmessage = options.onMessage || this.onMessage;
        this.socket.onerror = options.onError || this.onError;
        this.aboutSocket = options.socketInfo || "No Info Available";
    }

    private onOpen = (event) => {
        console.log(`\n=== Socket <${this.aboutSocket}> Connection Open ===`);
    }

    private onClose = (event) => {
        console.log(`\n=== Socket <${this.aboutSocket}> Connection Closed ===`);
    }

    private onMessage = (event) => {
        console.log(`\n=== Socket <${this.aboutSocket}> Message Received ===`, JSON.parse(event.data));
    }

    private onError = (event) => {
        console.log(`\n=== Socket <${this.aboutSocket}> Error ===`, event);
    }
}

export class MongoSave {

    private MongoClient;
    private readonly config;
    private readonly collectionName;

    constructor(collectionName){
        this.config = new Config.ConfigProvider();
        this.MongoClient = new mongodb.MongoClient();
        this.collectionName = collectionName;
    }

    public connectToCollection = async () => {
        const db = await this.MongoClient.connect(this.config.GetString("MongoDbUrl"));
        return await db.collection(this.collectionName);
    }

}

export function getJSON<T>(url: string, qs?: any) : Promise<T> {
    return new Promise((resolve, reject) => {
        request({url: url, qs: qs}, (err: Error, resp, body) => {
            if (err) {
                reject(err);
            }
            else {
                try {
                    resolve(JSON.parse(body));
                }
                catch (e) {
                    reject(e);
                }
            }
        });
    });
 }

export function postJSON<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
        request({
            url: url,
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + _authorizationBearer,
                'Content-Type': 'application/json'
            }
        },
        (err, resp, body) => {
            if(err) {
                reject(err);
            }
            else {
                try {
                    resolve(JSON.parse(body));
                }
                catch(e) {
                    reject(e);
                }
            }
        }
        )
    })
}

export function sendOrderBinance(query, signature) {
    return new Promise((resolve, reject) => {
        request({
            'method': 'POST',
            'url': 'https://api.binance.com/api/v3/order' + '?' + query + '&signature=' + signature, 
            'headers': {
                'Content-type': 'application/x-www-form-urlencoded',
                'X-MBX-APIKEY': config.GetString("BINANCE_API_KEY")
            }
        },
            (err,body,res) => {
            if(err) {
                reject(err);
            } else {
                resolve(res);
            }
        })
    })
}

export function createSignature(requestBody) {
    let query = Object.keys(requestBody).reduce((a,k) => {
        a.push(k + '=' + encodeURIComponent(requestBody[k]))
        return a;
    },[]).join('&');

    let signature = crypto.createHmac('sha256', config.GetString("BINANCE_SECRET_KEY")).update(query).digest('hex');
    return {query, signature}
}

export function sendPostRequest(url: string, data: {}) {
    data['client_id'] = _tribecaClientId;
    data['client_secret'] = _tribecaClientSecret;
    return new Promise( (resolve, reject) => {
        request(
            {
                method: 'POST',
                url: url,
                headers: {
                    // 'Authorization': 'Bearer ' + _authorizationBearer,
                    'Content-Type': 'application/json'
                },
                json: data
            },
            (err, body, resp) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(resp);
                }
            });
    })
}