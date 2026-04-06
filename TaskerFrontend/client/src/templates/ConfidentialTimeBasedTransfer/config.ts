import { ethers } from "ethers";
import { getContractAddress } from "@/lib/contracts/addresses";
import { TemplateConfig, TaskTemplateType, TemplateFormData } from "../types";

/**
 * Confidential Time-Based Transfer Template Configuration
 *
 * Handles logic for creating time-based token transfer tasks with FHE encryption
 */
export const confidentialTimeBasedTransferConfig: TemplateConfig = {
  metadata: {
    type: TaskTemplateType.CONFIDENTIAL_TIME_BASED_TRANSFER,
    name: "Confidential Time-Based Transfer",
    description: "Transfer tokens privately to a recipient at a specific time using FHE encryption.",
    estimatedGas: "~0.10 ETH",
  },

  getAdapterAddress: (chainId?: number) => {
    return getContractAddress('CONFIDENTIAL_TRANSFER_ADAPTER', chainId);
  },

  encodeParams: (formData: TemplateFormData): `0x${string}` => {
    // For confidential tasks, the execution parameters (taskId, inCurrentValue)
    // are determined by the executor, not the creator. The adapter parameters are stored as "0x"
    // and the encrypted data is passed securely during the createConfidentialTask transaction.
    return "0x" as `0x${string}`;
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
    isConfidential: true,
  }),
};