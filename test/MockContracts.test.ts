import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * @title Mock Contracts Verification Test
 * @notice Verifies that all mock contracts work correctly
 */
describe("Mock Contracts Setup", function () {
  let owner: SignerWithAddress;
  let user: SignerWithAddress;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();
  });

  describe("MockERC20", function () {
    it("Should deploy and mint tokens correctly", async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
      await usdc.waitForDeployment();

      // Check metadata
      expect(await usdc.name()).to.equal("USD Coin");
      expect(await usdc.symbol()).to.equal("USDC");
      expect(await usdc.decimals()).to.equal(6);

      // Mint tokens
      await usdc.mint(user.address, ethers.parseUnits("1000", 6));

      // Check balance
      expect(await usdc.balanceOf(user.address)).to.equal(ethers.parseUnits("1000", 6));

      console.log("✅ MockERC20 works correctly");
    });

    it("Should support different decimals", async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");

      const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
      await weth.waitForDeployment();

      expect(await weth.decimals()).to.equal(18);

      await weth.mint(user.address, ethers.parseEther("10"));
      expect(await weth.balanceOf(user.address)).to.equal(ethers.parseEther("10"));

      console.log("✅ MockERC20 supports 18 decimals");
    });

    it("Should allow burning tokens", async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("Test", "TEST", 18);
      await token.waitForDeployment();

      await token.mint(user.address, ethers.parseEther("100"));
      await token.burn(user.address, ethers.parseEther("30"));

      expect(await token.balanceOf(user.address)).to.equal(ethers.parseEther("70"));

      console.log("✅ MockERC20 can burn tokens");
    });
  });

  describe("MockUniswapV2Router", function () {
    it("Should deploy and provide exchange rates", async function () {
      const MockUniswap = await ethers.getContractFactory("MockUniswapV2Router");
      const router = await MockUniswap.deploy();
      await router.waitForDeployment();

      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const usdc = await MockERC20.deploy("USDC", "USDC", 6);
      const weth = await MockERC20.deploy("WETH", "WETH", 18);

      // Check exchange rate calculation
      const amountIn = ethers.parseUnits("1000", 6); // 1000 USDC
      const path = [await usdc.getAddress(), await weth.getAddress()];

      const amounts = await router.getAmountsOut(amountIn, path);

      console.log(`  Input: ${ethers.formatUnits(amounts[0], 6)} USDC`);
      console.log(`  Output: ${ethers.formatEther(amounts[1])} WETH`);

      expect(amounts[0]).to.equal(amountIn);
      expect(amounts[1]).to.be.gt(0);

      console.log("✅ MockUniswapV2Router provides exchange rates");
    });

    it("Should execute token swaps", async function () {
      const MockUniswap = await ethers.getContractFactory("MockUniswapV2Router");
      const router = await MockUniswap.deploy();
      await router.waitForDeployment();

      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const usdc = await MockERC20.deploy("USDC", "USDC", 6);
      const weth = await MockERC20.deploy("WETH", "WETH", 18);

      // Mint tokens to user and router
      await usdc.mint(user.address, ethers.parseUnits("1000", 6));
      await weth.mint(await router.getAddress(), ethers.parseEther("10"));

      // Approve router
      await usdc.connect(user).approve(await router.getAddress(), ethers.parseUnits("1000", 6));

      // Execute swap
      const path = [await usdc.getAddress(), await weth.getAddress()];
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      const balanceBefore = await weth.balanceOf(user.address);

      await router.connect(user).swapExactTokensForTokens(
        ethers.parseUnits("1000", 6),
        0, // minAmountOut
        path,
        user.address,
        deadline
      );

      const balanceAfter = await weth.balanceOf(user.address);
      const received = balanceAfter - balanceBefore;

      console.log(`  User received: ${ethers.formatEther(received)} WETH`);
      expect(received).to.be.gt(0);

      console.log("✅ MockUniswapV2Router executes swaps");
    });

    it("Should enforce minimum output amount", async function () {
      const MockUniswap = await ethers.getContractFactory("MockUniswapV2Router");
      const router = await MockUniswap.deploy();

      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const usdc = await MockERC20.deploy("USDC", "USDC", 6);
      const weth = await MockERC20.deploy("WETH", "WETH", 18);

      await usdc.mint(user.address, ethers.parseUnits("1000", 6));
      await weth.mint(await router.getAddress(), ethers.parseEther("10"));
      await usdc.connect(user).approve(await router.getAddress(), ethers.parseUnits("1000", 6));

      const path = [await usdc.getAddress(), await weth.getAddress()];
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      // Try to swap with unrealistic minimum output
      await expect(
        router.connect(user).swapExactTokensForTokens(
          ethers.parseUnits("1000", 6),
          ethers.parseEther("100"), // Unrealistically high min output
          path,
          user.address,
          deadline
        )
      ).to.be.revertedWith("Insufficient output amount");

      console.log("✅ MockUniswapV2Router enforces slippage protection");
    });
  });

  describe("MockChainlinkAggregator", function () {
    it("Should deploy with correct metadata", async function () {
      const MockChainlink = await ethers.getContractFactory("MockChainlinkAggregator");
      const priceFeed = await MockChainlink.deploy(8, "ETH/USD");
      await priceFeed.waitForDeployment();

      expect(await priceFeed.decimals()).to.equal(8);
      expect(await priceFeed.description()).to.equal("ETH/USD");

      console.log("✅ MockChainlinkAggregator has correct metadata");
    });

    it("Should return latest round data", async function () {
      const MockChainlink = await ethers.getContractFactory("MockChainlinkAggregator");
      const priceFeed = await MockChainlink.deploy(8, "ETH/USD");
      await priceFeed.waitForDeployment();

      // Update price to $3000
      await priceFeed.updateAnswer(300000000000); // $3000 with 8 decimals

      const roundData = await priceFeed.latestRoundData();

      console.log(`  Round ID: ${roundData[0]}`);
      console.log(`  Price: $${ethers.formatUnits(roundData[1], 8)}`);
      console.log(`  Updated at: ${roundData[3]}`);

      expect(roundData[1]).to.equal(300000000000);
      expect(roundData[0]).to.be.gt(0); // Round ID increments

      console.log("✅ MockChainlinkAggregator returns price data");
    });

    it("Should update price and increment round", async function () {
      const MockChainlink = await ethers.getContractFactory("MockChainlinkAggregator");
      const priceFeed = await MockChainlink.deploy(8, "ETH/USD");
      await priceFeed.waitForDeployment();

      // First update
      await priceFeed.updateAnswer(300000000000); // $3000
      const round1 = await priceFeed.latestRoundData();

      // Second update
      await priceFeed.updateAnswer(310000000000); // $3100
      const round2 = await priceFeed.latestRoundData();

      expect(round2[0]).to.equal(round1[0] + 1n); // Round incremented
      expect(round2[1]).to.equal(310000000000); // Price updated

      console.log(`  Price updated: $${ethers.formatUnits(round1[1], 8)} → $${ethers.formatUnits(round2[1], 8)}`);
      console.log(`  Round incremented: ${round1[0]} → ${round2[0]}`);

      console.log("✅ MockChainlinkAggregator updates correctly");
    });

    it("Should allow manual timestamp setting", async function () {
      const MockChainlink = await ethers.getContractFactory("MockChainlinkAggregator");
      const priceFeed = await MockChainlink.deploy(8, "ETH/USD");
      await priceFeed.waitForDeployment();

      const customTimestamp = 1700000000;
      await priceFeed.setUpdatedAt(customTimestamp);

      const roundData = await priceFeed.latestRoundData();
      expect(roundData[3]).to.equal(customTimestamp);

      console.log("✅ MockChainlinkAggregator allows timestamp control (for staleness testing)");
    });
  });

  describe("Integration - All Mocks Together", function () {
    it("Should work together in a swap scenario", async function () {
      console.log("\n🔗 Testing all mocks integrated:");

      // Deploy all mocks
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const usdc = await MockERC20.deploy("USDC", "USDC", 6);
      const weth = await MockERC20.deploy("WETH", "WETH", 18);

      const MockUniswap = await ethers.getContractFactory("MockUniswapV2Router");
      const router = await MockUniswap.deploy();

      const MockChainlink = await ethers.getContractFactory("MockChainlinkAggregator");
      const ethPriceFeed = await MockChainlink.deploy(8, "ETH/USD");

      // Setup
      await usdc.mint(user.address, ethers.parseUnits("1000", 6));
      await weth.mint(await router.getAddress(), ethers.parseEther("10"));
      await ethPriceFeed.updateAnswer(300000000000); // $3000

      console.log(`  ✓ USDC minted: ${ethers.formatUnits(await usdc.balanceOf(user.address), 6)}`);
      console.log(`  ✓ ETH price: $${ethers.formatUnits((await ethPriceFeed.latestRoundData())[1], 8)}`);

      // Approve and swap
      await usdc.connect(user).approve(await router.getAddress(), ethers.parseUnits("1000", 6));

      const path = [await usdc.getAddress(), await weth.getAddress()];
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 300;

      await router.connect(user).swapExactTokensForTokens(
        ethers.parseUnits("1000", 6),
        0,
        path,
        user.address,
        deadline
      );

      const wethReceived = await weth.balanceOf(user.address);
      console.log(`  ✓ WETH received: ${ethers.formatEther(wethReceived)}`);

      expect(wethReceived).to.be.gt(0);

      console.log("\n✅ All mocks work together correctly!");
    });
  });
});
