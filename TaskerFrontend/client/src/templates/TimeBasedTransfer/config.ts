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

    // CRITICAL: Encode as 6 parameters to match TaskLogicV2 expectations!
    // TaskLogicV2 expects Uniswap format: (router, tokenIn, tokenOut, amountIn, minAmountOut, recipient)
    //
    // struct TransferParams {
    //   address ignored1;        // router field (ignored, for TaskLogicV2 compatibility)
    //   address token;           // tokenIn - Token to transfer
    //   address ignored2;        // tokenOut field (ignored)
    //   uint256 amount;          // amountIn - Amount to transfer
    //   uint256 executeAfter;    // minAmountOut - repurposed as timestamp!
    //   address recipient;       // recipient - Where to send tokens
    // }
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "address", "uint256", "uint256", "address"],
      [
        ethers.ZeroAddress,         // router (ignored, for TaskLogicV2 compatibility)
        formData.tokenAddress,      // tokenIn - TaskLogicV2 extracts this
        ethers.ZeroAddress,         // tokenOut (ignored)
        formData.transferAmount,    // amountIn - TaskLogicV2 extracts this
        executeAfter,               // minAmountOut - repurposed as timestamp!
        formData.recipientAddress,  // recipient
      ]
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
