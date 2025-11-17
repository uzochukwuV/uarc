import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getContractAddress } from "@/lib/contracts/addresses";
import { TemplateFormData } from "../types";

interface TimeBasedTransferFormFieldsProps {
  formData: TemplateFormData;
  chainId?: number;
  onFieldChange: (field: string, value: string) => void;
}

/**
 * Form fields specific to Time-Based Transfer template
 */
export function TimeBasedTransferFormFields({
  formData,
  chainId,
  onFieldChange,
}: TimeBasedTransferFormFieldsProps) {
  const mockUSDCAddress = getContractAddress('MOCK_USDC', chainId);

  return (
    <>
      <div>
        <Label htmlFor="tokenAddress">Token to Transfer</Label>
        <Select
          value={formData.tokenAddress}
          onValueChange={(value) => onFieldChange("tokenAddress", value)}
        >
          <SelectTrigger id="tokenAddress" data-testid="select-token">
            <SelectValue placeholder="Select token to transfer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={mockUSDCAddress}>
              Mock USDC (Testing)
            </SelectItem>
            <SelectItem value="custom">
              Custom Token Address...
            </SelectItem>
          </SelectContent>
        </Select>
        {formData.tokenAddress === "custom" && (
          <Input
            className="mt-2"
            placeholder="0x... (Enter custom token address)"
            onChange={(e) => onFieldChange("tokenAddress", e.target.value)}
            data-testid="input-custom-token"
          />
        )}
        <p className="text-sm text-muted-foreground mt-1">
          Select Mock USDC for testing or enter a custom token
        </p>
      </div>

      <div>
        <Label htmlFor="recipientAddress">Recipient Address</Label>
        <Input
          id="recipientAddress"
          placeholder="0x... (who will receive tokens)"
          value={formData.recipientAddress}
          onChange={(e) => onFieldChange("recipientAddress", e.target.value)}
          data-testid="input-recipient-address"
        />
        <p className="text-sm text-muted-foreground mt-1">
          Address that will receive the tokens
        </p>
      </div>

      <div>
        <Label htmlFor="transferAmount">Transfer Amount</Label>
        <Input
          id="transferAmount"
          type="number"
          placeholder="100000000 (100 USDC with 6 decimals)"
          value={formData.transferAmount}
          onChange={(e) => onFieldChange("transferAmount", e.target.value)}
          data-testid="input-transfer-amount"
        />
        <p className="text-sm text-muted-foreground mt-1">
          Amount in token's smallest unit (e.g., 100000000 = 100 USDC with 6 decimals)
        </p>
      </div>

      <div>
        <Label htmlFor="executeAfterHours">Execute After (hours)</Label>
        <Input
          id="executeAfterHours"
          type="number"
          placeholder="1"
          step="0.1"
          min="0.1"
          value={formData.executeAfterHours}
          onChange={(e) => onFieldChange("executeAfterHours", e.target.value)}
          data-testid="input-execute-after-hours"
        />
        <p className="text-sm text-muted-foreground mt-1">
          Hours from now when the transfer can be executed (use 0.1 for 6 minutes testing)
        </p>
      </div>
    </>
  );
}
