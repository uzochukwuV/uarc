import { useState, useEffect } from "react";
import { Navigation } from "@/components/navigation";
import { TemplateCard } from "@/components/template-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TaskTemplateType } from "@shared/schema";
import { ChevronLeft, Check } from "lucide-react";
import { Link } from "wouter";
import { useCreateTask, useWallet } from "@/lib/hooks";
import { useTokenApproval } from "@/lib/hooks/useTokenApproval";
import { useToast } from "@/hooks/use-toast";
import { formatEther, parseEther } from "viem";
import { useWaitForTransactionReceipt } from "wagmi";
import { ethers } from "ethers";
import { getContractAddress } from "@/lib/contracts/addresses";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const templates = [
  {
    type: "TIME_BASED_TRANSFER" as TaskTemplateType,
    name: "Time-Based Transfer",
    description: "Transfer tokens to a recipient at a specific time - perfect for testing!",
    estimatedGas: "~0.05 ETH",
  },
  {
    type: TaskTemplateType.LIMIT_ORDER,
    name: "Limit Order",
    description: "Buy or sell tokens when price reaches a specific target",
    estimatedGas: "~0.15 ETH",
  },
  {
    type: TaskTemplateType.DCA,
    name: "Dollar Cost Average",
    description: "Automatically buy tokens at regular intervals to average your entry price",
    estimatedGas: "~0.12 ETH",
  },
  {
    type: TaskTemplateType.AUTO_COMPOUND,
    name: "Auto Compound",
    description: "Automatically reinvest yield farming rewards to maximize returns",
    estimatedGas: "~0.18 ETH",
  },
];

const steps = ["Choose Template", "Configure", "Review", "Created"];

