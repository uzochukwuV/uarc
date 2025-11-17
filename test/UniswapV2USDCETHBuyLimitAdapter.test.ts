import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  UniswapV2USDCETHBuyLimitAdapter,
  MockERC20,
  MockUniswapRouter,
  MockChainlinkPriceFeed,
} from "../typechain-types";

/**
 * @title UniswapV2USDCETHBuyLimitAdapter Test Suite
 * @notice Comprehensive tests for production USDC->ETH buy limit adapter
 *
 * Tests cover:
 * 1. Price condition validation (staleness, validity, bounds, limit check)
 * 2. Token validation (contract existence)
 * 3. Liquidity validation (router checks, slippage, price impact)
 * 4. Execution success paths
 * 5. Execution failure paths
 * 6. Edge cases and security checks
 */
describe("UniswapV2USDCETHBuyLimitAdapter", function () {
  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let vault: SignerWithAddress; // Simulates TaskVault

  // Mock infrastructure
  let mockUSDC: MockERC20;
  let mockWETH: MockERC20;
  let mockRouter: MockUniswapRouter;
  let mockPriceFeed: MockChainlinkPriceFeed;

  // Adapter
  let adapter: UniswapV2USDCETHBuyLimitAdapter;

  // Constants
  const INITIAL_ETH_PRICE = 3000e8; // $3000 with 8 decimals
  const USDC_AMOUNT = ethers.parseUnits("1000", 6); // 1000 USDC
  const MIN_WETH_OUT = ethers.parseEther("0.3"); // Min 0.3 WETH
  const PRICE_LIMIT = 3100e8; // $3100 limit

  before(async function () {
    [deployer, user, vault] = await ethers.getSigners();
  });

  beforeEach(async function () {
    // ============ DEPLOY MOCK TOKENS ============

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);
    await mockUSDC.waitForDeployment();

    mockWETH = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
    await mockWETH.waitForDeployment();

    // ============ DEPLOY MOCK ROUTER ============

    const MockRouter = await ethers.getContractFactory("MockUniswapRouter");
    mockRouter = await MockRouter.deploy();
    await mockRouter.waitForDeployment();

    // ============ DEPLOY MOCK PRICE FEED ============

    const MockPriceFeed = await ethers.getContractFactory("MockChainlinkPriceFeed");
    mockPriceFeed = await MockPriceFeed.deploy(INITIAL_ETH_PRICE);
    await mockPriceFeed.waitForDeployment();

    // ============ DEPLOY ADAPTER ============

    const UniswapV2USDCETHBuyLimitAdapter = await ethers.getContractFactory(
      "UniswapV2USDCETHBuyLimitAdapter"
    );
    adapter = await UniswapV2USDCETHBuyLimitAdapter.deploy(
      await mockUSDC.getAddress(),
      await mockWETH.getAddress(),
      await mockRouter.getAddress(),
      await mockPriceFeed.getAddress()
    );
    await adapter.waitForDeployment();

    // ============ SETUP MOCK ROUTER WITH LIQUIDITY ============

    await mockUSDC.mint(await mockRouter.getAddress(), ethers.parseUnits("1000000", 6));
    await mockWETH.mint(await mockRouter.getAddress(), ethers.parseEther("1000"));

    // ============ SETUP VAULT BALANCES ============

    await mockUSDC.mint(vault.address, ethers.parseUnits("10000", 6));
  });

  describe("Deployment", function () {
    it("Should deploy with correct immutable addresses", async function () {
      expect(await adapter.USDC()).to.equal(await mockUSDC.getAddress());
      expect(await adapter.WETH()).to.equal(await mockWETH.getAddress());
      expect(await adapter.UNISWAP_ROUTER()).to.equal(await mockRouter.getAddress());
      expect(await adapter.ETH_USD_PRICE_FEED()).to.equal(await mockPriceFeed.getAddress());
    });

    it("Should return correct adapter name", async function () {
      expect(await adapter.name()).to.equal("UniswapV2USDCETHBuyLimitAdapter");
    });

    it("Should support only the configured router protocol", async function () {
      expect(await adapter.isProtocolSupported(await mockRouter.getAddress())).to.be.true;
      expect(await adapter.isProtocolSupported(ethers.ZeroAddress)).to.be.false;
      expect(await adapter.isProtocolSupported(user.address)).to.be.false;
    });

    it("Should revert deployment with zero addresses", async function () {
      const AdapterFactory = await ethers.getContractFactory("UniswapV2USDCETHBuyLimitAdapter");

      await expect(
        AdapterFactory.deploy(
          ethers.ZeroAddress, // Invalid USDC
          await mockWETH.getAddress(),
          await mockRouter.getAddress(),
          await mockPriceFeed.getAddress()
        )
      ).to.be.revertedWith("Invalid USDC");

      await expect(
        AdapterFactory.deploy(
          await mockUSDC.getAddress(),
          ethers.ZeroAddress, // Invalid WETH
          await mockRouter.getAddress(),
          await mockPriceFeed.getAddress()
        )
      ).to.be.revertedWith("Invalid WETH");

      await expect(
        AdapterFactory.deploy(
          await mockUSDC.getAddress(),
          await mockWETH.getAddress(),
          ethers.ZeroAddress, // Invalid router
          await mockPriceFeed.getAddress()
        )
      ).to.be.revertedWith("Invalid router");

      await expect(
        AdapterFactory.deploy(
          await mockUSDC.getAddress(),
          await mockWETH.getAddress(),
          await mockRouter.getAddress(),
          ethers.ZeroAddress // Invalid price feed
        )
      ).to.be.revertedWith("Invalid price feed");
    });
  });

  describe("canExecute - Price Condition Validation", function () {
    it("Should return true when price is at limit", async function () {
      // Set price exactly at limit
      await mockPriceFeed.updatePrice(PRICE_LIMIT);

      const params = buildParams({
        maxPriceUSD: PRICE_LIMIT,
      });

      const [canExecute, reason] = await adapter.canExecute(params);
      expect(canExecute).to.be.true;
      expect(reason).to.equal("Ready to execute");
    });

    it("Should return true when price is below limit", async function () {
      // Set price slightly below limit (within 5% of router's 3000 rate)
      // Router uses 3000, oracle at 2950 is within 5% tolerance
      await mockPriceFeed.updatePrice(2950e8);

      const params = buildParams({
        maxPriceUSD: PRICE_LIMIT,
      });

      const [canExecute, reason] = await adapter.canExecute(params);
      expect(canExecute).to.be.true;
      expect(reason).to.equal("Ready to execute");
    });

    it("Should return false when price is above limit", async function () {
      // Set price above limit
      await mockPriceFeed.updatePrice(3500e8);

      const params = buildParams({
        maxPriceUSD: PRICE_LIMIT,
      });

      const [canExecute, reason] = await adapter.canExecute(params);
      expect(canExecute).to.be.false;
      expect(reason).to.equal("ETH price too high");
    });

    it("Should return false when price feed is stale", async function () {
      // Set price updated 2 hours ago
      const staleTimestamp = (await ethers.provider.getBlock("latest"))!.timestamp - 7200;
      await mockPriceFeed.setUpdatedAt(staleTimestamp);

      const params = buildParams({});

      const [canExecute, reason] = await adapter.canExecute(params);
      expect(canExecute).to.be.false;
      expect(reason).to.equal("Price feed stale");
    });

    it("Should return false when price is negative", async function () {
      // Set invalid negative price
      await mockPriceFeed.updatePrice(-1000e8);

      const params = buildParams({});

      const [canExecute, reason] = await adapter.canExecute(params);
      expect(canExecute).to.be.false;
      expect(reason).to.equal("Invalid price: non-positive");
    });

    it("Should return false when price is zero", async function () {
      await mockPriceFeed.updatePrice(0);

      const params = buildParams({});

      const [canExecute, reason] = await adapter.canExecute(params);
      expect(canExecute).to.be.false;
      expect(reason).to.equal("Invalid price: non-positive");
    });

    it("Should return false when price is unreasonably low", async function () {
      // Set price to $50 (below MIN_REASONABLE_PRICE of $100)
      await mockPriceFeed.updatePrice(50e8);

      const params = buildParams({});

      const [canExecute, reason] = await adapter.canExecute(params);
      expect(canExecute).to.be.false;
      expect(reason).to.equal("Invalid price: out of bounds");
    });

    it("Should return false when price is unreasonably high", async function () {
      // Set price to $150,000 (above MAX_REASONABLE_PRICE of $100,000)
      await mockPriceFeed.updatePrice(150000e8);

      const params = buildParams({});

      const [canExecute, reason] = await adapter.canExecute(params);
      expect(canExecute).to.be.false;
      expect(reason).to.equal("Invalid price: out of bounds");
    });
  });

  describe("canExecute - Token Validation", function () {
    it("Should validate that tokenIn is a contract", async function () {
      const params = buildParams({
        tokenIn: user.address, // EOA, not contract
      });

      const [canExecute, reason] = await adapter.canExecute(params);
      expect(canExecute).to.be.false;
      expect(reason).to.equal("Invalid tokenIn: not a contract");
    });

    it("Should validate that tokenOut is a contract", async function () {
      const params = buildParams({
        tokenOut: user.address, // EOA, not contract
      });

      const [canExecute, reason] = await adapter.canExecute(params);
      expect(canExecute).to.be.false;
      expect(reason).to.equal("Invalid tokenOut: not a contract");
    });
  });

  describe("canExecute - Liquidity Validation", function () {
    it("Should return false when slippage is too high", async function () {
      const params = buildParams({
        amountIn: USDC_AMOUNT,
        minAmountOut: ethers.parseEther("10"), // Unrealistic minimum (would need $30k ETH price)
      });

      const [canExecute, reason] = await adapter.canExecute(params);
      expect(canExecute).to.be.false;
      expect(reason).to.equal("Insufficient liquidity: slippage too high");
    });

    it("Should return true when liquidity is sufficient", async function () {
      const params = buildParams({
        amountIn: USDC_AMOUNT,
        minAmountOut: MIN_WETH_OUT,
      });

      const [canExecute, reason] = await adapter.canExecute(params);
      expect(canExecute).to.be.true;
      expect(reason).to.equal("Ready to execute");
    });
  });

  describe("execute - Success Paths", function () {
    it("Should execute swap successfully when all conditions are met", async function () {
      const params = buildParams({});

      // Vault approves adapter to spend USDC
      await mockUSDC.connect(vault).approve(await adapter.getAddress(), USDC_AMOUNT);

      const userWETHBefore = await mockWETH.balanceOf(user.address);

      // Execute (use staticCall to get return values)
      const [success, result] = await adapter.execute.staticCall(vault.address, params);

      expect(success).to.be.true;

      // Actually execute the transaction
      await adapter.connect(vault).execute(vault.address, params);

      // Decode result (wethReceived)
      const wethReceived = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], result)[0];
      expect(wethReceived).to.be.gte(MIN_WETH_OUT);

      // Verify user received WETH
      const userWETHAfter = await mockWETH.balanceOf(user.address);
      expect(userWETHAfter - userWETHBefore).to.equal(wethReceived);
    });

    it("Should emit ActionExecuted event on success", async function () {
      const params = buildParams({});

      await mockUSDC.connect(vault).approve(await adapter.getAddress(), USDC_AMOUNT);

      await expect(adapter.execute(vault.address, params))
        .to.emit(adapter, "ActionExecuted")
        .withArgs(
          vault.address,
          await mockRouter.getAddress(),
          true,
          ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [ethers.parseEther("0.333333333333333333")])
        );
    });
  });

  describe("execute - Failure Paths", function () {
    it("Should fail when price is too high", async function () {
      // Update price above limit
      await mockPriceFeed.updatePrice(3500e8);

      const params = buildParams({
        maxPriceUSD: PRICE_LIMIT,
      });

      await mockUSDC.connect(vault).approve(await adapter.getAddress(), USDC_AMOUNT);

      const [success, result] = await adapter.execute.staticCall(vault.address, params);

      expect(success).to.be.false;
      const reason = ethers.toUtf8String(result).replace(/\0/g, "");
      expect(reason).to.equal("ETH price too high");
    });

    it("Should fail when router is invalid", async function () {
      const params = buildParams({
        router: user.address, // Invalid router
      });

      await mockUSDC.connect(vault).approve(await adapter.getAddress(), USDC_AMOUNT);

      await expect(
        adapter.execute(vault.address, params)
      ).to.be.revertedWithCustomError(adapter, "ExecutionFailed");
    });

    it("Should fail when tokenIn is not USDC", async function () {
      const params = buildParams({
        tokenIn: await mockWETH.getAddress(), // Wrong token
      });

      await mockUSDC.connect(vault).approve(await adapter.getAddress(), USDC_AMOUNT);

      await expect(
        adapter.execute(vault.address, params)
      ).to.be.revertedWithCustomError(adapter, "ExecutionFailed");
    });

    it("Should fail when tokenOut is not WETH", async function () {
      const params = buildParams({
        tokenOut: await mockUSDC.getAddress(), // Wrong token
      });

      await mockUSDC.connect(vault).approve(await adapter.getAddress(), USDC_AMOUNT);

      await expect(
        adapter.execute(vault.address, params)
      ).to.be.revertedWithCustomError(adapter, "ExecutionFailed");
    });

    it("Should fail when amountIn is zero", async function () {
      const params = buildParams({
        amountIn: 0n,
      });

      await expect(
        adapter.execute(vault.address, params)
      ).to.be.revertedWithCustomError(adapter, "ExecutionFailed");
    });

    it("Should fail when minAmountOut is zero", async function () {
      const params = buildParams({
        minAmountOut: 0n,
      });

      await expect(
        adapter.execute(vault.address, params)
      ).to.be.revertedWithCustomError(adapter, "ExecutionFailed");
    });

    it("Should fail when recipient is zero address", async function () {
      const params = buildParams({
        recipient: ethers.ZeroAddress,
      });

      await expect(
        adapter.execute(vault.address, params)
      ).to.be.revertedWithCustomError(adapter, "ExecutionFailed");
    });

    it("Should fail when maxPriceUSD is zero", async function () {
      const params = buildParams({
        maxPriceUSD: 0n,
      });

      await expect(
        adapter.execute(vault.address, params)
      ).to.be.revertedWithCustomError(adapter, "ExecutionFailed");
    });

    it("Should fail when maxPriceUSD is out of bounds (too low)", async function () {
      const params = buildParams({
        maxPriceUSD: 50e8, // $50, below MIN_REASONABLE_PRICE
      });

      await expect(
        adapter.execute(vault.address, params)
      ).to.be.revertedWithCustomError(adapter, "ExecutionFailed");
    });

    it("Should fail when maxPriceUSD is out of bounds (too high)", async function () {
      const params = buildParams({
        maxPriceUSD: 150000e8, // $150k, above MAX_REASONABLE_PRICE
      });

      await expect(
        adapter.execute(vault.address, params)
      ).to.be.revertedWithCustomError(adapter, "ExecutionFailed");
    });
  });

  describe("Integration Tests", function () {
    it("Should handle multiple sequential swaps", async function () {
      await mockUSDC.connect(vault).approve(await adapter.getAddress(), USDC_AMOUNT * 3n);

      // Execute 3 swaps
      for (let i = 0; i < 3; i++) {
        const params = buildParams({});
        const [success] = await adapter.execute.staticCall(vault.address, params);
        expect(success).to.be.true;

        // Actually execute
        await adapter.connect(vault).execute(vault.address, params);
      }

      // Verify user received WETH from all 3 swaps
      const userWETH = await mockWETH.balanceOf(user.address);
      expect(userWETH).to.be.gte(MIN_WETH_OUT * 3n);
    });

    it("Should handle price changes between canExecute and execute", async function () {
      const params = buildParams({
        maxPriceUSD: PRICE_LIMIT,
      });

      // Check conditions are met
      const [canExecuteBefore] = await adapter.canExecute(params);
      expect(canExecuteBefore).to.be.true;

      // Price increases above limit
      await mockPriceFeed.updatePrice(3500e8);

      // Execute should now fail
      await mockUSDC.connect(vault).approve(await adapter.getAddress(), USDC_AMOUNT);
      const [success, result] = await adapter.execute.staticCall(vault.address, params);

      expect(success).to.be.false;
      const reason = ethers.toUtf8String(result).replace(/\0/g, "");
      expect(reason).to.equal("ETH price too high");
    });
  });

  // ============ Helper Functions ============

  /**
   * Build encoded BuyLimitParams with sensible defaults
   */
  function buildParams(overrides: any = {}): string {
    const defaults = {
      router: mockRouter.target,
      tokenIn: mockUSDC.target,
      tokenOut: mockWETH.target,
      amountIn: USDC_AMOUNT,
      minAmountOut: MIN_WETH_OUT,
      recipient: user.address,
      maxPriceUSD: PRICE_LIMIT,
    };

    const params = { ...defaults, ...overrides };

    return ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "address", "uint256", "uint256", "address", "uint256"],
      [
        params.router,
        params.tokenIn,
        params.tokenOut,
        params.amountIn,
        params.minAmountOut,
        params.recipient,
        params.maxPriceUSD,
      ]
    );
  }
});
