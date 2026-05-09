// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "../src/BlindNegotiation.sol";
import "../src/ConfidentialEscrow.sol";

contract DeployAll is Script {
    // USDC on Base Sepolia
    address constant USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        vm.startBroadcast();

        // 1. Deploy BlindNegotiation (unchanged core FHE contract)
        BlindNegotiation negotiation = new BlindNegotiation();
        console.log("BlindNegotiation deployed at:", address(negotiation));

        // 2. Deploy ConfidentialEscrow pointing at BlindNegotiation
        ConfidentialEscrow escrow = new ConfidentialEscrow(
            USDC_BASE_SEPOLIA,
            address(negotiation)
        );
        console.log("ConfidentialEscrow deployed at:", address(escrow));

        console.log("Chain ID:", block.chainid);
        console.log("USDC address:", USDC_BASE_SEPOLIA);

        vm.stopBroadcast();
    }
}
