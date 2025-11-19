import { ethers } from "ethers";
import { getContractAddress } from "@/lib/contracts/addresses";
import { TemplateConfig, TaskTemplateType, TemplateFormData } from "../types";

/**
 * Time-Based Transfer Template Configuration
 *
 * Handles all logic for creating time-based token transfer tasks
 */
export const timeBasedTransferConfig: TemplateConfig = {
  metadata: {
    type: TaskTemplateType.TIME_BASED_TRANSFER,
    name: "Time-Based Transfer",
    description: "Transfer tokens to a recipient at a specific time - perfect for testing!",
    estimatedGas: "~0.05 ETH",
  },

  getAdapterAddress: (chainId?: number) => {
    return getContractAddress('TIME_BASED_TRANSFER_ADAPTER', chainId);
  },

  encodeParams: (formData: TemplateFormData): `0x${string}` => {
    // Calculate executeAfter timestamp (hours from now)
    const hoursFromNow = parseFloat(formData.executeAfterHours || "1");
    const executeAfter = BigInt(
      Math.floor(Date.now() / 1000) + Math.floor(hoursFromNow * 3600)
    );

    // Encode as 4-parameter struct to match TimeBasedTransferAdapter expectations!
    // TimeBasedTransferAdapter.sol expects a struct with these exact fields:
    //
    // struct TransferParams {
    //   address token;           // Token to transfer
    //   address recipient;       // Where to send tokens
    //   uint256 amount;          // Amount to transfer
    //   uint256 executeAfter;    // Timestamp after which execution is allowed
    // }
    //
    // IMPORTANT: Must use tuple encoding ["tuple(address,address,uint256,uint256)"]
    // to match Solidity struct memory layout (not loose type encoding)
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(address,address,uint256,uint256)"],
      [[
        formData.tokenAddress,              // token
        formData.recipientAddress,          // recipient
        BigInt(formData.transferAmount),    // amount
        executeAfter,                       // executeAfter
      ]]
    ) as `0x${string}`;
  },

  validate: (formData: TemplateFormData) => {
    if (!formData.tokenAddress || formData.tokenAddress === "custom") {
      return {
        valid: false,
        error: "Please select a token or enter a custom token address",
      };
    }

    if (!formData.recipientAddress) {
      return {
        valid: false,
        error: "Please enter a recipient address",
      };
    }

    if (!formData.transferAmount || parseFloat(formData.transferAmount) <= 0) {
      return {
        valid: false,
        error: "Please enter a valid transfer amount",
      };
    }

    if (!formData.executeAfterHours || parseFloat(formData.executeAfterHours) <= 0) {
      return {
        valid: false,
        error: "Execute time must be greater than 0 hours",
      };
    }

    return { valid: true };
  },

  getDefaults: () => ({
    tokenAddress: "",
    recipientAddress: "",
    transferAmount: "",
    executeAfterHours: "1",
  }),
};
