/**
 * x402 Payment Protocol Tests
 * Tests verifyPayment, verifyPaymentDetailed, and build402Response
 * Uses a lightweight mock provider — no network required.
 */

import { expect } from "chai";
import { ethers } from "ethers";
import {
    verifyPayment,
    verifyPaymentDetailed,
    build402Response,
    PaymentVerificationResult,
} from "../agent/x402";

// ─────────────────────────────────────────────────────────────
// Mock provider factory
// ─────────────────────────────────────────────────────────────

interface MockTx {
    to: string | null;
    from: string;
    value: bigint;
    hash: string;
}

interface MockReceipt {
    blockNumber: number;
    status: number;        // 1 = success, 0 = reverted
}

function makeMockProvider(opts: {
    tx?: MockTx | null;
    txError?: string;
    receipt?: MockReceipt | null;
    currentBlock?: number;
}): ethers.Provider {
    return {
        async getTransaction(hash: string) {
            if (opts.txError) throw new Error(opts.txError);
            return opts.tx ?? null;
        },
        async getTransactionReceipt(hash: string) {
            return opts.receipt ?? null;
        },
        async getBlockNumber() {
            return opts.currentBlock ?? 100;
        },
    } as unknown as ethers.Provider;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const VALID_TX_HASH   = "0x" + "a".repeat(64);
const EXPECTED_TO     = "0x535f007D418B4F95f47310c0D26F3b25B6A4DC50";
const REQUIRED_AMOUNT = ethers.parseEther("0.0001");
const SENDER          = "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF";

const GOOD_TX: MockTx = {
    hash: VALID_TX_HASH,
    to:   EXPECTED_TO,
    from: SENDER,
    value: REQUIRED_AMOUNT,
};

const GOOD_RECEIPT: MockReceipt = {
    blockNumber: 99,
    status: 1,
};

// ─────────────────────────────────────────────────────────────
// verifyPaymentDetailed
// ─────────────────────────────────────────────────────────────

describe("verifyPaymentDetailed", () => {
    it("rejects a null/empty tx hash", async () => {
        const provider = makeMockProvider({});
        const result = await verifyPaymentDetailed(provider, "", EXPECTED_TO, REQUIRED_AMOUNT);
        expect(result.valid).to.be.false;
        expect(result.reason).to.include("Invalid tx hash format");
    });

    it("rejects a hash that is too short", async () => {
        const provider = makeMockProvider({});
        const result = await verifyPaymentDetailed(provider, "0xabc123", EXPECTED_TO, REQUIRED_AMOUNT);
        expect(result.valid).to.be.false;
        expect(result.reason).to.include("Invalid tx hash format");
    });

    it("rejects a hash that does not start with 0x", async () => {
        const provider = makeMockProvider({});
        const badHash = "a".repeat(64);          // 64 chars but no 0x prefix
        const result = await verifyPaymentDetailed(provider, badHash, EXPECTED_TO, REQUIRED_AMOUNT);
        expect(result.valid).to.be.false;
        expect(result.reason).to.include("Invalid tx hash format");
    });

    it("returns invalid when provider throws fetching tx", async () => {
        const provider = makeMockProvider({ txError: "network error" });
        const result = await verifyPaymentDetailed(provider, VALID_TX_HASH, EXPECTED_TO, REQUIRED_AMOUNT);
        expect(result.valid).to.be.false;
        expect(result.reason).to.include("Could not fetch tx");
        expect(result.reason).to.include("network error");
    });

    it("returns invalid when transaction is not found (null)", async () => {
        const provider = makeMockProvider({ tx: null });
        const result = await verifyPaymentDetailed(provider, VALID_TX_HASH, EXPECTED_TO, REQUIRED_AMOUNT);
        expect(result.valid).to.be.false;
        expect(result.reason).to.equal("Transaction not found");
    });

    it("returns invalid when tx.to is null", async () => {
        const provider = makeMockProvider({
            tx: { ...GOOD_TX, to: null },
        });
        const result = await verifyPaymentDetailed(provider, VALID_TX_HASH, EXPECTED_TO, REQUIRED_AMOUNT);
        expect(result.valid).to.be.false;
        expect(result.reason).to.include("Wrong recipient");
    });

    it("returns invalid when recipient does not match (wrong address)", async () => {
        const wrongTo = "0x000000000000000000000000000000000000dEaD";
        const provider = makeMockProvider({
            tx: { ...GOOD_TX, to: wrongTo },
        });
        const result = await verifyPaymentDetailed(provider, VALID_TX_HASH, EXPECTED_TO, REQUIRED_AMOUNT);
        expect(result.valid).to.be.false;
        expect(result.reason).to.include("Wrong recipient");
        expect(result.reason).to.include(wrongTo);
    });

    it("is case-insensitive when comparing recipient addresses", async () => {
        const upperCaseTo = EXPECTED_TO.toUpperCase();
        const provider = makeMockProvider({
            tx: { ...GOOD_TX, to: upperCaseTo },
            receipt: GOOD_RECEIPT,
            currentBlock: 100,
        });
        const result = await verifyPaymentDetailed(provider, VALID_TX_HASH, EXPECTED_TO, REQUIRED_AMOUNT);
        expect(result.valid).to.be.true;
    });

    it("returns invalid when payment amount is below requirement", async () => {
        const tooLow = REQUIRED_AMOUNT - 1n;
        const provider = makeMockProvider({
            tx: { ...GOOD_TX, value: tooLow },
        });
        const result = await verifyPaymentDetailed(provider, VALID_TX_HASH, EXPECTED_TO, REQUIRED_AMOUNT);
        expect(result.valid).to.be.false;
        expect(result.reason).to.include("Insufficient payment");
    });

    it("accepts payment that exactly meets the required amount", async () => {
        const provider = makeMockProvider({
            tx: { ...GOOD_TX, value: REQUIRED_AMOUNT },
            receipt: GOOD_RECEIPT,
            currentBlock: 100,
        });
        const result = await verifyPaymentDetailed(provider, VALID_TX_HASH, EXPECTED_TO, REQUIRED_AMOUNT);
        expect(result.valid).to.be.true;
        expect(result.amount).to.equal(REQUIRED_AMOUNT);
    });

    it("accepts payment that exceeds the required amount", async () => {
        const provider = makeMockProvider({
            tx: { ...GOOD_TX, value: REQUIRED_AMOUNT * 2n },
            receipt: GOOD_RECEIPT,
            currentBlock: 100,
        });
        const result = await verifyPaymentDetailed(provider, VALID_TX_HASH, EXPECTED_TO, REQUIRED_AMOUNT);
        expect(result.valid).to.be.true;
    });

    it("returns invalid when tx has no receipt yet (pending)", async () => {
        const provider = makeMockProvider({
            tx: GOOD_TX,
            receipt: null,
        });
        const result = await verifyPaymentDetailed(provider, VALID_TX_HASH, EXPECTED_TO, REQUIRED_AMOUNT);
        expect(result.valid).to.be.false;
        expect(result.reason).to.include("not yet mined");
    });

    it("returns invalid when receipt status is 0 (reverted)", async () => {
        const provider = makeMockProvider({
            tx: GOOD_TX,
            receipt: { ...GOOD_RECEIPT, status: 0 },
            currentBlock: 100,
        });
        const result = await verifyPaymentDetailed(provider, VALID_TX_HASH, EXPECTED_TO, REQUIRED_AMOUNT);
        expect(result.valid).to.be.false;
        expect(result.reason).to.equal("Transaction reverted");
    });

    it("returns invalid when confirmations are below minimum (minConfirmations = 3)", async () => {
        // currentBlock = 100, receiptBlock = 99 → confirmations = 2
        const provider = makeMockProvider({
            tx: GOOD_TX,
            receipt: { blockNumber: 99, status: 1 },
            currentBlock: 100,
        });
        const result = await verifyPaymentDetailed(provider, VALID_TX_HASH, EXPECTED_TO, REQUIRED_AMOUNT, 3);
        expect(result.valid).to.be.false;
        expect(result.reason).to.include("Not enough confirmations");
        expect(result.reason).to.include("2 < 3");
    });

    it("passes when confirmations exactly meet the minimum", async () => {
        // currentBlock = 101, receiptBlock = 99 → confirmations = 3
        const provider = makeMockProvider({
            tx: GOOD_TX,
            receipt: { blockNumber: 99, status: 1 },
            currentBlock: 101,
        });
        const result = await verifyPaymentDetailed(provider, VALID_TX_HASH, EXPECTED_TO, REQUIRED_AMOUNT, 3);
        expect(result.valid).to.be.true;
    });

    it("returns full metadata on success", async () => {
        const provider = makeMockProvider({
            tx: GOOD_TX,
            receipt: { blockNumber: 95, status: 1 },
            currentBlock: 100,
        });
        const result = await verifyPaymentDetailed(provider, VALID_TX_HASH, EXPECTED_TO, REQUIRED_AMOUNT);
        expect(result.valid).to.be.true;
        expect(result.txHash).to.equal(VALID_TX_HASH);
        expect(result.from).to.equal(SENDER);
        expect(result.to).to.equal(EXPECTED_TO);
        expect(result.blockNumber).to.equal(95);
        expect(result.amount).to.equal(REQUIRED_AMOUNT);
        expect(result.reason).to.be.undefined;
    });
});

// ─────────────────────────────────────────────────────────────
// verifyPayment (boolean wrapper)
// ─────────────────────────────────────────────────────────────

describe("verifyPayment", () => {
    it("returns false for invalid hash", async () => {
        const provider = makeMockProvider({});
        const ok = await verifyPayment(provider, "bad", EXPECTED_TO, REQUIRED_AMOUNT);
        expect(ok).to.be.false;
    });

    it("returns false when tx not found", async () => {
        const provider = makeMockProvider({ tx: null });
        const ok = await verifyPayment(provider, VALID_TX_HASH, EXPECTED_TO, REQUIRED_AMOUNT);
        expect(ok).to.be.false;
    });

    it("returns true for valid confirmed payment", async () => {
        const provider = makeMockProvider({
            tx: GOOD_TX,
            receipt: GOOD_RECEIPT,
            currentBlock: 100,
        });
        const ok = await verifyPayment(provider, VALID_TX_HASH, EXPECTED_TO, REQUIRED_AMOUNT);
        expect(ok).to.be.true;
    });

    it("defaults to 1 confirmation when not specified", async () => {
        // receiptBlock = 100, currentBlock = 100 → confirmations = 1 ≥ 1 ✓
        const provider = makeMockProvider({
            tx: GOOD_TX,
            receipt: { blockNumber: 100, status: 1 },
            currentBlock: 100,
        });
        const ok = await verifyPayment(provider, VALID_TX_HASH, EXPECTED_TO, REQUIRED_AMOUNT);
        expect(ok).to.be.true;
    });
});

// ─────────────────────────────────────────────────────────────
// build402Response
// ─────────────────────────────────────────────────────────────

describe("build402Response", () => {
    const payTo       = "0x535f007D418B4F95f47310c0D26F3b25B6A4DC50";
    const feeWei      = ethers.parseEther("0.0001");
    const arcChainId  = 5042002;
    const resourceUrl = "POST http://localhost:3000/task/create";

    it("sets error field to 'Payment Required'", () => {
        const resp = build402Response(payTo, feeWei, arcChainId, resourceUrl) as any;
        expect(resp.error).to.equal("Payment Required");
    });

    it("includes correct x402 payment details", () => {
        const resp = build402Response(payTo, feeWei, arcChainId, resourceUrl) as any;
        const x402  = resp.x402;
        expect(x402.payTo).to.equal(payTo);
        expect(x402.amount).to.equal("0.0001");
        expect(x402.currency).to.equal("ETH");
        expect(x402.chainId).to.equal(arcChainId);
        expect(x402.resource).to.equal(resourceUrl);
        expect(x402.scheme).to.equal("exact");
    });

    it("labels Arc chain 5042002 as 'Arc Testnet'", () => {
        const resp = build402Response(payTo, feeWei, arcChainId, resourceUrl) as any;
        expect(resp.x402.network).to.equal("Arc Testnet");
    });

    it("labels unknown chains as 'Chain <id>'", () => {
        const resp = build402Response(payTo, feeWei, 1, resourceUrl) as any;
        expect(resp.x402.network).to.equal("Chain 1");
    });

    it("sets expires ~5 minutes in the future", () => {
        const before = Math.floor(Date.now() / 1000);
        const resp   = build402Response(payTo, feeWei, arcChainId, resourceUrl) as any;
        const after  = Math.floor(Date.now() / 1000);
        expect(resp.x402.expires).to.be.gte(before + 299);
        expect(resp.x402.expires).to.be.lte(after + 301);
    });

    it("accepts a custom description", () => {
        const resp = build402Response(payTo, feeWei, arcChainId, resourceUrl, "Custom desc") as any;
        expect(resp.x402.description).to.equal("Custom desc");
    });

    it("defaults description when not provided", () => {
        const resp = build402Response(payTo, feeWei, arcChainId, resourceUrl) as any;
        expect(resp.x402.description).to.be.a("string").and.have.length.greaterThan(0);
    });

    it("includes human-readable instructions string", () => {
        const resp = build402Response(payTo, feeWei, arcChainId, resourceUrl) as any;
        expect(resp.instructions).to.be.a("string");
        expect(resp.instructions).to.include("0.0001");
        expect(resp.instructions).to.include(payTo);
    });
});
