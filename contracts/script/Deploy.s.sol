// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "../src/BlindNegotiation.sol";

contract DeployBlindNegotiation is Script {
    function run() external {
        vm.startBroadcast();

        BlindNegotiation negotiation = new BlindNegotiation();

        vm.stopBroadcast();

        console.log("BlindNegotiation deployed at:", address(negotiation));
        console.log("Chain ID:", block.chainid);
    }
}
