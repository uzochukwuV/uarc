/**
 * x402 Payment Protocol Implementation
 * HTTP 402 "Payment Required" for on-chain micropayments
 *
 * Protocol flow:
 * 1. Client makes request without payment
 * 2. Server returns 402 with X402PaymentRequired details
 * 3. Client sends ETH on-chain to specified address
 * 4. Client retries with X-Payment-Tx: <txHash>
 * 5. Server verifies tx on-chain and serves the request
 */

import { ethers } from "ethers";

export interface X402PaymentRequired {
    payTo: string;          // Recipient address (server wallet)
    amount: string;         // Amount in native currency (ETH)
    currency: string;       // "ETH"
    network: string;        // Network name
    chainId: number;        // Chain ID
    description: string;    // What this payment is for
    scheme: "exact";        // Payment scheme
    resource: string;       // The resource being paid for
    expires: number;        // Unix timestamp when payment window closes
}

export interface PaymentVerificationResult {
    valid: boolean;
    txHash: string;
    amount?: bigint;
    from?: string;
    to?: string;
    blockNumber?: number;
    reason?: string;
}

/**
 * Verify that a transaction on Arc testnet:
 * 1. Exists and is confirmed
 * 2. Sent ETH to the expected recipient
 * 3. Sent at least the required amount
 *
 * @param provider Ethers provider
 * @param txHash Transaction hash to verify
 * @param expectedTo Expected recipient address
 * @param requiredAmount Minimum ETH amount required (in wei)
 * @param minConfirmations Minimum block confirmations
 */
export async function verifyPayment(
    provider: ethers.Provider,
    txHash: string,
    expectedTo: string,
    requiredAmount: bigint,
    minConfirmations: number = 1
): Promise<boolean> {
    const result = await verifyPaymentDetailed(provider, txHash, expectedTo, requiredAmount, minConfirmations);
    return result.valid;
}

export async function verifyPaymentDetailed(
    provider: ethers.Provider,
    txHash: string,
    expectedTo: string,
    requiredAmount: bigint,
    minConfirmations: number = 1
): Promise<PaymentVerificationResult> {
    if (!txHash || !txHash.startsWith("0x") || txHash.length !== 66) {
        return { valid: false, txHash, reason: "Invalid tx hash format" };
    }

    let tx: ethers.TransactionResponse | null = null;
    try {
        tx = await provider.getTransaction(txHash);
    } catch (err: any) {
        return { valid: false, txHash, reason: `Could not fetch tx: ${err.message}` };
    }

    if (!tx) {
        return { valid: false, txHash, reason: "Transaction not found" };
    }

    // Check recipient
    const toAddress = tx.to?.toLowerCase();
    if (!toAddress || toAddress !== expectedTo.toLowerCase()) {
        return {
            valid: false,
            txHash,
            reason: `Wrong recipient: got ${tx.to}, expected ${expectedTo}`,
        };
    }

    // Check amount
    if (tx.value < requiredAmount) {
        return {
            valid: false,
            txHash,
            reason: `Insufficient payment: got ${ethers.formatEther(tx.value)} ETH, required ${ethers.formatEther(requiredAmount)} ETH`,
        };
    }

    // Wait for confirmations
    let receipt: ethers.TransactionReceipt | null = null;
    try {
        receipt = await provider.getTransactionReceipt(txHash);
    } catch {}

    if (!receipt) {
        return { valid: false, txHash, reason: "Transaction not yet mined" };
    }

    if (!receipt.status || receipt.status === 0) {
        return { valid: false, txHash, reason: "Transaction reverted" };
    }

    const currentBlock = await provider.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber + 1;

    if (confirmations < minConfirmations) {
        return {
            valid: false,
            txHash,
            reason: `Not enough confirmations: ${confirmations} < ${minConfirmations}`,
        };
    }

    return {
        valid: true,
        txHash,
        amount: tx.value,
        from: tx.from,
        to: tx.to || undefined,
        blockNumber: receipt.blockNumber,
    };
}

/**
 * Build a standard 402 response body
 */
export function build402Response(
    payTo: string,
    feeWei: bigint,
    chainId: number,
    resourceUrl: string,
    description: string = "API access fee"
): object {
    return {
        error: "Payment Required",
        x402: {
            payTo,
            amount: ethers.formatEther(feeWei),
            currency: "ETH",
            network: chainId === 5042002 ? "Arc Testnet" : `Chain ${chainId}`,
            chainId,
            description,
            scheme: "exact",
            resource: resourceUrl,
            expires: Math.floor(Date.now() / 1000) + 300,
        } as X402PaymentRequired,
        instructions: [
            `1. Send exactly ${ethers.formatEther(feeWei)} ETH to ${payTo} on chain ${chainId}`,
            "2. Note the transaction hash",
            "3. Retry this request with header: X-Payment-Tx: <txHash>",
        ].join("\n"),
    };
}
