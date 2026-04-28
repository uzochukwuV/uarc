import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture, time } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import {
    RecurringTransferAdapter,
    MockERC20,
} from '../typechain-types';

describe('RecurringTransferAdapter', function () {
    // Funding modes (must match contract enum)
    const FundingMode = {
        VAULT: 0,
        PULL: 1,
    };

    async function deployFixture() {
        const [owner, user, recipient, vault] = await ethers.getSigners();

        // Deploy mock token
        const MockERC20 = await ethers.getContractFactory('MockERC20');
        const token = await MockERC20.deploy('Mock USDC', 'mUSDC', 6);

        // Deploy adapter
        const Adapter = await ethers.getContractFactory('RecurringTransferAdapter');
        const adapter = await Adapter.deploy();

        // Mint tokens to user and vault
        await token.mint(user.address, ethers.parseUnits('10000', 6));
        await token.mint(vault.address, ethers.parseUnits('10000', 6));

        return { adapter, token, owner, user, recipient, vault };
    }

    function encodeParams(params: {
        token: string;
        recipient: string;
        amountPerExecution: bigint;
        startTime: number;
        interval: number;
        maxExecutions: number;
        fundingMode: number;
        fundingSource: string;
    }): string {
        return ethers.AbiCoder.defaultAbiCoder().encode(
            [
                'tuple(address token, address recipient, uint256 amountPerExecution, uint256 startTime, uint256 interval, uint256 maxExecutions, uint8 fundingMode, address fundingSource)',
            ],
            [params]
        );
    }

    describe('VAULT Funding Mode', function () {
        it('should execute transfer from vault', async function () {
            const { adapter, token, user, recipient, vault } = await loadFixture(deployFixture);

            const now = await time.latest();
            const params = encodeParams({
                token: await token.getAddress(),
                recipient: recipient.address,
                amountPerExecution: ethers.parseUnits('50', 6),
                startTime: now,
                interval: 604800, // 1 week
                maxExecutions: 10,
                fundingMode: FundingMode.VAULT,
                fundingSource: ethers.ZeroAddress,
            });

            // Vault approves adapter
            await token.connect(vault).approve(await adapter.getAddress(), ethers.MaxUint256);

            // Check can execute
            const [canExec, reason] = await adapter.canExecute(params);
            expect(canExec).to.be.true;
            expect(reason).to.equal('Ready to execute');

            // Execute
            const recipientBalBefore = await token.balanceOf(recipient.address);
            const tx = await adapter.execute(vault.address, params);
            const recipientBalAfter = await token.balanceOf(recipient.address);

            expect(recipientBalAfter - recipientBalBefore).to.equal(ethers.parseUnits('50', 6));
        });

        it('should enforce interval between executions', async function () {
            const { adapter, token, recipient, vault } = await loadFixture(deployFixture);

            const now = await time.latest();
            const params = encodeParams({
                token: await token.getAddress(),
                recipient: recipient.address,
                amountPerExecution: ethers.parseUnits('50', 6),
                startTime: now,
                interval: 604800, // 1 week
                maxExecutions: 10,
                fundingMode: FundingMode.VAULT,
                fundingSource: ethers.ZeroAddress,
            });

            await token.connect(vault).approve(await adapter.getAddress(), ethers.MaxUint256);

            // First execution
            await adapter.execute(vault.address, params);

            // Should not be able to execute immediately again
            const [canExec, reason] = await adapter.canExecute(params);
            expect(canExec).to.be.false;
            expect(reason).to.include('Too early');

            // Advance time by 1 week
            await time.increase(604800);

            // Now should work
            const [canExec2] = await adapter.canExecute(params);
            expect(canExec2).to.be.true;
        });

        it('should enforce max executions', async function () {
            const { adapter, token, recipient, vault } = await loadFixture(deployFixture);

            const now = await time.latest();
            const params = encodeParams({
                token: await token.getAddress(),
                recipient: recipient.address,
                amountPerExecution: ethers.parseUnits('50', 6),
                startTime: now,
                interval: 60, // 1 minute for faster testing
                maxExecutions: 3,
                fundingMode: FundingMode.VAULT,
                fundingSource: ethers.ZeroAddress,
            });

            await token.connect(vault).approve(await adapter.getAddress(), ethers.MaxUint256);

            // Execute 3 times
            await adapter.execute(vault.address, params);
            await time.increase(60);
            await adapter.execute(vault.address, params);
            await time.increase(60);
            await adapter.execute(vault.address, params);

            // 4th should fail
            await time.increase(60);
            const [canExec, reason] = await adapter.canExecute(params);
            expect(canExec).to.be.false;
            expect(reason).to.equal('Max executions reached');
        });
    });

    describe('PULL Funding Mode', function () {
        it('should execute transfer by pulling from user wallet', async function () {
            const { adapter, token, user, recipient, vault } = await loadFixture(deployFixture);

            const now = await time.latest();
            const params = encodeParams({
                token: await token.getAddress(),
                recipient: recipient.address,
                amountPerExecution: ethers.parseUnits('50', 6),
                startTime: now,
                interval: 604800,
                maxExecutions: 10,
                fundingMode: FundingMode.PULL,
                fundingSource: user.address, // Pull from user's wallet
            });

            // User approves adapter to pull
            await token.connect(user).approve(await adapter.getAddress(), ethers.MaxUint256);

            // Check can execute
            const [canExec, reason] = await adapter.canExecute(params);
            expect(canExec).to.be.true;

            // Execute (vault param is ignored in PULL mode)
            const userBalBefore = await token.balanceOf(user.address);
            const recipientBalBefore = await token.balanceOf(recipient.address);

            await adapter.execute(vault.address, params);

            const userBalAfter = await token.balanceOf(user.address);
            const recipientBalAfter = await token.balanceOf(recipient.address);

            // User balance decreased
            expect(userBalBefore - userBalAfter).to.equal(ethers.parseUnits('50', 6));
            // Recipient balance increased
            expect(recipientBalAfter - recipientBalBefore).to.equal(ethers.parseUnits('50', 6));
        });

        it('should fail if user has not approved adapter', async function () {
            const { adapter, token, user, recipient, vault } = await loadFixture(deployFixture);

            const now = await time.latest();
            const params = encodeParams({
                token: await token.getAddress(),
                recipient: recipient.address,
                amountPerExecution: ethers.parseUnits('50', 6),
                startTime: now,
                interval: 604800,
                maxExecutions: 10,
                fundingMode: FundingMode.PULL,
                fundingSource: user.address,
            });

            // NO approval given

            const [canExec, reason] = await adapter.canExecute(params);
            expect(canExec).to.be.false;
            expect(reason).to.equal('Insufficient allowance - user must approve adapter');
        });

        it('should fail if user has insufficient balance', async function () {
            const { adapter, token, user, recipient, vault } = await loadFixture(deployFixture);

            // Drain user's balance
            const balance = await token.balanceOf(user.address);
            await token.connect(user).transfer(vault.address, balance);

            const now = await time.latest();
            const params = encodeParams({
                token: await token.getAddress(),
                recipient: recipient.address,
                amountPerExecution: ethers.parseUnits('50', 6),
                startTime: now,
                interval: 604800,
                maxExecutions: 10,
                fundingMode: FundingMode.PULL,
                fundingSource: user.address,
            });

            await token.connect(user).approve(await adapter.getAddress(), ethers.MaxUint256);

            const [canExec, reason] = await adapter.canExecute(params);
            expect(canExec).to.be.false;
            expect(reason).to.equal('Insufficient balance in funding source');
        });
    });

    describe('View Helpers', function () {
        it('should return correct execution state', async function () {
            const { adapter, token, recipient, vault } = await loadFixture(deployFixture);

            const now = await time.latest();
            const params = encodeParams({
                token: await token.getAddress(),
                recipient: recipient.address,
                amountPerExecution: ethers.parseUnits('50', 6),
                startTime: now,
                interval: 604800,
                maxExecutions: 5,
                fundingMode: FundingMode.VAULT,
                fundingSource: ethers.ZeroAddress,
            });

            await token.connect(vault).approve(await adapter.getAddress(), ethers.MaxUint256);

            // Before any execution
            let state = await adapter.getExecutionState(params);
            expect(state.executionsCompleted).to.equal(0);
            expect(state.nextExecution).to.equal(now);
            expect(state.isComplete).to.be.false;

            // After first execution
            await adapter.execute(vault.address, params);
            state = await adapter.getExecutionState(params);
            expect(state.executionsCompleted).to.equal(1);
            expect(state.isComplete).to.be.false;
        });

        it('should calculate total funding correctly', async function () {
            const { adapter, token, recipient } = await loadFixture(deployFixture);

            const now = await time.latest();
            const params = encodeParams({
                token: await token.getAddress(),
                recipient: recipient.address,
                amountPerExecution: ethers.parseUnits('50', 6),
                startTime: now,
                interval: 604800,
                maxExecutions: 10,
                fundingMode: FundingMode.VAULT,
                fundingSource: ethers.ZeroAddress,
            });

            const { totalAmount, perExecution, executions } = await adapter.calculateTotalFunding(params);
            expect(totalAmount).to.equal(ethers.parseUnits('500', 6)); // 50 * 10
            expect(perExecution).to.equal(ethers.parseUnits('50', 6));
            expect(executions).to.equal(10);
        });
    });

    describe('Parameter Validation', function () {
        it('should reject zero token address', async function () {
            const { adapter, recipient } = await loadFixture(deployFixture);

            const now = await time.latest();
            const params = encodeParams({
                token: ethers.ZeroAddress,
                recipient: recipient.address,
                amountPerExecution: ethers.parseUnits('50', 6),
                startTime: now,
                interval: 604800,
                maxExecutions: 10,
                fundingMode: FundingMode.VAULT,
                fundingSource: ethers.ZeroAddress,
            });

            const [isValid, error] = await adapter.validateParams(params);
            expect(isValid).to.be.false;
            expect(error).to.equal('Invalid token address');
        });

        it('should reject PULL mode without funding source', async function () {
            const { adapter, token, recipient } = await loadFixture(deployFixture);

            const now = await time.latest();
            const params = encodeParams({
                token: await token.getAddress(),
                recipient: recipient.address,
                amountPerExecution: ethers.parseUnits('50', 6),
                startTime: now,
                interval: 604800,
                maxExecutions: 10,
                fundingMode: FundingMode.PULL,
                fundingSource: ethers.ZeroAddress, // Invalid for PULL mode
            });

            const [isValid, error] = await adapter.validateParams(params);
            expect(isValid).to.be.false;
            expect(error).to.equal('Pull mode requires valid funding source address');
        });
    });
});
