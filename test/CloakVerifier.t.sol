pragma solidity ^0.8.24;
import {CloakVerifier} from "../src/CloakVerifier.sol";

contract CloakVerifierTest {
    function testOwnerIsDeployer() external {
        CloakVerifier verifier = new CloakVerifier();
        require(verifier.owner() == address(this), "owner");
    }

    function testNullifierIsRecorded() external {
        CloakVerifier verifier = new CloakVerifier();
        verifier.accept(bytes32(uint256(1)), bytes32(uint256(2)));
        require(verifier.usedNullifiers(bytes32(uint256(2))), "nullifier");
    }

    function testDuplicateNullifierReverts() external {
        CloakVerifier verifier = new CloakVerifier();
        verifier.accept(bytes32(uint256(1)), bytes32(uint256(2)));
        (bool ok,) = address(verifier).call(abi.encodeCall(verifier.accept, (bytes32(uint256(3)), bytes32(uint256(2)))));
        require(!ok, "duplicate accepted");
    }
}
