/// <reference path="../common/models.ts" />
/// <reference path="../common/messaging.ts" />
/// <reference path="shared_directives.ts"/>

import angular = require("angular");
import Models = require("../common/models");
import io = require("socket.io-client");
import moment = require("moment");
import Messaging = require("../common/messaging");
import Shared = require("./shared_directives");

class Level {
    bidPrice: string;
    bidSize: number;
    askPrice: string;
    askSize: number;

    bidClass: string;
    askClass: string;
}

class askLevel {
    askPrice: string;
    askSize: number;
}

class bidLevel {
    bidPrice: string;
    bidSize: number;
}

interface MarketQuotingScope extends ng.IScope {
    levels: Level[];
    askLevels: askLevel[];
    bidLevels: bidLevel[];
    qBidSz: number;
    qBidPx: string;
    fairValue: string;
    spreadValue: string;
    qAskPx: string;
    qAskSz: number;
    extVal: string;

    bidIsLive: boolean;
    askIsLive: boolean;
}

var MarketQuotingController = ($scope: MarketQuotingScope,
        $log: ng.ILogService,
        subscriberFactory: Shared.SubscriberFactory,
        product: Shared.ProductState) => {

    var toPrice = (px: number) : string => px.toFixed(product.fixed);
    var toPercent = (askPx: number, bidPx: number): string => ((askPx - bidPx) / askPx * 100).toFixed(2);

    var clearMarket = () => {
        $scope.levels = [];
        $scope.askLevels = [];
        $scope.bidLevels = [];
    };
    clearMarket();

    var clearBid = () => {
        $scope.qBidPx = null;
        $scope.qBidSz = null;
    };

    var clearAsk = () => {
        $scope.qAskPx = null;
        $scope.qAskSz = null;
    };

    var clearSpread = () => {
        $scope.spreadValue = null;
    }

    var clearQuote = () => {
        clearBid();
        clearAsk();
        clearSpread();
    };

    var clearFairValue = () => {
        $scope.fairValue = null;
    };

    var clearQuoteStatus = () => {
        $scope.bidIsLive = false;
        $scope.askIsLive = false;
    };

    var clearExtVal = () => {
        $scope.extVal = null;
    };

    var updateMarket = (update: Models.Market) => {

        //console.log("### update data : ", update);
        if (update == null) {
            clearMarket();
            return;
        }

        $scope.levels = [];

        for (var i = 0; i < update.asks.length; i++) {
            if (angular.isUndefined($scope.levels[i]))
                $scope.levels[i] = new Level();
            
            $scope.levels[i].askPrice = toPrice(update.asks[i].price);
            $scope.levels[i].askSize = update.asks[i].size;
        }

        for (var i = 0; i < update.bids.length; i++) {
            if (angular.isUndefined($scope.levels[i]))
                $scope.levels[i] = new Level();

            $scope.levels[i].bidPrice = toPrice(update.bids[i].price);
            $scope.levels[i].bidSize = update.bids[i].size;
        }

        // if(!$scope.levels.length) {
        //     console.log("## length of levels is 0. inside the first if block...");
        //     for(let ask in update.asks) {
        //         $scope.askLevels.push(new askLevel);
        //         $scope.askLevels[ask].askPrice = toPrice(update.asks[ask].price);
        //         $scope.askLevels[ask].askSize = update.asks[ask].size;
        //     }

        //     for(let bid in update.bids) {
        //         $scope.bidLevels.push(new bidLevel);
        //         $scope.bidLevels[bid].bidPrice = toPrice(update.bids[bid].price);
        //         $scope.bidLevels[bid].bidSize = update.bids[bid].size;
        //     }

        //     let askLevelsLength = $scope.askLevels.length;
        //     let bidLevelsLength = $scope.bidLevels.length;
        //     let i = 0;

        //     for(i = 0; i < askLevelsLength && i < bidLevelsLength; ++i) {
        //         $scope.levels[i] = new Level();

        //         $scope.levels[i].askPrice = $scope.askLevels[i].askPrice;
        //         $scope.levels[i].askSize = $scope.askLevels[i].askSize;
                
        //         $scope.levels[i].bidPrice = $scope.bidLevels[i].bidPrice;
        //         $scope.levels[i].bidSize = $scope.bidLevels[i].bidSize;
        //     }

        //     while(i < askLevelsLength) {
        //         $scope.levels[i] = new Level();

        //         $scope.levels[i].askPrice = $scope.askLevels[i].askPrice;
        //         $scope.levels[i].askSize = $scope.askLevels[i].askSize;
        //         ++i;
        //     }

        //     while(i < bidLevelsLength) {
        //         $scope.levels[i] = new Level();

        //         $scope.levels[i].bidPrice = $scope.bidLevels[i].bidPrice;
        //         $scope.levels[i].bidSize = $scope.bidLevels[i].bidSize;
        //         ++i;
        //     }

        // } else {
        //     console.log("## inside the else block, length of levels is not 0...");
        //     for(let ask in update.asks) {
        //         let askLevelUpdated = false;
        //         for(let askLv in $scope.askLevels) {
        //             console.log("*** ask comparison : ",$scope.askLevels[askLv].askPrice,toPrice(update.asks[ask].price) )
        //             if($scope.askLevels[askLv].askPrice == toPrice(update.asks[ask].price)) {
        //                 $scope.askLevels[askLv].askSize = update.asks[ask].size;
        //                 askLevelUpdated = true;
        //                 console.log("## ask matched price updated : ",$scope.askLevels[askLv].askPrice,toPrice(update.asks[ask].price));
        //             }
        //         }

        //         if(!askLevelUpdated) {
        //             console.log("## no ask price matched. inside !askLevelUpdated");
        //             let askLevelsLength = $scope.askLevels.length;
        //             $scope.askLevels.push(new askLevel());
        //             $scope.askLevels[askLevelsLength].askPrice  = toPrice(update.asks[ask].price);
        //             $scope.askLevels[askLevelsLength].askSize = update.asks[ask].size;
        //             console.log("## new ask level added : ",$scope.askLevels[askLevelsLength].askPrice,$scope.askLevels[askLevelsLength].askSize);
        //         }
        //     }

        //     for(let bid in update.bids) {
        //         let bidLevelUpdated = false;
        //         for(let bidLv in $scope.bidLevels) {
        //             console.log("*** bid comparison : ",$scope.bidLevels[bidLv].bidPrice,toPrice(update.bids[bid].price) );
        //             if($scope.bidLevels[bidLv].bidPrice == toPrice(update.bids[bid].price)) {
        //                 $scope.bidLevels[bidLv].bidSize = update.bids[bid].size;
        //                 bidLevelUpdated = true;
        //                 console.log("## bid matched price updated : ", $scope.bidLevels[bidLv].bidPrice,toPrice(update.bids[bid].price));
        //             }
        //         }

        //         if(!bidLevelUpdated) {
        //             console.log("## no bid price matched. inside !bidLevelUpdated");
        //             let bidLevelsLength = $scope.bidLevels.length;
        //             $scope.bidLevels.push(new bidLevel());
        //             $scope.bidLevels[bidLevelsLength].bidPrice  = toPrice(update.bids[bid].price);
        //             $scope.bidLevels[bidLevelsLength].bidSize = update.bids[bid].size;
        //             console.log("## new bid level added : ", $scope.bidLevels[bidLevelsLength].bidPrice, $scope.bidLevels[bidLevelsLength].bidSize);
        //         }
        //     }

        //     $scope.bidLevels = $scope.bidLevels.filter((bidLevelData) => {
        //         if(bidLevelData.bidSize > 0) {
        //             return bidLevelData;
        //         }
        //     })            

        //     $scope.askLevels = $scope.askLevels.filter((askLevelData) => {
        //         if(askLevelData.askSize > 0) {
        //             return askLevelData;
        //         }
        //     })

        //     $scope.askLevels.sort((a,b) => {
        //         if(Number(a.askPrice) < Number(b.askPrice)) {
        //             return -1;
        //         } else if(Number(a.askPrice) > Number(b.askPrice)) {
        //             return 1;
        //         } else {
        //             return 0;
        //         }
        //     })

        //     $scope.bidLevels.sort((a,b) => {
        //         if(Number(a.bidPrice) < Number(b.bidPrice)) {
        //             return -1;
        //         } else if(Number(a.bidPrice) > Number(b.bidPrice)) {
        //             return 1;
        //         } else {
        //             return 0;
        //         }
        //     })

        //     $scope.levels = [];

        //     let askLevelsLength = $scope.askLevels.length;
        //     let bidLevelsLength = $scope.bidLevels.length;
        //     let i = 0;

        //     for(i = 0; i < askLevelsLength && i < bidLevelsLength; ++i) {
        //         $scope.levels[i] = new Level();

        //         $scope.levels[i].askPrice = $scope.askLevels[i].askPrice;
        //         $scope.levels[i].askSize = $scope.askLevels[i].askSize;
                
        //         $scope.levels[i].bidPrice = $scope.bidLevels[i].bidPrice;
        //         $scope.levels[i].bidSize = $scope.bidLevels[i].bidSize;
        //     }

        //     while(i < askLevelsLength) {
        //         $scope.levels[i] = new Level();

        //         $scope.levels[i].askPrice = $scope.askLevels[i].askPrice;
        //         $scope.levels[i].askSize = $scope.askLevels[i].askSize;
        //         ++i;
        //     }

        //     while(i < bidLevelsLength) {
        //         $scope.levels[i] = new Level();

        //         $scope.levels[i].bidPrice = $scope.bidLevels[i].bidPrice;
        //         $scope.levels[i].bidSize = $scope.bidLevels[i].bidSize;
        //         ++i;
        //     }
        // }

        // if(!$scope.levels.length) {
        //     for (var i = 0; i < update.asks.length; i++) {
        //         if (angular.isUndefined($scope.levels[i]))
        //             $scope.levels[i] = new Level();
                
        //         console.log("### typeof : ",typeof(update.asks[i].price));
        //         $scope.levels[i].askPrice = toPrice(update.asks[i].price);
        //         $scope.levels[i].askSize = update.asks[i].size;
        //     }
    
        //     for (var i = 0; i < update.bids.length; i++) {
        //         if (angular.isUndefined($scope.levels[i]))
        //             $scope.levels[i] = new Level();
        //         $scope.levels[i].bidPrice = toPrice(update.bids[i].price);
        //         $scope.levels[i].bidSize = update.bids[i].size;
        //     }

        // } else {

        //     console.log("#### inside else block");
        //     for(let ask in update.asks) {
        //         let levelUpdated = false;
        //         for( let lv in $scope.levels) {
        //             if($scope.levels[lv].askPrice == toPrice(update.asks[ask].price)) {
        //                 $scope.levels[lv].askSize = update.asks[ask].size;
        //                 levelUpdated = true;
        //             }
        //         }
        //         if(!levelUpdated) {
        //             console.log("## no value exists similar...");
        //             let lv = $scope.levels.length;
        //             $scope.levels.push(new Level());
        //             $scope.levels[lv].askPrice = toPrice(update.asks[ask].price);
        //             $scope.levels[lv].askSize = update.asks[ask].size;
        //         }
        //     }

        //     for(let bid in update.bids) {
        //         console.log("## inside update.bids loop");
        //         let levelUpdated = false;
        //         for(let lv in $scope.levels) {
        //             if($scope.levels[lv].bidPrice == toPrice(update.bids[bid].price)) {
        //                 console.log("## found 0 vala size...");
        //                 $scope.levels[lv].bidSize = update.bids[bid].size;
        //                 levelUpdated = true;
        //             }
        //         }

        //         if(!levelUpdated) {
        //             console.log("## no value exists similar...");
        //             let lv = $scope.levels.length;
        //             $scope.levels.push(new Level());
        //             $scope.levels[lv].bidPrice = toPrice(update.bids[bid].price);
        //             $scope.levels[lv].bidSize = update.bids[bid].size;
        //         }
        //     }
        // }

        // $scope.levels = $scope.levels.filter((level) => {
        //     if(level.askSize > 0 || level.bidSize > 0) {
        //         return level;
        //     }
        // })

        //console.log("## levels before : ",$scope.levels);

        updateQuoteClass();
    };

    var updateQuote = (quote: Models.TwoSidedQuote) => {
        console.log("## isnide updateQuote")
        if (quote !== null) {
            if (quote.bid !== null) {
                $scope.qBidPx = toPrice(quote.bid.price);
                $scope.qBidSz = quote.bid.size;
            }
            else {
                clearBid();
            }

            if (quote.ask !== null) {
                $scope.qAskPx = toPrice(quote.ask.price);
                $scope.qAskSz = quote.ask.size;
            }
            else {
                clearAsk();
            }

            if (quote.ask !== null && quote.bid !== null) {
                const spreadAbsolutePrice = (quote.ask.price - quote.bid.price).toFixed(2);
                const spreadPercent = toPercent(quote.ask.price, quote.bid.price);
                $scope.spreadValue = `${spreadAbsolutePrice} / ${spreadPercent}%`;
            }
            else {
                clearFairValue();
            }
        }
        else {
            clearQuote();
        }

        updateQuoteClass();
    };

    var updateQuoteStatus = (status: Models.TwoSidedQuoteStatus) => {
        if (status == null) {
            clearQuoteStatus();
            return;
        }

        $scope.bidIsLive = (status.bidStatus === Models.QuoteStatus.Live);
        $scope.askIsLive = (status.askStatus === Models.QuoteStatus.Live);
        updateQuoteClass();
    };

    var updateQuoteClass = () => {
        if (!angular.isUndefined($scope.levels) && $scope.levels.length > 0) {
            for (var i = 0; i < $scope.levels.length; i++) {
                var level = $scope.levels[i];

                //console.log("### level : ", level);

                if ($scope.qBidPx === level.bidPrice && $scope.bidIsLive) {
                    level.bidClass = 'success';
                }
                else {
                    level.bidClass = 'active';
                }

                if ($scope.qAskPx === level.askPrice && $scope.askIsLive) {
                    level.askClass = 'success';
                }
                else {
                    level.askClass = 'active';
                }
            }
        }
    };

    var updateFairValue = (fv: Models.FairValue) => {
        if (fv == null) {
            clearFairValue();
            return;
        }

        $scope.fairValue = toPrice(fv.price);
    };

    var subscribers = [];

    var makeSubscriber = <T>(topic: string, updateFn, clearFn) => {
        var sub = subscriberFactory.getSubscriber<T>($scope, topic)
            .registerSubscriber(updateFn, ms => ms.forEach(updateFn))
            .registerConnectHandler(clearFn);
        subscribers.push(sub);
    };

    makeSubscriber<Models.Market>(Messaging.Topics.MarketData, updateMarket, clearMarket);
    makeSubscriber<Models.TwoSidedQuote>(Messaging.Topics.Quote, updateQuote, clearQuote);
    makeSubscriber<Models.TwoSidedQuoteStatus>(Messaging.Topics.QuoteStatus, updateQuoteStatus, clearQuoteStatus);
    makeSubscriber<Models.FairValue>(Messaging.Topics.FairValue, updateFairValue, clearFairValue);

    $scope.$on('$destroy', () => {
        subscribers.forEach(d => d.disconnect());
        $log.info("destroy market quoting grid");
    });

    $log.info("started market quoting grid");
};

export var marketQuotingDirective = "marketQuotingDirective";

angular
    .module(marketQuotingDirective, ['ui.bootstrap', 'ui.grid', Shared.sharedDirectives])
    .directive("marketQuotingGrid", () => {

        return {
            restrict: 'E',
            replace: true,
            transclude: false,
            templateUrl: "market_display.html",
            controller: MarketQuotingController
        }
    });