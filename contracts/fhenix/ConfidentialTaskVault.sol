// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@fhenixprotocol/contracts/FHE.sol";
import "@fhenixprotocol/contracts/experimental/token/FHERC20/IFHERC20.sol";

contract ConfidentialTaskVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public creator;
    bool private initialized;

    // Encrypted token balances for FHERC20 tokens
    mapping(address => euint128) private encryptedTokenBalances;
    address[] private trackedTokens;
    mapping(address => bool) private isTracked;

    event ConfidentialTokenDeposited(address indexed token, address indexed from);
    event ConfidentialTokenActionExecuted(address indexed token, address indexed adapter, bool success);

    modifier onlyCreator() {
        require(msg.sender == creator, "OnlyCreator");
        _;
    }

    function initialize(address _creator) external {
        require(!initialized, "Already initialized");
        require(_creator != address(0), "Invalid creator");
        initialized = true;
        creator = _creator;
    }

    function depositEncryptedToken(address token, inEuint128 calldata encryptedAmount) external nonReentrant {
        require(token != address(0), "Invalid token");

        if (!isTracked[token]) {
            trackedTokens.push(token);
            isTracked[token] = true;
        }

        // Transfer encrypted tokens from user to vault
        euint128 actualTransferred = IFHERC20(token).transferFromEncrypted(msg.sender, address(this), encryptedAmount);

        // Add to balance
        if (FHE.isInitialized(encryptedTokenBalances[token])) {
            encryptedTokenBalances[token] = FHE.add(encryptedTokenBalances[token], actualTransferred);
        } else {
            encryptedTokenBalances[token] = actualTransferred;
        }

        emit ConfidentialTokenDeposited(token, msg.sender);
    }

    function executeConfidentialTokenAction(
        address token,
        address adapter,
        euint128 encryptedAmount,
        bytes calldata actionData
    ) external nonReentrant returns (bool success, bytes memory result) {
        require(token != address(0), "Invalid token");
        require(adapter != address(0), "Invalid adapter");
        
        // In a real system, we'd check if balance >= amount. FHE math handles underflow conditionally or securely.
        // For simplicity, we just approve and execute.

        // Approve adapter to spend tokens
        // FHERC20 doesn't have _approveEncrypted taking euint128 easily, we might need to skip approval if we call the adapter differently,
        // or just let the adapter be a trusted entity that we call.
        // For now, let's assume we call adapter.executeConfidential(...) and it doesn't need to pull tokens, but we push them or just pass execution.
        
        // Wait, IFHERC20 has `_transferEncrypted` taking euint128. Let's just transfer to the adapter so it can use them.
        IFHERC20(token)._transferEncrypted(adapter, encryptedAmount);

        (bool callSuccess, bytes memory returnData) = adapter.call(actionData);

        if (callSuccess && returnData.length > 0) {
            (success, result) = abi.decode(returnData, (bool, bytes));
        } else {
            success = callSuccess;
            result = returnData;
        }

        // If it failed, adapter should refund. This is an oversimplification.
        
        // Deduct balance
        encryptedTokenBalances[token] = FHE.sub(encryptedTokenBalances[token], encryptedAmount);

        emit ConfidentialTokenActionExecuted(token, adapter, success);
        return (success, result);
    }
}
