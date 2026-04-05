// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./ConfidentialTaskVault.sol";

contract ConfidentialTaskFactory is Ownable, ReentrancyGuard {
    using Clones for address;

    address public immutable vaultImplementation;

    uint256 public nextVaultId;
    mapping(uint256 => address) public vaults;

    event ConfidentialVaultCreated(uint256 indexed vaultId, address indexed vaultAddress, address indexed creator);

    constructor(address _vaultImpl, address _owner) Ownable(_owner) {
        require(_vaultImpl != address(0), "Invalid vault impl");
        vaultImplementation = _vaultImpl;
    }

    function createVault() external nonReentrant returns (uint256 vaultId, address vault) {
        vaultId = nextVaultId++;
        
        vault = vaultImplementation.clone();
        ConfidentialTaskVault(payable(vault)).initialize(msg.sender);

        vaults[vaultId] = vault;

        emit ConfidentialVaultCreated(vaultId, vault, msg.sender);
        return (vaultId, vault);
    }
}
