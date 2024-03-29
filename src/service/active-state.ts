/// <reference path="../common/models.ts" />
/// <reference path="../common/messaging.ts" />
/// <reference path="config.ts" />
/// <reference path="utils.ts" />
/// <reference path="interfaces.ts"/>

import Config = require("./config");
import Models = require("../common/models");
import Messaging = require("../common/messaging");
import Utils = require("./utils");
import Interfaces = require("./interfaces");
import Safety = require("./safety");
import log from "./logging";

export class ActiveRepository implements Interfaces.IRepository<boolean> {
    private _log = log("tribeca:active");

    NewParameters = new Utils.Evt();

    private _savedQuotingMode: boolean = false;
    public get savedQuotingMode(): boolean {
        return this._savedQuotingMode;
    }

    private _latest: boolean = false;
    public get latest(): boolean {
        return this._latest;
    }

    constructor(startQuoting: boolean,
        private _exchangeConnectivity: Interfaces.IBrokerConnectivity,
        private _pub: Messaging.IPublish<boolean>,
        private _rec: Messaging.IReceive<boolean>) {
        console.log("Starting saved quoting state: ", startQuoting);
        this._log.info("Starting saved quoting state: ", startQuoting);
        this._savedQuotingMode = startQuoting;

        _pub.registerSnapshot(() => [this.latest]);

        // receiver is registered and the handler is called whenever data is received...
        _rec.registerReceiver(this.handleNewQuotingModeChangeRequest);

        // therefore, i triggered the function on my own with the boolean value as expected...
        // setTimeout(() => {
        //     console.log("\n## Calling this.handleNewQuotingModeChangeRequest ... ");
        //     this.handleNewQuotingModeChangeRequest(true);
        // },15000)

        _exchangeConnectivity.ConnectChanged.on(() => {
            console.log("\n## EXCHANGE CONNECTIVITY STATUS CHANGE IN ACTIVE-STATE.TS...");
            this.updateParameters()
        });
    }

    private handleNewQuotingModeChangeRequest = (v: boolean) => {
        console.log("\n## active-states.ts handleNewQuotingModeChangeREquest : ", v);
        if (v !== this._savedQuotingMode) {
            this._savedQuotingMode = v;
            this._log.info("Changed saved quoting state", this._savedQuotingMode);
            this.updateParameters();
        }

        this._pub.publish(this.latest);
    };

    private reevaluateQuotingMode = (): boolean => {
        //console.log("\n## active-state.ts reevaluateQuotingMode : this._exchangeConnectivity.connectStatus : ",this._exchangeConnectivity.connectStatus);
        if (this._exchangeConnectivity.connectStatus !== Models.ConnectivityStatus.Connected) return false;
        return this._savedQuotingMode;
    };

    private updateParameters = () => {

        console.log("\n## UPDATE PARAMETERS CALLED ...");
        var newMode = this.reevaluateQuotingMode();

        if (newMode !== this._latest) {
            console.log("\n## INSIDE THE IF BLOCK...");
            this._latest = newMode;
            this._log.info("Changed quoting mode to", this.latest);
            this.NewParameters.trigger();
            this._pub.publish(this.latest);
        }
    }
};
