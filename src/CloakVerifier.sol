// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CloakVerifier {
    address public immutable owner;
    mapping(bytes32 => bool) public usedNullifiers;
    event EnvelopeAccepted(bytes32 indexed commitment, bytes32 indexed nullifier, address indexed issuer);

    constructor() {
        owner = msg.sender;
    }

    function accept(bytes32 commitment, bytes32 nullifier) external {
        require(!usedNullifiers[nullifier], "nullifier already used");
        usedNullifiers[nullifier] = true;
        emit EnvelopeAccepted(commitment, nullifier, msg.sender);
    }
}
