/**
 * Template System Types
 *
 * Defines the structure for task templates and their configurations
 */

export enum TaskTemplateType {
  TIME_BASED_TRANSFER = "TIME_BASED_TRANSFER",
  CONFIDENTIAL_TIME_BASED_TRANSFER = "CONFIDENTIAL_TIME_BASED_TRANSFER",
  LIMIT_ORDER = "LIMIT_ORDER",
  DCA = "DCA",
  AUTO_COMPOUND = "AUTO_COMPOUND",
}

export interface TemplateMetadata {
  type: TaskTemplateType;
  name: string;
  description: string;
  estimatedGas: string;
  icon?: string;
  adapterAddress?: string;
}

export interface TemplateFormData {
  // Common fields
  name: string;
  description: string;
  rewardPerExecution: string;
  maxExecutions: string;
  expiresIn: string;
  adapterAddress: string;
  isConfidential?: boolean;

  // Template-specific fields (stored as key-value pairs)
  [key: string]: any;
}

export interface TemplateConfig {
  metadata: TemplateMetadata;

  /**
   * Get the adapter address for this template
   */
  getAdapterAddress: (chainId?: number) => string;

  /**
   * Encode template-specific parameters for the adapter
   */
  encodeParams: (formData: TemplateFormData) => `0x${string}`;

  /**
   * Validate template-specific form data
   */
  validate: (formData: TemplateFormData) => { valid: boolean; error?: string };

  /**
   * Get default form values for this template
   */
  getDefaults: () => Partial<TemplateFormData>;
}
