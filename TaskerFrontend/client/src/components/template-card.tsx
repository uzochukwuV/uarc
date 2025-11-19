import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TaskTemplateType } from "@shared/schema";
import limitOrderIcon from "@assets/generated_images/Limit_order_icon_40970d57.png";
import dcaIcon from "@assets/generated_images/DCA_recurring_icon_01535250.png";
import autoCompoundIcon from "@assets/generated_images/Auto_compound_growth_icon_96839262.png";

interface TemplateCardProps {
  type: TaskTemplateType;
  name: string;
  description: string;
  estimatedGas: string;
  onSelect: () => void;
}

const templateIcons = {
  [TaskTemplateType.LIMIT_ORDER]: limitOrderIcon,
  [TaskTemplateType.DCA]: dcaIcon,
  [TaskTemplateType.AUTO_COMPOUND]: autoCompoundIcon,
};

export function TemplateCard({
  type,
  name,
  description,
  estimatedGas,
  onSelect,
}: TemplateCardProps) {
  const icon = templateIcons[type];

  return (
    <Card
      className="p-8 hover-elevate transition-all cursor-pointer group"
      onClick={onSelect}
      data-testid={`template-${type.toLowerCase().replace(/_/g, '-')}`}
    >
      <div className="flex flex-col items-center text-center">
        <div className="w-20 h-20 mb-6 flex items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
          <img src={icon} alt={name} className="w-12 h-12" />
        </div>
        
        <h3 className="text-xl font-semibold mb-3">{name}</h3>
        
        <p className="text-sm text-muted-foreground mb-6 min-h-[60px]">
          {description}
        </p>
        
        <div className="mb-6 px-4 py-2 rounded-lg bg-secondary text-sm">
          <span className="text-muted-foreground">Est. Gas: </span>
          <span className="font-semibold">{estimatedGas}</span>
        </div>

        <Button disabled={type != "TIME_BASED_TRANSFER"} className="w-full" data-testid={`button-select-${type.toLowerCase().replace(/_/g, '-')}`}>
          Select Template {type == "TIME_BASED_TRANSFER" ? "" : "(coming Soon) " } 
        </Button>
      </div>
    </Card>
  );
}
