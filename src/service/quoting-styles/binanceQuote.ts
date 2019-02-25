/// <reference path="../../common/models.ts" />

import StyleHelpers = require("./helpers");
import Models = require("../../common/models");


export class BinanceQuote implements StyleHelpers.QuoteStyle {
    Mode = Models.QuotingMode.BinanceQuote;

    GenerateQuote = (input: StyleHelpers.QuoteInput) : StyleHelpers.GeneratedQuote => {
        const width = input.params.width;
        const size = input.params.size;

        if(!input.market.bids.length || !input.market.asks.length) {
            return null;
        }
        const bidPx = Math.max(input.market.bids[0].price - width);
        const askPx = input.market.asks[0].price + width;

        return new StyleHelpers.GeneratedQuote(bidPx, size, askPx, size);

    }
}