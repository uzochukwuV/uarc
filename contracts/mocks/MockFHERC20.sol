// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@fhenixprotocol/contracts/FHE.sol";
import "@fhenixprotocol/contracts/experimental/token/FHERC20/IFHERC20.sol";
import "@fhenixprotocol/contracts/access/Permissioned.sol";

contract MockFHERC20 is IFHERC20, Permissioned {
    mapping(address => euint128) private balances;

    function mint(address to, inEuint128 calldata amount) external {
        euint128 amt = FHE.asEuint128(amount);
        if (FHE.isInitialized(balances[to])) {
            balances[to] = FHE.add(balances[to], amt);
        } else {
            balances[to] = amt;
        }
    }

    function balanceOfEncrypted(address account, Permission memory auth) external view override returns (string memory) {
        // Mock implementation
        return "";
    }

    function transferEncrypted(address to, inEuint128 calldata value) external override returns (euint128) {
        euint128 v = FHE.asEuint128(value);
        balances[msg.sender] = FHE.sub(balances[msg.sender], v);
        
        if (FHE.isInitialized(balances[to])) {
            balances[to] = FHE.add(balances[to], v);
        } else {
            balances[to] = v;
        }
        return v;
    }

    function _transferEncrypted(address to, euint128 value) external override returns (euint128) {
        balances[msg.sender] = FHE.sub(balances[msg.sender], value);
        if (FHE.isInitialized(balances[to])) {
            balances[to] = FHE.add(balances[to], value);
        } else {
            balances[to] = value;
        }
        return value;
    }

    function allowanceEncrypted(address owner, address spender, Permission memory permission) external view override returns (string memory) {
        return "";
    }

    function approveEncrypted(address spender, inEuint128 calldata value) external override returns (bool) {
        return true;
    }

    function transferFromEncrypted(address from, address to, inEuint128 calldata value) external override returns (euint128) {
        euint128 v = FHE.asEuint128(value);
        balances[from] = FHE.sub(balances[from], v);
        
        if (FHE.isInitialized(balances[to])) {
            balances[to] = FHE.add(balances[to], v);
        } else {
            balances[to] = v;
        }
        return v;
    }

    function _transferFromEncrypted(address from, address to, euint128 value) external override returns (euint128) {
        balances[from] = FHE.sub(balances[from], value);
        if (FHE.isInitialized(balances[to])) {
            balances[to] = FHE.add(balances[to], value);
        } else {
            balances[to] = value;
        }
        return value;
    }
}