export default function CreateTask() {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplateType | null>(null);
  const [createdTaskAddress, setCreatedTaskAddress] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    rewardPerExecution: "",
    maxExecutions: "",
    expiresIn: "",
    adapterAddress: "", // Address of the adapter contract
    // Time-based transfer specific fields
    tokenAddress: "",
    recipientAddress: "",
    transferAmount: "",
    executeAfterHours: "1", // Hours from now
  });
  const { toast } = useToast();

  // Get user address from wallet connection
  const { address: userAddress, isConnected, chainId } = useWallet();

  // Get createTask hook from blockchain
  const { createTask, hash, isPending, isSuccess, error } = useCreateTask();

  // Token approval hook
  const taskFactoryAddress = getContractAddress('TASK_FACTORY', chainId) as `0x${string}`;
  const tokenAddress = formData.tokenAddress as `0x${string}` | undefined;
  const {
    allowance,
    approve,
    isPending: isApprovePending,
    isSuccess: isApproveSuccess,
    hash: approveHash,
  } = useTokenApproval(tokenAddress, taskFactoryAddress);

  // Wait for transaction confirmation
  const { isLoading: isWaitingForTx, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Wait for approval confirmation
  const { isSuccess: isApprovalConfirmed } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const handleTemplateSelect = (type: TaskTemplateType) => {
    setSelectedTemplate(type);

    // Auto-fill adapter address based on template
    if (type === "TIME_BASED_TRANSFER") {
      const adapterAddress = getContractAddress('TIME_BASED_TRANSFER_ADAPTER', chainId);
      setFormData(prev => ({ ...prev, adapterAddress }));
    }

    setCurrentStep(1);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Handle transaction success
  useEffect(() => {
    if (isTxConfirmed && currentStep !== 3) {
      // Extract task address from transaction logs
      const taskAddress = hash; // TODO: Parse task address from event logs
      setCreatedTaskAddress(taskAddress || "Unknown");
      setCurrentStep(3);
      toast({ title: "Task created successfully on blockchain!" });
    }
  }, [isTxConfirmed, currentStep, hash, toast]);

  // Handle transaction error
  useEffect(() => {
    if (error) {
      toast({
        title: "Failed to create task",
        description: (error as any)?.message || "Transaction failed",
        variant: "destructive"
      });
    }
  }, [error, toast]);

  // Handle approval confirmation - retry task creation
  useEffect(() => {
    if (isApprovalConfirmed) {
      toast({
        title: "Approval Confirmed!",
        description: "Now click 'Create Task' again to proceed",
      });
    }
  }, [isApprovalConfirmed, toast]);

  const handleCreate = () => {
    if (!selectedTemplate || !isConnected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to create a task",
        variant: "destructive"
      });
      return;
    }

    if (!formData.adapterAddress) {
      toast({
        title: "Adapter address required",
        description: "Please provide the adapter contract address",
        variant: "destructive"
      });
      return;
    }

    // Time-based transfer specific validation
    if (selectedTemplate === "TIME_BASED_TRANSFER") {
      if (!formData.tokenAddress || !formData.recipientAddress || !formData.transferAmount) {
        toast({
          title: "Missing time-based transfer fields",
          description: "Please fill in token address, recipient, and transfer amount",
          variant: "destructive"
        });
        return;
      }

      // Check token approval
      const transferAmount = BigInt(formData.transferAmount);
      const currentAllowance = allowance || 0n;

      if (currentAllowance < transferAmount) {
        toast({
          title: "Token Approval Required",
          description: `Please approve ${formData.transferAmount} tokens first`,
        });

        // Request approval
        approve(transferAmount);
         // Stop here, user needs to approve first
      }
    }

    // Calculate reward amount (default to 0.01 ETH if not specified)
    const rewardPerExecution = formData.rewardPerExecution
      ? parseEther(formData.rewardPerExecution)
      : parseEther("0.01");
    const maxExecs = formData.maxExecutions ? BigInt(formData.maxExecutions) : 1n;

    // Calculate total reward needed
    const totalReward = rewardPerExecution * maxExecs;

    // CRITICAL: TaskFactory requires msg.value >= creationFee + totalReward
    // Additionally, we need extra ETH for gas reimbursement (RewardManager multiplier ~100)
    //
    // Formula: totalETHValue = creationFee + totalReward + gasBuffer
    // Where gasBuffer should cover gas reimbursement costs
    const creationFee = 0n; // No creation fee currently set
    const gasBuffer = parseEther("2.1"); // Buffer for gas reimbursement
    const totalETHValue = creationFee + totalReward + gasBuffer;

    console.log("ETH Calculation:", {
      rewardPerExecution: formData.rewardPerExecution,
      rewardPerExecutionWei: rewardPerExecution.toString(),
      maxExecutions: maxExecs.toString(),
      totalReward: totalReward.toString(),
      gasBuffer: gasBuffer.toString(),
      totalETHValue: totalETHValue.toString(),
      totalETHValueFormatted: formatEther(totalETHValue),
    });

    // Calculate expiry timestamp
    const expiresAt = formData.expiresIn
      ? BigInt(Math.floor(Date.now() / 1000) + parseInt(formData.expiresIn) * 86400)
      : 0n;

    // Encode adapter-specific params
    let adapterParams: `0x${string}` = "0x";
    let tokenDeposits: Array<{ token: `0x${string}`; amount: bigint }> = [];

    if (selectedTemplate === "TIME_BASED_TRANSFER") {
      // Calculate executeAfter timestamp (hours from now)
      const hoursFromNow = parseFloat(formData.executeAfterHours || "1");
      const executeAfter = BigInt(Math.floor(Date.now() / 1000) + Math.floor(hoursFromNow * 3600));

      // CRITICAL: Encode as 6 parameters to match TaskLogicV2 expectations!
      // TaskLogicV2 expects Uniswap format: (router, tokenIn, tokenOut, amountIn, minAmountOut, recipient)
      // We map our params: (ignored, token, ignored, amount, executeAfter, recipient)
      adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "uint256", "uint256", "address"],
        [
          ethers.ZeroAddress,                           // router (ignored, for TaskLogicV2 compatibility)
          formData.tokenAddress,                        // tokenIn - TaskLogicV2 extracts this
          ethers.ZeroAddress,                           // tokenOut (ignored)
          BigInt(formData.transferAmount),              // amountIn - TaskLogicV2 extracts this
          executeAfter,                                 // minAmountOut - repurposed as timestamp!
          formData.recipientAddress,                    // recipient
        ]
      ) as `0x${string}`;

      // Add token deposit (the tokens to be transferred)
      tokenDeposits = [
        {
          token: formData.tokenAddress as `0x${string}`,
          amount: BigInt(formData.transferAmount),
        }
      ];
    }

    // Build actions array
    const actions = [
      {
        selector: "0x1cff79cd" as `0x${string}`, // executeAction selector from ActionRegistry
        // IMPORTANT: protocol should be the external protocol address, NOT the adapter!
        // For TimeBasedTransfer (no external protocol), use token address
        // For Uniswap, this would be the router address
        protocol: (selectedTemplate === "TIME_BASED_TRANSFER"
          ? formData.tokenAddress
          : formData.adapterAddress) as `0x${string}`,
        params: adapterParams,
      }
    ];

    console.log({
      // TaskParams
      expiresAt,
      maxExecutions: maxExecs,
      recurringInterval: 0n, // No recurring for time-based transfer
      rewardPerExecution,
      seedCommitment: ethers.ZeroHash as `0x${string}`, // No seed needed

      // Actions
      actions,

      // Token deposits
      deposits: tokenDeposits,

      // Native ETH value (for rewards)
      value: totalETHValue,
    })

    // Call smart contract
    createTask({
      // TaskParams
      expiresAt,
      maxExecutions: maxExecs,
      recurringInterval: 0n, // No recurring for time-based transfer
      rewardPerExecution,
      seedCommitment: ethers.ZeroHash as `0x${string}`, // No seed needed

      // Actions
      actions,

      // Token deposits
      deposits: tokenDeposits,

      // Native ETH value (for rewards)
      value: totalETHValue,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-6 pt-32 pb-24">
        {/* Header */}
        <div className="mb-12">
          <Link href="/">
            <div className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 hover-elevate rounded-md px-3 py-2 -ml-3 cursor-pointer" data-testid="link-back-home">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Home
            </div>
          </Link>
          <h1 className="text-4xl font-bold tracking-tight mb-4">Create Automated Task</h1>
          <p className="text-xl text-muted-foreground">
            Set up your DeFi automation in a few simple steps
          </p>
        </div>

        {/* Step Indicator */}
        <div className="mb-12">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            {steps.map((step, index) => (
              <div key={step} className="flex items-center flex-1">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                      index <= currentStep
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-background border-border text-muted-foreground"
                    }`}
                  >
                    {index < currentStep ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <span className="font-semibold">{index + 1}</span>
                    )}
                  </div>
                  <span
                    className={`text-sm font-medium hidden md:block ${
                      index <= currentStep ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {step}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className="flex-1 h-0.5 mx-4 bg-border">
                    <div
                      className={`h-full ${
                        index < currentStep ? "bg-primary" : "bg-transparent"
                      }`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div>
          {/* Step 1: Choose Template */}
          {currentStep === 0 && (
            <div className="max-w-6xl mx-auto">
              <h2 className="text-2xl font-semibold mb-8 text-center">
                Choose a Template
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {templates.map((template) => (
                  <TemplateCard
                    key={template.type}
                    {...template}
                    onSelect={() => handleTemplateSelect(template.type)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Configure */}
          {currentStep === 1 && selectedTemplate && (
            <div className="max-w-4xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Form */}
                <Card className="p-8">
                  <h2 className="text-2xl font-semibold mb-6">Configure Task</h2>
                  
                  <div className="space-y-6">
                    <div>
                      <Label htmlFor="name">Task Name</Label>
                      <Input
                        id="name"
                        placeholder="My DCA Strategy"
                        value={formData.name}
                        onChange={(e) => handleInputChange("name", e.target.value)}
                        data-testid="input-task-name"
                      />
                    </div>

                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Describe your automation strategy..."
                        value={formData.description}
                        onChange={(e) => handleInputChange("description", e.target.value)}
                        rows={3}
                        data-testid="input-task-description"
                      />
                    </div>

                    <div>
                      <Label htmlFor="adapterAddress">Adapter Contract Address</Label>
                      <Input
                        id="adapterAddress"
                        placeholder="0x..."
                        value={formData.adapterAddress}
                        onChange={(e) => handleInputChange("adapterAddress", e.target.value)}
                        data-testid="input-adapter-address"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        The adapter contract that defines execution logic
                      </p>
                    </div>

                    {/* Time-Based Transfer Specific Fields */}
                    {selectedTemplate === "TIME_BASED_TRANSFER" && (
                      <>
                        <div>
                          <Label htmlFor="tokenAddress">Token to Transfer</Label>
                          <Select
                            value={formData.tokenAddress}
                            onValueChange={(value) => handleInputChange("tokenAddress", value)}
                          >
                            <SelectTrigger id="tokenAddress" data-testid="select-token">
                              <SelectValue placeholder="Select token to transfer" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={getContractAddress('MOCK_USDC', chainId)}>
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
                              onChange={(e) => handleInputChange("tokenAddress", e.target.value)}
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
                            onChange={(e) => handleInputChange("recipientAddress", e.target.value)}
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
                            placeholder="100"
                            value={formData.transferAmount}
                            onChange={(e) => handleInputChange("transferAmount", e.target.value)}
                            data-testid="input-transfer-amount"
                          />
                          <p className="text-sm text-muted-foreground mt-1">
                            Amount of tokens to transfer (in token's smallest unit)
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
                            onChange={(e) => handleInputChange("executeAfterHours", e.target.value)}
                            data-testid="input-execute-after-hours"
                          />
                          <p className="text-sm text-muted-foreground mt-1">
                            Hours from now when the transfer can be executed
                          </p>
                        </div>
                      </>
                    )}

                    <div>
                      <Label htmlFor="reward">Reward Per Execution (ETH)</Label>
                      <Input
                        id="reward"
                        type="number"
                        placeholder="0.01"
                        step="0.001"
                        value={formData.rewardPerExecution}
                        onChange={(e) => handleInputChange("rewardPerExecution", e.target.value)}
                        data-testid="input-reward"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        Amount paid to executors per successful execution
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="maxExecutions">Maximum Executions</Label>
                      <Input
                        id="maxExecutions"
                        type="number"
                        placeholder="10"
                        value={formData.maxExecutions}
                        onChange={(e) => handleInputChange("maxExecutions", e.target.value)}
                        data-testid="input-max-executions"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        Leave empty for unlimited executions
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="expires">Expires In (days)</Label>
                      <Input
                        id="expires"
                        type="number"
                        placeholder="30"
                        value={formData.expiresIn}
                        onChange={(e) => handleInputChange("expiresIn", e.target.value)}
                        data-testid="input-expires-in"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-8">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentStep(0)}
                      data-testid="button-back"
                    >
                      <ChevronLeft className="w-4 h-4 mr-2" />
                      Back
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => setCurrentStep(2)}
                      disabled={!formData.name || !formData.rewardPerExecution || !formData.adapterAddress}
                      data-testid="button-next"
                    >
                      Continue to Review
                    </Button>
                  </div>
                </Card>

                {/* Preview */}
                <div>
                  <Card className="p-8 sticky top-24">
                    <h3 className="text-lg font-semibold mb-6">Live Preview</h3>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Task Name</p>
                        <p className="font-medium">{formData.name || "Not set"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Type</p>
                        <p className="font-medium">{selectedTemplate.replace(/_/g, " ")}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Reward</p>
                        <p className="font-medium">
                          {formData.rewardPerExecution || "0"} ETH per execution
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Max Executions</p>
                        <p className="font-medium">
                          {formData.maxExecutions || "Unlimited"}
                        </p>
                      </div>
                      {formData.expiresIn && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Expires In</p>
                          <p className="font-medium">{formData.expiresIn} days</p>
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {currentStep === 2 && (
            <div className="max-w-2xl mx-auto">
              <Card className="p-8">
                <h2 className="text-2xl font-semibold mb-6">Review & Create</h2>
                
                <div className="space-y-6 mb-8">
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">Task Name</span>
                    <span className="font-semibold">{formData.name}</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">Template</span>
                    <span className="font-semibold">{selectedTemplate?.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">Reward Per Execution</span>
                    <span className="font-semibold">{formData.rewardPerExecution} ETH</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">Max Executions</span>
                    <span className="font-semibold">{formData.maxExecutions || "Unlimited"}</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">Total Funding Required</span>
                    <span className="font-semibold text-primary">
                      {formData.maxExecutions
                        ? (parseFloat(formData.rewardPerExecution) * parseInt(formData.maxExecutions)).toFixed(3)
                        : formData.rewardPerExecution}{" "}
                      ETH
                    </span>
                  </div>
                </div>

                <div className="bg-secondary/50 rounded-lg p-4 mb-8">
                  <p className="text-sm text-muted-foreground">
                    By creating this task, you agree to fund it with the required amount and pay
                    executors the specified reward for each successful execution.
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep(1)}
                    data-testid="button-back-review"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleCreate}
                    disabled={isPending || isWaitingForTx || !isConnected}
                    data-testid="button-create-task"
                  >
                    {isPending || isWaitingForTx ? "Creating..." : "Create Task & Fund"}
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Step 4: Success */}
          {currentStep === 3 && (
            <div className="max-w-2xl mx-auto text-center">
              <Card className="p-12">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 mb-6">
                  <Check className="w-10 h-10 text-green-500" />
                </div>
                
                <h2 className="text-3xl font-bold mb-4">Task Created Successfully!</h2>
                
                <p className="text-muted-foreground mb-2">
                  Your automation task has been created and deployed to the blockchain.
                </p>
                {createdTaskAddress && (
                  <div className="mb-8">
                    <p className="text-sm text-muted-foreground mb-1">Task Contract Address:</p>
                    <p className="text-sm font-mono text-primary break-all">
                      {createdTaskAddress}
                    </p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link href="/my-tasks">
                    <Button data-testid="button-view-my-tasks">
                      View My Tasks
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCurrentStep(0);
                      setSelectedTemplate(null);
                      setCreatedTaskAddress(null);
                      setFormData({
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
                    }}
                    data-testid="button-create-another"
                  >
                    Create Another Task
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
