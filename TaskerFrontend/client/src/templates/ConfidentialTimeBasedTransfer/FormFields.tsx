import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FheInput } from "@/components/ui/fhe-input";
import { getContractAddress } from "@/lib/contracts/addresses";
import { TemplateFormData } from "../types";

interface ConfidentialTimeBasedTransferFormFieldsProps {
  formData: TemplateFormData;
  chainId?: number;
  onFieldChange: (field: string, value: string) => void;
}

/**
 * Form fields specific to the Confidential Time-Based Transfer template
 */
export function ConfidentialTimeBasedTransferFormFields({
  formData,
  chainId,
  onFieldChange,
}: ConfidentialTimeBasedTransferFormFieldsProps) {
  const mockFHERC20Address = getContractAddress('MOCK_FHERC20', chainId);

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="tokenAddress">Confidential Token to Transfer</Label>
        <Select
          value={formData.tokenAddress}
          onValueChange={(value) => onFieldChange("tokenAddress", value)}
        >
          <SelectTrigger id="tokenAddress" data-testid="select-token" className="mt-1.5">
            <SelectValue placeholder="Select FHERC20 token" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={mockFHERC20Address}>
              Mock FHERC20 (Testing)
            </SelectItem>
            <SelectItem value="custom">
              Custom Token Address...
            </SelectItem>
          </SelectContent>
        </Select>
        {formData.tokenAddress === "custom" && (
          <Input
            className="mt-2"
            placeholder="0x... (Enter custom FHERC20 token address)"
            onChange={(e) => onFieldChange("tokenAddress", e.target.value)}
            data-testid="input-custom-token"
          />
        )}
        <p className="text-sm text-muted-foreground mt-1.5">
          Select Mock FHERC20 for testing or enter a custom confidential token
        </p>
      </div>

      <div>
        <Label htmlFor="recipientAddress">Recipient Address</Label>
        <Input
          id="recipientAddress"
          className="mt-1.5"
          placeholder="0x... (who will receive tokens)"
          value={formData.recipientAddress}
          onChange={(e) => onFieldChange("recipientAddress", e.target.value)}
          data-testid="input-recipient-address"
        />
        <p className="text-sm text-muted-foreground mt-1.5">
          Address that will receive the tokens
        </p>
      </div>

      <div>
        <FheInput
          id="transferAmount"
          label="Transfer Amount"
          description="Amount in token's smallest unit. This value will be encrypted on-chain."
          type="number"
          placeholder="100000000"
          value={formData.transferAmount}
          onChange={(e) => onFieldChange("transferAmount", e.target.value)}
          isEncrypted={true}
          data-testid="input-transfer-amount"
        />
      </div>

      <div>
        <FheInput
          id="executeAfterHours"
          label="Execute After (hours)"
          description="Hours from now when the transfer can be executed. Evaluated confidentially."
          type="number"
          placeholder="1"
          step="0.1"
          min="0.1"
          value={formData.executeAfterHours}
          onChange={(e) => onFieldChange("executeAfterHours", e.target.value)}
          isEncrypted={true}
          data-testid="input-execute-after-hours"
        />
      </div>
    </div>
  );
}