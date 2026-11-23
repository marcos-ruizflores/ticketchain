// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {EuroToken} from "../src/EuroToken.sol";
import {TicketMarket} from "../src/TicketMarket.sol";

/// Deploys EURT + the market and creates a demo event so there's something to buy.
///
/// forge script script/Deploy.s.sol --rpc-url sepolia --account deployer --broadcast --verify
contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        EuroToken euro = new EuroToken(msg.sender);
        TicketMarket market = new TicketMarket(euro);

        market.createEvent(
            "Primavera Night",
            "Parc del Forum, Barcelona",
            uint64(block.timestamp + 60 days),
            45e6, // 45 EURT
            100,
            4,
            11_000, // resale up to 110%
            500 // 5% back to the organizer
        );

        vm.stopBroadcast();

        console.log("EuroToken:   ", address(euro));
        console.log("TicketMarket:", address(market));
    }
}
