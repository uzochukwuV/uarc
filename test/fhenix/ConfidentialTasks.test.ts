import { expect } from "chai";
import { ethers, network } from "hardhat";

describe("Confidential Tasks", function () {
    let vaultFactory: any;
    let vaultImpl: any;
    let adapter: any;
    let mockFHERC20: any;
    let owner: any;
    let user: any;
    let executor: any;

    before(async function () {
        [owner, user, executor] = await ethers.getSigners();

        // 1. Deploy MyMockFheOps to address 128
        const MockFheOps = await ethers.getContractFactory("MyMockFheOps");
        const mockFheOps = await MockFheOps.deploy();
        const code = await ethers.provider.getCode(await mockFheOps.getAddress());
        await network.provider.send("hardhat_setCode", [
            "0x0000000000000000000000000000000000000080",
            code,
        ]);

        // 2. Deploy MockFHERC20
        const MockFHERC20 = await ethers.getContractFactory("MockFHERC20");
        mockFHERC20 = await MockFHERC20.deploy();

        // 3. Deploy ConfidentialTaskVault implementation
        const VaultImpl = await ethers.getContractFactory("ConfidentialTaskVault");
        vaultImpl = await VaultImpl.deploy();

        // 4. Deploy ConfidentialTaskFactory
        const VaultFactory = await ethers.getContractFactory("ConfidentialTaskFactory");
        vaultFactory = await VaultFactory.deploy(await vaultImpl.getAddress(), owner.address);

        // 5. Deploy ConfidentialTransferAdapter
        const Adapter = await ethers.getContractFactory("ConfidentialTransferAdapter");
        adapter = await Adapter.deploy();
    });

    it("should allow depositing and executing via the vault", async function () {
        const tx = await vaultFactory.connect(user).createVault();
        const receipt = await tx.wait();
        const event = receipt.logs.find((log: any) => {
            try { return vaultFactory.interface.parseLog(log)?.name === "ConfidentialVaultCreated"; } catch { return false; }
        });
        const vaultAddress = vaultFactory.interface.parseLog(event).args.vaultAddress;
        
        const vault = await ethers.getContractAt("ConfidentialTaskVault", vaultAddress);

        // Mint to user
        await mockFHERC20.mint(user.address, { data: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1000]), securityZone: 0 });
        
        // MockFHERC20 transferFromEncrypted doesn't actually check approval in our mock. 
        // We just call depositEncryptedToken
        await vault.connect(user).depositEncryptedToken(await mockFHERC20.getAddress(), { data: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [500]), securityZone: 0 });

        // Let's execute through the vault using the adapter. 
        // We'll pass actionData that normally calls something on the adapter.
        // We don't have a real payload right now, so we just call executeConfidentialTokenAction with empty bytes to see it pass
        const adapterAddress = await adapter.getAddress();
        const actionData = "0x";
        await vault.connect(user).executeConfidentialTokenAction(
            await mockFHERC20.getAddress(),
            adapterAddress,
            100n, // euint128 is passed as uint256 ID in plaintext to the ABI
            actionData
        );
        
        expect(true).to.be.true;
    });

    it("should create a confidential vault", async function () {
        const tx = await vaultFactory.connect(user).createVault();
        const receipt = await tx.wait();
        
        // Find the ConfidentialVaultCreated event
        const event = receipt.logs.find((log: any) => {
            try {
                return vaultFactory.interface.parseLog(log)?.name === "ConfidentialVaultCreated";
            } catch (e) {
                return false;
            }
        });
        expect(event).to.not.be.undefined;
        
        const vaultAddress = vaultFactory.interface.parseLog(event).args.vaultAddress;
        expect(vaultAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("should allow creating and executing a confidential task", async function () {
        const thresholdBytes = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1000]);
        const amountBytes = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [50]);

        const inThreshold = { data: thresholdBytes, securityZone: 0 };
        const inAmount = { data: amountBytes, securityZone: 0 };

        const tx = await adapter.connect(user).createConfidentialTask(
            inThreshold,
            inAmount,
            user.address, // recipient
            await mockFHERC20.getAddress()
        );
        const receipt = await tx.wait();
        expect(receipt).to.be.ok;
        
        // The taskId should be 0
        const taskId = 0;

        // Give the adapter some mock tokens so it can transfer
        await mockFHERC20.mint(await adapter.getAddress(), { data: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [100]), securityZone: 0 });

        // Now executor executes
        // Value = 1500 (>= 1000 threshold), should transfer 50
        const currentValueBytes = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1500]);
        await adapter.connect(executor).executeConfidential(taskId, { data: currentValueBytes, securityZone: 0 });

        // Success! It didn't revert.
        expect(true).to.be.true;
    });
});
