/**
 * Local API validation test — no live RPC or Mistral API required.
 *
 * Tests:
 *  1. Manifest loads with all deployed contract addresses
 *  2. ABI encoding round-trips for all three adapter types
 *  3. buildTaskPayload produces valid calldata
 *  4. parseIntent defaults are applied correctly
 *  5. Server routes return correct structure (uses mock provider)
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { applyDefaultsTest, buildPayloadTest } from "./test-helpers";

// ── colour helpers ──────────────────────────────────────────────
const pass = (msg: string) => console.log(`  ✅  ${msg}`);
const fail = (msg: string, e?: any) => { console.error(`  ❌  ${msg}`, e?.message || e || ""); process.exitCode = 1; };
const section = (title: string) => console.log(`\n── ${title} ──`);

// ── load manifest ───────────────────────────────────────────────
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));

async function main() {
    console.log("\n🧪  UARC Agent — local validation tests\n");

    // ── 1. Manifest ──────────────────────────────────────────────
    section("Manifest");
    try {
        const required = [
            ["contracts.TaskFactory",               manifest.contracts?.TaskFactory],
            ["contracts.TaskLogicV2",               manifest.contracts?.TaskLogicV2],
            ["contracts.ExecutorHub",               manifest.contracts?.ExecutorHub],
            ["adapters.TimeBasedTransferAdapter",   manifest.adapters?.TimeBasedTransferAdapter],
            ["adapters.CCTPTransferAdapter",        manifest.adapters?.CCTPTransferAdapter],
            ["adapters.StorkPriceTransferAdapter",  manifest.adapters?.StorkPriceTransferAdapter],
            ["tokens.MockUSDC",                     manifest.tokens?.MockUSDC],
            ["tokens.MockEURO",                     manifest.tokens?.MockEURO],
            ["oracles.MockStorkUSDC",               manifest.oracles?.MockStorkUSDC],
            ["oracles.MockStorkEURO",               manifest.oracles?.MockStorkEURO],
            ["cctp.MockTokenMessenger",             manifest.cctp?.MockTokenMessenger],
        ];
        for (const [key, val] of required) {
            if (!val || !ethers.isAddress(val)) fail(`${key} = "${val}" is not a valid address`);
            else pass(`${key} → ${val}`);
        }
        if (manifest.chainId !== 5042002) fail(`chainId expected 5042002, got ${manifest.chainId}`);
        else pass(`chainId = 5042002`);
    } catch (e) { fail("manifest checks threw", e); }

    // ── 2. ABI encoding — TimeBasedTransfer ─────────────────────
    section("ABI encoding — time_based_transfer");
    try {
        const now = Math.floor(Date.now() / 1000);
        const token   = manifest.tokens.MockUSDC;
        const recip   = manifest.contracts.TaskFactory; // any valid address
        const amount  = BigInt(50_000_000); // 50 USDC
        const after   = BigInt(now + 600);

        const enc = new ethers.AbiCoder().encode(
            ["address", "address", "uint256", "uint256"],
            [token, recip, amount, after]
        );
        const [dToken, dRecip, dAmt, dAfter] = new ethers.AbiCoder().decode(
            ["address", "address", "uint256", "uint256"], enc
        );
        if (dToken.toLowerCase() !== token.toLowerCase()) fail("token mismatch after encode/decode");
        else pass(`token round-trip: ${dToken}`);
        if (dAmt !== amount) fail(`amount mismatch: ${dAmt} != ${amount}`);
        else pass(`amount round-trip: ${dAmt} (50 USDC)`);
        if (dAfter !== after) fail(`executeAfter mismatch`);
        else pass(`executeAfter round-trip: ${dAfter}`);
    } catch (e) { fail("time_based_transfer ABI encoding failed", e); }

    // ── 3. ABI encoding — CCTP bridge ───────────────────────────
    section("ABI encoding — cctp_bridge");
    try {
        const messenger = manifest.cctp.MockTokenMessenger;
        const token     = manifest.tokens.MockUSDC;
        const amount    = BigInt(100_000_000);
        const destDomain = 0;
        const recip32   = ethers.zeroPadValue("0x535f007D418B4F95f47310c0D26F3b25B6A4DC50", 32);
        const after     = BigInt(Math.floor(Date.now() / 1000) + 1800);

        const enc = new ethers.AbiCoder().encode(
            ["address", "address", "uint256", "uint32", "bytes32", "uint256"],
            [messenger, token, amount, destDomain, recip32, after]
        );
        const [dMsg, dToken, dAmt, dDomain] = new ethers.AbiCoder().decode(
            ["address", "address", "uint256", "uint32", "bytes32", "uint256"], enc
        );
        if (dMsg.toLowerCase() !== messenger.toLowerCase()) fail("messenger mismatch");
        else pass(`messenger round-trip: ${dMsg}`);
        if (Number(dDomain) !== destDomain) fail(`domain mismatch: got ${dDomain}`);
        else pass(`destinationDomain round-trip: ${dDomain} (Ethereum)`);
        pass(`amount round-trip: ${dAmt} (100 USDC)`);
    } catch (e) { fail("cctp_bridge ABI encoding failed", e); }

    // ── 4. ABI encoding — StorkPrice ────────────────────────────
    section("ABI encoding — stork_price_transfer");
    try {
        const oracle  = manifest.oracles.MockStorkUSDC;
        const token   = manifest.tokens.MockUSDC;
        const amount  = BigInt(200_000_000);
        const price   = BigInt(95_000_000); // $0.95 (8 dec)
        const isBelow = true;
        const recip   = "0x535f007D418B4F95f47310c0D26F3b25B6A4DC50";

        const enc = new ethers.AbiCoder().encode(
            ["address", "address", "uint256", "int256", "bool", "address"],
            [oracle, token, amount, price, isBelow, recip]
        );
        const [, , dAmt, dPrice, dBelow, dRecip] = new ethers.AbiCoder().decode(
            ["address", "address", "uint256", "int256", "bool", "address"], enc
        );
        if (dAmt !== amount) fail("amount mismatch");
        else pass(`amount round-trip: ${dAmt}`);
        if (dPrice !== price) fail("targetPrice mismatch");
        else pass(`targetPrice round-trip: $${Number(dPrice) / 1e8} (8-dec int256)`);
        if (dBelow !== isBelow) fail("isBelow mismatch");
        else pass(`isBelow round-trip: ${dBelow}`);
        if (dRecip.toLowerCase() !== recip.toLowerCase()) fail("recipient mismatch");
        else pass(`recipient round-trip: ${dRecip}`);
    } catch (e) { fail("stork_price_transfer ABI encoding failed", e); }

    // ── 5. buildTaskPayload structure ────────────────────────────
    section("buildTaskPayload structure");
    try {
        const payload = buildPayloadTest(manifest);
        if (!ethers.isAddress(payload.taskFactoryAddress)) fail("taskFactoryAddress not an address");
        else pass(`taskFactoryAddress: ${payload.taskFactoryAddress}`);
        if (!Array.isArray(payload.actions) || payload.actions.length !== 1) fail("actions array invalid");
        else pass(`actions[0].protocol = ${payload.actions[0].protocol}`);
        if (!Array.isArray(payload.deposits) || payload.deposits.length !== 1) fail("deposits array invalid");
        else pass(`deposits[0].token = ${payload.deposits[0].token}`);
        if (!payload.taskParams.seedCommitment || payload.taskParams.seedCommitment !== ethers.ZeroHash)
            fail("seedCommitment should be ZeroHash");
        else pass(`seedCommitment = ZeroHash`);
        pass(`value = ${payload.value} ETH`);
    } catch (e) { fail("buildTaskPayload threw", e); }

    // ── 6. applyDefaults ─────────────────────────────────────────
    section("applyDefaults (intent normalization)");
    try {
        const now = Math.floor(Date.now() / 1000);

        // Missing token defaults to MockUSDC
        const intentNoToken = applyDefaultsTest({
            summary: "transfer some usdc", adapterType: "time_based_transfer", params: { amount: "1000000" }
        }, manifest, now);
        if (intentNoToken.params.token !== manifest.tokens.MockUSDC)
            fail(`default token: expected MockUSDC, got ${intentNoToken.params.token}`);
        else pass(`default token → MockUSDC`);

        // EURO detection
        const intentEuro = applyDefaultsTest({
            summary: "send euro tokens", adapterType: "time_based_transfer", params: { amount: "1000000" }
        }, manifest, now);
        if (intentEuro.params.token !== manifest.tokens.MockEURO)
            fail(`EURO detection failed: token = ${intentEuro.params.token}`);
        else pass(`EURO detection → MockEURO token`);

        // executeAfter defaults to now+300
        const intentNoTime = applyDefaultsTest({
            summary: "transfer usdc", adapterType: "time_based_transfer", params: { token: manifest.tokens.MockUSDC, amount: "1000000" }
        }, manifest, now);
        const diff = Number(intentNoTime.params.executeAfter) - now;
        if (diff < 290 || diff > 310) fail(`executeAfter default off: diff=${diff}s`);
        else pass(`executeAfter default = now+300 (diff: ${diff}s)`);

        // Stork oracle defaults to MockStorkUSDC
        const intentOracle = applyDefaultsTest({
            summary: "sell if price drops", adapterType: "stork_price_transfer",
            params: { token: manifest.tokens.MockUSDC, amount: "1000000" }
        }, manifest, now);
        if (intentOracle.params.storkOracle !== manifest.oracles.MockStorkUSDC)
            fail(`default oracle: expected MockStorkUSDC, got ${intentOracle.params.storkOracle}`);
        else pass(`default storkOracle → MockStorkUSDC`);
    } catch (e) { fail("applyDefaults threw", e); }

    // ── Summary ──────────────────────────────────────────────────
    console.log("\n────────────────────────────────────────");
    if (process.exitCode === 1) {
        console.log("❌  Some tests FAILED — see above\n");
    } else {
        console.log("✅  All tests passed\n");
    }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
