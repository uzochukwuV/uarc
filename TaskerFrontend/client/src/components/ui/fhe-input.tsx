import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import { forwardRef } from "react";

interface FheInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
  isEncrypted?: boolean;
}

export const FheInput = forwardRef<HTMLInputElement, FheInputProps>(
  ({ label, description, isEncrypted = true, className, ...props }, ref) => {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-1.5">
          <Label htmlFor={props.id} className="text-foreground font-medium">
            {label}
          </Label>
          {isEncrypted && (
            <div className="flex items-center text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
              <Lock className="w-3 h-3 mr-1" />
              Encrypted on-chain
            </div>
          )}
        </div>
        <Input
          ref={ref}
          className={`bg-black/40 border-white/10 focus-visible:border-primary/50 focus-visible:ring-primary/20 ${className}`}
          {...props}
        />
        {description && (
          <p className="text-sm text-muted-foreground mt-1.5">{description}</p>
        )}
      </div>
    );
  }
);
FheInput.displayName = "FheInput";