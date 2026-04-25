import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract } from 'ethers';

describe('CurveSwapAdapter Integration Test', function () {
  let curveAdapter: any;
  let mockCurvePool: any;
  let tokenIn: any;
  let tokenOut: any;
  let owner: any;
  let recipient: any;
  let executor: any;
  
  beforeEach(async function () {
    [owner, recipient, executor] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    tokenIn = await MockERC20.deploy('Token In', 'TKIN', 6);
    tokenOut = await MockERC20.deploy('Token Out', 'TKOUT', 6);

    // Deploy mock Curve pool
    const MockCurvePool = await ethers.getContractFactory('MockCurvePool');
    mockCurvePool = await MockCurvePool.deploy(await tokenIn.getAddress(), await tokenOut.getAddress());

    // Fund the mock curve pool with tokenOut so it can fulfill swaps
    await tokenOut.mint(await mockCurvePool.getAddress(), ethers.parseUnits('10000', 6));

    // Deploy the Curve adapter
    const CurveAdapter = await ethers.getContractFactory('CurveSwapAdapter');
    curveAdapter = await CurveAdapter.deploy();

    // Fund the owner with tokenIn
    await tokenIn.mint(owner.address, ethers.parseUnits('1000', 6));
  });

  it('Should correctly execute a swap via Curve pool', async function () {
    const amountIn = ethers.parseUnits('100', 6);
    const minAmountOut = ethers.parseUnits('90', 6); // 10% slippage tolerance

    // Owner (acting as TaskVault here) approves adapter to spend its tokens
    await tokenIn.approve(await curveAdapter.getAddress(), amountIn);

    // Encode parameters for the adapter
    const params = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'address', 'int128', 'int128', 'uint256', 'uint256', 'address'],
      [
        await mockCurvePool.getAddress(),
        await tokenIn.getAddress(),
        await tokenOut.getAddress(),
        0, // i (Token In index)
        1, // j (Token Out index)
        amountIn,
        minAmountOut,
        recipient.address
      ]
    );

    // Execute swap
    await expect(
      curveAdapter.execute(owner.address, params)
    ).to.emit(curveAdapter, 'ActionExecuted')
      .withArgs(owner.address, await mockCurvePool.getAddress(), true, ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [amountIn]))
      .and.to.emit(tokenOut, 'Transfer')
      .withArgs(await mockCurvePool.getAddress(), await curveAdapter.getAddress(), amountIn) // Mock pool transfers to adapter
      .and.to.emit(tokenOut, 'Transfer')
      .withArgs(await curveAdapter.getAddress(), recipient.address, amountIn); // Adapter transfers to recipient

    // Verify balances
    const recipientBalance = await tokenOut.balanceOf(recipient.address);
    expect(recipientBalance).to.equal(amountIn); // 1:1 ratio in mock pool
  });
});