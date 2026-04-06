import { useState, useEffect } from "react";
import { Navigation } from "@/components/navigation";
import { TemplateCard } from "@/components/template-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Check, Lock, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { useCreateTask, useCreateConfidentialTask, useWallet } from "@/lib/hooks";
import { useTokenApproval } from "@/lib/hooks/useTokenApproval";
import { useToast } from "@/hooks/use-toast";
import { formatEther, parseEther } from "viem";
import { useWaitForTransactionReceipt } from "wagmi";
import { ethers } from "ethers";
import { getContractAddress } from "@/lib/contracts/addresses";
import { Switch } from "@/components/ui/switch";
import { useFhenix } from "@/providers/FhenixProvider";
import { 
  TaskTemplateType, 
  ConfidentialTimeBasedTransferFormFields,
  TimeBasedTransferFormFields,
  getTemplate,
  getAllTemplateMetadata
} from "@/templates";

const steps = ["Choose Template", "Configure", "Review", "Created"];

export default function CreateTask() {
  const templates = getAllTemplateMetadata().filter(
    t => t.type === TaskTemplateType.TIME_BASED_TRANSFER || t.type === TaskTemplateType.CONFIDENTIAL_TIME_BASED_TRANSFER
  );

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplateType | null>(null);
  const [createdTaskAddress, setCreatedTaskAddress] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    rewardPerExecution: "",
    maxExecutions: "",
    expiresIn: "",
    adapterAddress: "", 
    tokenAddress: "",
    recipientAddress: "",
    transferAmount: "",
    executeAfterHours: "1", 
  });
  
  const { toast } = useToast();
  const { address: userAddress, isConnected, chainId } = useWallet();
  const { fhenixClient, isInitialized: isFhenixInitialized } = useFhenix();

  const isConfidential = selectedTemplate === TaskTemplateType.CONFIDENTIAL_TIME_BASED_TRANSFER;

  const { createTask: createPublicTask, hash: publicHash, isPending: isPublicPending, error: publicError } = useCreateTask();
  const { createConfidentialTask, hash: privateHash, isPending: isPrivatePending, error: privateError } = useCreateConfidentialTask();

  const activeHash = isConfidential ? privateHash : publicHash;
  const isPending = isConfidential ? isPrivatePending : isPublicPending;
  const activeError = isConfidential ? privateError : publicError;

  const factoryAddress = getContractAddress(isConfidential ? 'CONFIDENTIAL_TASK_FACTORY' : 'TASK_FACTORY', chainId) as `0x${string}`;
  const tokenAddress = formData.tokenAddress as `0x${string}` | undefined;
  
  const { allowance, approve, hash: approveHash } = useTokenApproval(tokenAddress, factoryAddress);

  const { isLoading: isWaitingForTx, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash: activeHash });
  const { isSuccess: isApprovalConfirmed } = useWaitForTransactionReceipt({ hash: approveHash });

  const handleTemplateSelect = (type: TaskTemplateType) => {
    setSelectedTemplate(type);
    const template = getTemplate(type);
    setFormData(prev => ({ ...prev, ...template.getDefaults(), adapterAddress: template.getAdapterAddress(chainId) }));
    setCurrentStep(1);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (isTxConfirmed && currentStep !== 3) {
      setCreatedTaskAddress(activeHash || "Unknown");
      setCurrentStep(3);
      toast({ title: "Task created successfully on blockchain!" });
    }
  }, [isTxConfirmed, currentStep, activeHash, toast]);

  useEffect(() => {
    if (activeError) {
      toast({
        title: "Failed to create task",
        description: (activeError as any)?.message || "Transaction failed",
        variant: "destructive"
      });
    }
  }, [activeError, toast]);

  useEffect(() => {
    if (isApprovalConfirmed) {
      toast({ title: "Approval Confirmed!", description: "Now click 'Create Task' again to proceed" });
    }
  }, [isApprovalConfirmed, toast]);

  const handleCreate = async () => {
    if (!selectedTemplate || !isConnected) return;

    const template = getTemplate(selectedTemplate);
    const validation = template.validate(formData);
    if (!validation.valid) {
      toast({ title: "Validation Error", description: validation.error, variant: "destructive" });
      return;
    }

    const transferAmount = BigInt(formData.transferAmount);
    const currentAllowance = allowance || 0n;

    if (currentAllowance < transferAmount) {
      toast({ title: "Token Approval Required", description: `Please approve ${formData.transferAmount} tokens first` });
      approve(transferAmount);
      return;
    }

    const rewardPerExecution = formData.rewardPerExecution ? parseEther(formData.rewardPerExecution) : parseEther("0.01");
    const maxExecs = formData.maxExecutions ? BigInt(formData.maxExecutions) : 1n;
    const totalReward = rewardPerExecution * maxExecs;
    const gasBuffer = parseEther("2.1"); 
    const totalETHValue = totalReward + gasBuffer;

    const expiresAt = formData.expiresIn ? BigInt(Math.floor(Date.now() / 1000) + parseInt(formData.expiresIn) * 86400) : 0n;

    if (isConfidential) {
      if (!fhenixClient) {
        toast({ title: "Encryption Error", description: "Fhenix client not initialized", variant: "destructive" });
        return;
      }
      
      const encryptedAmount = await fhenixClient.encrypt_uint128(Number(formData.transferAmount));
      const encryptedThreshold = await fhenixClient.encrypt_uint32(
        Math.floor(Date.now() / 1000) + Math.floor(parseFloat(formData.executeAfterHours) * 3600)
      );

      createConfidentialTask({
        expiresAt,
        maxExecutions: maxExecs,
        recurringInterval: 0n,
        rewardPerExecution,
        seedCommitment: ethers.ZeroHash as `0x${string}`,
        actions: [{
          selector: "0x1cff79cd" as `0x${string}`,
          protocol: formData.adapterAddress as `0x${string}`,
          params: ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint256", "tuple(bytes)"],
            [0, [encryptedThreshold.data]]
          ) as `0x${string}`
        }],
        deposits: [{
          token: formData.tokenAddress as `0x${string}`,
          amount: { data: encryptedAmount.data as `0x${string}`, securityZone: 0 }
        }],
        value: totalETHValue
      });
    } else {
      createPublicTask({
        expiresAt,
        maxExecutions: maxExecs,
        recurringInterval: 0n,
        rewardPerExecution,
        seedCommitment: ethers.ZeroHash as `0x${string}`,
        actions: [{
          selector: "0x1cff79cd" as `0x${string}`,
          protocol: formData.tokenAddress as `0x${string}`,
          params: template.encodeParams(formData)
        }],
        deposits: [{
          token: formData.tokenAddress as `0x${string}`,
          amount: transferAmount
        }],
        value: totalETHValue
      });
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background -z-10" />
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-6 pt-32 pb-24 relative z-10">
        <div className="mb-12">
          <Link href="/">
            <div className="inline-flex items-center text-muted-foreground hover:text-primary mb-6 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back to Home
            </div>
          </Link>
          <h1 className="text-4xl font-bold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
            Create Automated Task
          </h1>
          <p className="text-xl text-muted-foreground">
            Deploy self-executing, MEV-protected strategies.
          </p>
        </div>

        <div className="mb-12 max-w-3xl mx-auto">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step} className="flex items-center flex-1">
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300 ${
                      index <= currentStep ? "bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]" : "bg-black/40 border-white/10 text-muted-foreground"
                    }`}>
                    {index < currentStep ? <Check className="w-5 h-5" /> : <span className="font-semibold">{index + 1}</span>}
                  </div>
                  <span className={`text-sm font-medium hidden md:block ${index <= currentStep ? "text-foreground" : "text-muted-foreground"}`}>
                    {step}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className="flex-1 h-0.5 mx-4 bg-white/5">
                    <div className={`h-full transition-all duration-500 ${index < currentStep ? "bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]" : "bg-transparent"}`} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          {currentStep === 0 && (
            <div className="max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {templates.map((template) => (
                  <TemplateCard key={template.type} {...template} onSelect={() => handleTemplateSelect(template.type)} />
                ))}
              </div>
            </div>
          )}

          {currentStep === 1 && selectedTemplate && (
            <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
              <Card className="p-8 lg:col-span-2 bg-black/40 backdrop-blur-xl border-white/10 shadow-2xl">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-semibold">Configure Strategy</h2>
                  {isConfidential && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-sm font-medium">
                      <Lock className="w-4 h-4" /> End-to-End Encrypted
                    </div>
                  )}
                </div>
                
                <div className="space-y-6">
                  <div>
                    <Label htmlFor="name">Task Name</Label>
                    <Input id="name" className="bg-black/40 border-white/10 focus-visible:border-primary/50 mt-1.5" placeholder="My Automated Strategy" value={formData.name} onChange={(e) => handleInputChange("name", e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" className="bg-black/40 border-white/10 focus-visible:border-primary/50 mt-1.5" placeholder="Strategy details..." value={formData.description} onChange={(e) => handleInputChange("description", e.target.value)} rows={3} />
                  </div>

                  <div className="p-6 rounded-xl bg-white/[0.02] border border-white/5 space-y-6">
                    {isConfidential ? (
                      <ConfidentialTimeBasedTransferFormFields formData={formData} chainId={chainId} onFieldChange={handleInputChange} />
                    ) : (
                      <TimeBasedTransferFormFields formData={formData} chainId={chainId} onFieldChange={handleInputChange} />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="reward">Executor Reward (ETH)</Label>
                      <Input id="reward" type="number" className="bg-black/40 border-white/10 mt-1.5" placeholder="0.01" value={formData.rewardPerExecution} onChange={(e) => handleInputChange("rewardPerExecution", e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="maxExecutions">Max Executions</Label>
                      <Input id="maxExecutions" type="number" className="bg-black/40 border-white/10 mt-1.5" placeholder="1" value={formData.maxExecutions} onChange={(e) => handleInputChange("maxExecutions", e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-10">
                  <Button variant="outline" className="border-white/10 hover:bg-white/5" onClick={() => setCurrentStep(0)}>
                    <ChevronLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                  <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(var(--primary),0.3)]" onClick={() => setCurrentStep(2)} disabled={!formData.name || !formData.rewardPerExecution || !formData.adapterAddress}>
                    Continue to Review
                  </Button>
                </div>
              </Card>

              <div className="lg:col-span-1">
                <Card className="p-6 sticky top-24 bg-black/40 backdrop-blur-xl border-white/10">
                  <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    Live Preview
                  </h3>
                  <div className="space-y-5">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Type</p>
                      <p className="font-medium flex items-center gap-2">
                        {isConfidential ? <Lock className="w-3 h-3 text-primary" /> : null}
                        {selectedTemplate.replace(/_/g, " ")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Transfer Amount</p>
                      <p className={`font-mono ${isConfidential ? "text-primary" : "text-foreground"}`}>
                        {isConfidential ? "******** (Encrypted)" : (formData.transferAmount || "0")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Execution Time</p>
                      <p className={`font-mono ${isConfidential ? "text-primary" : "text-foreground"}`}>
                        {isConfidential ? "******** (Encrypted)" : `+${formData.executeAfterHours || "0"} hrs`}
                      </p>
                    </div>
                    <div className="pt-4 border-t border-white/10">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Reward</p>
                      <p className="font-medium text-green-400">{formData.rewardPerExecution || "0"} ETH</p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="max-w-2xl mx-auto">
              <Card className="p-8 bg-black/40 backdrop-blur-xl border-white/10 shadow-2xl">
                <h2 className="text-2xl font-semibold mb-8">Deploy Strategy</h2>
                
                <div className="space-y-4 mb-8 bg-white/[0.02] p-6 rounded-xl border border-white/5">
                  <div className="flex items-center justify-between pb-4 border-b border-white/5">
                    <span className="text-muted-foreground">Network Mode</span>
                    {isConfidential ? (
                      <span className="font-medium text-primary flex items-center gap-1.5"><Lock className="w-4 h-4"/> Fhenix Confidential</span>
                    ) : (
                      <span className="font-medium text-foreground">Standard Public</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between py-4 border-b border-white/5">
                    <span className="text-muted-foreground">Task Name</span>
                    <span className="font-semibold text-foreground">{formData.name}</span>
                  </div>
                  <div className="flex items-center justify-between pt-4">
                    <span className="text-muted-foreground">Total Funding Required</span>
                    <span className="font-semibold text-green-400 text-lg">
                      {formData.maxExecutions ? (parseFloat(formData.rewardPerExecution) * parseInt(formData.maxExecutions)).toFixed(3) : formData.rewardPerExecution} ETH
                    </span>
                  </div>
                </div>

                {isConfidential && (
                  <div className="bg-primary/10 border border-primary/20 rounded-xl p-5 mb-8 flex gap-4">
                    <ShieldAlert className="w-6 h-6 text-primary shrink-0" />
                    <p className="text-sm text-primary/90 leading-relaxed">
                      Your transfer amount and execution timestamp will be encrypted locally before reaching the blockchain. MEV bots and relayers will not be able to read these values.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <Button variant="outline" className="border-white/10 hover:bg-white/5" onClick={() => setCurrentStep(1)}>
                    <ChevronLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                  <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(var(--primary),0.3)]" onClick={handleCreate} disabled={isPending || isWaitingForTx || !isConnected}>
                    {isPending || isWaitingForTx ? "Deploying & Encrypting..." : "Sign & Deploy Task"}
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {currentStep === 3 && (
            <div className="max-w-2xl mx-auto text-center">
              <Card className="p-12 bg-black/40 backdrop-blur-xl border-white/10 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-green-500 to-transparent" />
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-500/10 mb-8 border border-green-500/20 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
                  <Check className="w-12 h-12 text-green-500" />
                </div>
                
                <h2 className="text-3xl font-bold mb-4 text-foreground">Task Live on Network</h2>
                <p className="text-muted-foreground mb-8 text-lg">
                  Your {isConfidential ? "Confidential" : "Automated"} Task has been deployed and funded successfully.
                </p>

                {createdTaskAddress && (
                  <div className="mb-10 p-4 bg-white/[0.02] rounded-xl border border-white/5 inline-block">
                    <p className="text-sm text-muted-foreground mb-1">Contract Address</p>
                    <p className="text-sm font-mono text-primary break-all">{createdTaskAddress}</p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link href="/my-tasks">
                    <Button className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90">
                      View Dashboard
                    </Button>
                  </Link>
                  <Button variant="outline" className="w-full sm:w-auto border-white/10 hover:bg-white/5" onClick={() => {
                    setCurrentStep(0);
                    setSelectedTemplate(null);
                    setCreatedTaskAddress(null);
                  }}>
                    Deploy Another
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}