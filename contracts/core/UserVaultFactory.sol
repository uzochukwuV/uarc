// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "../core/UserVault.sol";
import "../interfaces/IStrategyRegistry.sol";

/**
 * @title UserVaultFactory
 * @notice Deploys UserVault instances using minimal proxies (EIP-1167)
 * @dev One vault per user. Uses Clones library for cheap deployment.
 *      Each user gets a deterministic vault address.
 */
contract UserVaultFactory is Ownable {

    using Clones for address;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    address public immutable vaultImplementation;
    address public strategyRegistry;
    address public executorHub;

    mapping(address => address) private _userVaults;
    address[] private _allVaults;

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(
        address _vaultImplementation,
        address _strategyRegistry,
        address _executorHub,
        address _owner
    ) Ownable(_owner) {
        require(_vaultImplementation != address(0), "Invalid implementation");
        require(_strategyRegistry != address(0), "Invalid registry");
        require(_executorHub != address(0), "Invalid hub");

        vaultImplementation = _vaultImplementation;
        strategyRegistry = _strategyRegistry;
        executorHub = _executorHub;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core Functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Deploy a new UserVault for a user
     * @dev One vault per user. If user already has a vault, returns existing address.
     * @return vault Address of the deployed (or existing) vault
     */
    function createVault() external returns (address vault) {
        // If user already has a vault, return it
        if (_userVaults[msg.sender] != address(0)) {
            return _userVaults[msg.sender];
        }

        // Deploy minimal proxy clone
        vault = vaultImplementation.clone();

        // Initialize the vault
        UserVault(payable(vault)).initialize(
            msg.sender,
            strategyRegistry,
            executorHub
        );

        // Register vault
        _userVaults[msg.sender] = vault;
        _allVaults.push(vault);

        emit VaultCreated(msg.sender, vault);
        return vault;
    }

    /**
     * @notice Predict the vault address for a user before deployment
     * @dev Useful for setting up approvals before vault exists
     * @param user Address of the user
     * @return predicted Address where the vault would be deployed
     */
    function predictVaultAddress(address user) external view returns (address predicted) {
        if (_userVaults[user] != address(0)) {
            return _userVaults[user];
        }
        // EIP-1167 deterministic address calculation
        bytes32 salt = keccak256(abi.encodePacked(user));
        predicted = vaultImplementation.predictDeterministicAddress(salt);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Get the vault address for a user
    function getVault(address user) external view returns (address) {
        return _userVaults[user];
    }

    /// @notice Check if a user has a vault
    function hasVault(address user) external view returns (bool) {
        return _userVaults[user] != address(0);
    }

    /// @notice Get all deployed vaults
    function getAllVaults() external view returns (address[] memory) {
        return _allVaults;
    }

    /// @notice Get total vault count
    function getVaultCount() external view returns (uint256) {
        return _allVaults.length;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function setStrategyRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "Invalid registry");
        strategyRegistry = _registry;
        emit StrategyRegistryUpdated(_registry);
    }

    function setExecutorHub(address _hub) external onlyOwner {
        require(_hub != address(0), "Invalid hub");
        executorHub = _hub;
        emit ExecutorHubUpdated(_hub);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event VaultCreated(address indexed user, address indexed vault);
    event StrategyRegistryUpdated(address indexed registry);
    event ExecutorHubUpdated(address indexed hub);
}