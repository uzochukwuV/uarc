/**
 * Template Registry
 *
 * Central registry for all task templates
 */

import { TaskTemplateType, TemplateConfig } from './types';
import { timeBasedTransferConfig } from './TimeBasedTransfer';
import { confidentialTimeBasedTransferConfig } from './ConfidentialTimeBasedTransfer';

// Export types
export * from './types';

// Export template components
export { TimeBasedTransferFormFields } from './TimeBasedTransfer';
export { ConfidentialTimeBasedTransferFormFields } from './ConfidentialTimeBasedTransfer';

/**
 * Registry of all available templates
 */
export const TEMPLATE_REGISTRY: Record<TaskTemplateType, TemplateConfig> = {
  [TaskTemplateType.TIME_BASED_TRANSFER]: timeBasedTransferConfig,
  [TaskTemplateType.CONFIDENTIAL_TIME_BASED_TRANSFER]: confidentialTimeBasedTransferConfig,

  // Placeholder configs for future templates
  [TaskTemplateType.LIMIT_ORDER]: {
    metadata: {
      type: TaskTemplateType.LIMIT_ORDER,
      name: "Limit Order",
      description: "Buy or sell tokens when price reaches a specific target",
      estimatedGas: "~0.15 ETH",
    },
    getAdapterAddress: () => "0x0000000000000000000000000000000000000000",
    encodeParams: () => "0x" as `0x${string}`,
    validate: () => ({ valid: false, error: "Not implemented yet" }),
    getDefaults: () => ({}),
  },

  [TaskTemplateType.DCA]: {
    metadata: {
      type: TaskTemplateType.DCA,
      name: "Dollar Cost Average",
      description: "Automatically buy tokens at regular intervals to average your entry price",
      estimatedGas: "~0.12 ETH",
    },
    getAdapterAddress: () => "0x0000000000000000000000000000000000000000",
    encodeParams: () => "0x" as `0x${string}`,
    validate: () => ({ valid: false, error: "Not implemented yet" }),
    getDefaults: () => ({}),
  },

  [TaskTemplateType.AUTO_COMPOUND]: {
    metadata: {
      type: TaskTemplateType.AUTO_COMPOUND,
      name: "Auto Compound",
      description: "Automatically reinvest yield farming rewards to maximize returns",
      estimatedGas: "~0.18 ETH",
    },
    getAdapterAddress: () => "0x0000000000000000000000000000000000000000",
    encodeParams: () => "0x" as `0x${string}`,
    validate: () => ({ valid: false, error: "Not implemented yet" }),
    getDefaults: () => ({}),
  },
};

/**
 * Get template configuration by type
 */
export function getTemplate(type: TaskTemplateType): TemplateConfig {
  return TEMPLATE_REGISTRY[type];
}

/**
 * Get all available templates
 */
export function getAllTemplates(): TemplateConfig[] {
  return Object.values(TEMPLATE_REGISTRY);
}

/**
 * Get all template metadata (for display in UI)
 */
export function getAllTemplateMetadata() {
  return getAllTemplates().map(t => t.metadata);
}
