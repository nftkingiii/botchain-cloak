// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {CloakVerifier} from "../src/CloakVerifier.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployCloak {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (CloakVerifier verifier) {
        vm.startBroadcast();
        verifier = new CloakVerifier();
        vm.stopBroadcast();
    }
}
