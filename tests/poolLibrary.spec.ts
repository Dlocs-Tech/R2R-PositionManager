/* eslint @typescript-eslint/no-var-requires: "off" */
import {expect} from "chai";
import {ethers, ignition} from "hardhat";
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {PoolLibrary} from "../typechain-types";
import PoolLibraryModule from "../ignition/modules/PoolLibrary";

export default async function suite(): Promise<void> {
    describe("PoolLibrary", () => {
        let owner: SignerWithAddress;
        let user1: SignerWithAddress;
        let user2: SignerWithAddress;

        let poolLibrary: PoolLibrary;

        let snap: string;

        // Mock addresses for testing
        const mockMainPool = "0x1111111111111111111111111111111111111111";
        const mockToken0Pool = "0x2222222222222222222222222222222222222222";
        const mockToken1Pool = "0x3333333333333333333333333333333333333333";
        const mockChainlinkDataFeed = "0x4444444444444444444444444444444444444444";
        const mockTimeInterval = 1200; // 20 minutes

        const mockMainPool2 = "0x5555555555555555555555555555555555555555";
        const mockToken0Pool2 = "0x6666666666666666666666666666666666666666";
        const mockToken1Pool2 = "0x7777777777777777777777777777777777777777";
        const mockChainlinkDataFeed2 = "0x8888888888888888888888888888888888888888";
        const mockTimeInterval2 = 600; // 10 minutes

        before(async () => {
            [owner, user1, user2] = await ethers.getSigners();

            const {proxy: poolLibraryProxy} = await ignition.deploy(PoolLibraryModule);

            poolLibrary = await ethers.getContractAt("PoolLibrary", await poolLibraryProxy.getAddress());
        });

        beforeEach(async function () {
            snap = await ethers.provider.send("evm_snapshot", []);
        });

        afterEach(async function () {
            await ethers.provider.send("evm_revert", [snap]);
        });

        it("Should poolsCount be zero initially", async () => {
            expect(await poolLibrary.poolsCount()).to.equal(0);
        });

        it("Should revert when getting pool data for invalid pool ID", async () => {
            await expect(poolLibrary.getPoolData(0)).to.be.revertedWithCustomError(poolLibrary, "InvalidPoolId");
        });

        it("Should revert when non-owner tries to add pool", async () => {
            const poolData = {
                mainPool: mockMainPool,
                token0Pool: mockToken0Pool,
                token1Pool: mockToken1Pool,
                chainlinkDataFeed: mockChainlinkDataFeed,
                chainlinkTimeInterval: mockTimeInterval,
            };

            await expect(poolLibrary.connect(user1).addPool(poolData)).to.be.revertedWithCustomError(poolLibrary, "OwnableUnauthorizedAccount");
        });

        it("Should allow owner to add a pool", async () => {
            const poolData = {
                mainPool: mockMainPool,
                token0Pool: mockToken0Pool,
                token1Pool: mockToken1Pool,
                chainlinkDataFeed: mockChainlinkDataFeed,
                chainlinkTimeInterval: mockTimeInterval,
            };

            await expect(poolLibrary.addPool(poolData)).to.emit(poolLibrary, "PoolAdded").withArgs(0, mockMainPool);

            const poolsCount = await poolLibrary.poolsCount();
            expect(poolsCount).to.equal(1);

            const retrievedPoolData = await poolLibrary.getPoolData(0);
            expect(retrievedPoolData.mainPool).to.equal(mockMainPool);
            expect(retrievedPoolData.token0Pool).to.equal(mockToken0Pool);
            expect(retrievedPoolData.token1Pool).to.equal(mockToken1Pool);
            expect(retrievedPoolData.chainlinkDataFeed).to.equal(mockChainlinkDataFeed);
            expect(retrievedPoolData.chainlinkTimeInterval).to.equal(mockTimeInterval);
        });

        it("Should add multiple pools and increment poolsCount correctly", async () => {
            const poolData1 = {
                mainPool: mockMainPool,
                token0Pool: mockToken0Pool,
                token1Pool: mockToken1Pool,
                chainlinkDataFeed: mockChainlinkDataFeed,
                chainlinkTimeInterval: mockTimeInterval,
            };

            const poolData2 = {
                mainPool: mockMainPool2,
                token0Pool: mockToken0Pool2,
                token1Pool: mockToken1Pool2,
                chainlinkDataFeed: mockChainlinkDataFeed2,
                chainlinkTimeInterval: mockTimeInterval2,
            };

            await expect(poolLibrary.addPool(poolData1)).to.emit(poolLibrary, "PoolAdded").withArgs(0, mockMainPool);

            await expect(poolLibrary.addPool(poolData2)).to.emit(poolLibrary, "PoolAdded").withArgs(1, mockMainPool2);

            const poolsCount = await poolLibrary.poolsCount();
            expect(poolsCount).to.equal(2);

            const retrievedPoolData1 = await poolLibrary.getPoolData(0);
            expect(retrievedPoolData1.mainPool).to.equal(mockMainPool);

            const retrievedPoolData2 = await poolLibrary.getPoolData(1);
            expect(retrievedPoolData2.mainPool).to.equal(mockMainPool2);
        });

        it("Should revert when non-owner tries to update pool", async () => {
            const poolData = {
                mainPool: mockMainPool,
                token0Pool: mockToken0Pool,
                token1Pool: mockToken1Pool,
                chainlinkDataFeed: mockChainlinkDataFeed,
                chainlinkTimeInterval: mockTimeInterval,
            };

            await poolLibrary.addPool(poolData);

            const updatedPoolData = {
                mainPool: mockMainPool2,
                token0Pool: mockToken0Pool2,
                token1Pool: mockToken1Pool2,
                chainlinkDataFeed: mockChainlinkDataFeed2,
                chainlinkTimeInterval: mockTimeInterval2,
            };

            await expect(poolLibrary.connect(user1).updatePool(0, updatedPoolData)).to.be.revertedWithCustomError(poolLibrary, "OwnableUnauthorizedAccount");
        });

        it("Should revert when updating pool with invalid ID", async () => {
            const poolData = {
                mainPool: mockMainPool,
                token0Pool: mockToken0Pool,
                token1Pool: mockToken1Pool,
                chainlinkDataFeed: mockChainlinkDataFeed,
                chainlinkTimeInterval: mockTimeInterval,
            };

            await expect(poolLibrary.updatePool(0, poolData)).to.be.revertedWithCustomError(poolLibrary, "InvalidPoolId");
        });

        it("Should allow owner to update an existing pool", async () => {
            const poolData = {
                mainPool: mockMainPool,
                token0Pool: mockToken0Pool,
                token1Pool: mockToken1Pool,
                chainlinkDataFeed: mockChainlinkDataFeed,
                chainlinkTimeInterval: mockTimeInterval,
            };

            await poolLibrary.addPool(poolData);

            const updatedPoolData = {
                mainPool: mockMainPool2,
                token0Pool: mockToken0Pool2,
                token1Pool: mockToken1Pool2,
                chainlinkDataFeed: mockChainlinkDataFeed2,
                chainlinkTimeInterval: mockTimeInterval2,
            };

            await expect(poolLibrary.updatePool(0, updatedPoolData)).to.emit(poolLibrary, "PoolUpdated").withArgs(0, mockMainPool2);

            const retrievedPoolData = await poolLibrary.getPoolData(0);
            expect(retrievedPoolData.mainPool).to.equal(mockMainPool2);
            expect(retrievedPoolData.token0Pool).to.equal(mockToken0Pool2);
            expect(retrievedPoolData.token1Pool).to.equal(mockToken1Pool2);
            expect(retrievedPoolData.chainlinkDataFeed).to.equal(mockChainlinkDataFeed2);
            expect(retrievedPoolData.chainlinkTimeInterval).to.equal(mockTimeInterval2);

            // poolsCount should remain the same
            const poolsCount = await poolLibrary.poolsCount();
            expect(poolsCount).to.equal(1);
        });

        it("Should update specific pool without affecting others", async () => {
            const poolData1 = {
                mainPool: mockMainPool,
                token0Pool: mockToken0Pool,
                token1Pool: mockToken1Pool,
                chainlinkDataFeed: mockChainlinkDataFeed,
                chainlinkTimeInterval: mockTimeInterval,
            };

            const poolData2 = {
                mainPool: mockMainPool2,
                token0Pool: mockToken0Pool2,
                token1Pool: mockToken1Pool2,
                chainlinkDataFeed: mockChainlinkDataFeed2,
                chainlinkTimeInterval: mockTimeInterval2,
            };

            await poolLibrary.addPool(poolData1);
            await poolLibrary.addPool(poolData2);

            const updatedPoolData = {
                mainPool: "0x9999999999999999999999999999999999999999",
                token0Pool: mockToken0Pool,
                token1Pool: mockToken1Pool,
                chainlinkDataFeed: mockChainlinkDataFeed,
                chainlinkTimeInterval: 900,
            };

            await poolLibrary.updatePool(0, updatedPoolData);

            // Check updated pool
            const retrievedPoolData1 = await poolLibrary.getPoolData(0);
            expect(retrievedPoolData1.mainPool).to.equal("0x9999999999999999999999999999999999999999");
            expect(retrievedPoolData1.chainlinkTimeInterval).to.equal(900);

            // Check that second pool remains unchanged
            const retrievedPoolData2 = await poolLibrary.getPoolData(1);
            expect(retrievedPoolData2.mainPool).to.equal(mockMainPool2);
            expect(retrievedPoolData2.token0Pool).to.equal(mockToken0Pool2);
            expect(retrievedPoolData2.token1Pool).to.equal(mockToken1Pool2);
            expect(retrievedPoolData2.chainlinkDataFeed).to.equal(mockChainlinkDataFeed2);
            expect(retrievedPoolData2.chainlinkTimeInterval).to.equal(mockTimeInterval2);
        });

        it("Should handle pool with zero address for optional pools", async () => {
            const poolData = {
                mainPool: mockMainPool,
                token0Pool: ethers.ZeroAddress,
                token1Pool: mockToken1Pool,
                chainlinkDataFeed: mockChainlinkDataFeed,
                chainlinkTimeInterval: mockTimeInterval,
            };

            await poolLibrary.addPool(poolData);

            const retrievedPoolData = await poolLibrary.getPoolData(0);
            expect(retrievedPoolData.mainPool).to.equal(mockMainPool);
            expect(retrievedPoolData.token0Pool).to.equal(ethers.ZeroAddress);
            expect(retrievedPoolData.token1Pool).to.equal(mockToken1Pool);
            expect(retrievedPoolData.chainlinkDataFeed).to.equal(mockChainlinkDataFeed);
            expect(retrievedPoolData.chainlinkTimeInterval).to.equal(mockTimeInterval);

            const poolData2 = {
                mainPool: mockMainPool,
                token0Pool: mockToken0Pool,
                token1Pool: ethers.ZeroAddress,
                chainlinkDataFeed: mockChainlinkDataFeed,
                chainlinkTimeInterval: mockTimeInterval,
            };

            await poolLibrary.addPool(poolData2);

            const retrievedPoolData2 = await poolLibrary.getPoolData(1);
            expect(retrievedPoolData2.mainPool).to.equal(mockMainPool);
            expect(retrievedPoolData2.token0Pool).to.equal(mockToken0Pool);
            expect(retrievedPoolData2.token1Pool).to.equal(ethers.ZeroAddress);
            expect(retrievedPoolData2.chainlinkDataFeed).to.equal(mockChainlinkDataFeed);
            expect(retrievedPoolData2.chainlinkTimeInterval).to.equal(mockTimeInterval);
        });

        it("Should allow updating pool multiple times", async () => {
            const poolData = {
                mainPool: mockMainPool,
                token0Pool: mockToken0Pool,
                token1Pool: mockToken1Pool,
                chainlinkDataFeed: mockChainlinkDataFeed,
                chainlinkTimeInterval: mockTimeInterval,
            };

            await poolLibrary.addPool(poolData);

            // First update
            const updatedPoolData1 = {
                mainPool: mockMainPool2,
                token0Pool: mockToken0Pool,
                token1Pool: mockToken1Pool,
                chainlinkDataFeed: mockChainlinkDataFeed,
                chainlinkTimeInterval: mockTimeInterval,
            };

            await poolLibrary.updatePool(0, updatedPoolData1);

            let retrievedPoolData = await poolLibrary.getPoolData(0);
            expect(retrievedPoolData.mainPool).to.equal(mockMainPool2);

            // Second update
            const updatedPoolData2 = {
                mainPool: mockMainPool,
                token0Pool: mockToken0Pool2,
                token1Pool: mockToken1Pool2,
                chainlinkDataFeed: mockChainlinkDataFeed2,
                chainlinkTimeInterval: mockTimeInterval2,
            };

            await poolLibrary.updatePool(0, updatedPoolData2);

            retrievedPoolData = await poolLibrary.getPoolData(0);
            expect(retrievedPoolData.mainPool).to.equal(mockMainPool);
            expect(retrievedPoolData.token0Pool).to.equal(mockToken0Pool2);
            expect(retrievedPoolData.token1Pool).to.equal(mockToken1Pool2);
            expect(retrievedPoolData.chainlinkDataFeed).to.equal(mockChainlinkDataFeed2);
            expect(retrievedPoolData.chainlinkTimeInterval).to.equal(mockTimeInterval2);

            // poolsCount should still be 1
            const poolsCount = await poolLibrary.poolsCount();
            expect(poolsCount).to.equal(1);
        });

        it("Should revert when adding pool with wrong values", async () => {
            let poolData = {
                mainPool: ethers.ZeroAddress,
                token0Pool: mockToken0Pool,
                token1Pool: mockToken1Pool,
                chainlinkDataFeed: mockChainlinkDataFeed,
                chainlinkTimeInterval: mockTimeInterval,
            };

            await expect(poolLibrary.addPool(poolData)).to.be.revertedWithCustomError(poolLibrary, "InvalidInput");

            poolData = {
                mainPool: mockMainPool,
                token0Pool: mockToken0Pool,
                token1Pool: mockToken1Pool,
                chainlinkDataFeed: ethers.ZeroAddress,
                chainlinkTimeInterval: mockTimeInterval,
            };

            await expect(poolLibrary.addPool(poolData)).to.be.revertedWithCustomError(poolLibrary, "InvalidInput");

            poolData = {
                mainPool: mockMainPool,
                token0Pool: mockToken0Pool,
                token1Pool: mockToken1Pool,
                chainlinkDataFeed: mockChainlinkDataFeed,
                chainlinkTimeInterval: 0,
            };

            await expect(poolLibrary.addPool(poolData)).to.be.revertedWithCustomError(poolLibrary, "InvalidInput");

            poolData = {
                mainPool: mockMainPool,
                token0Pool: ethers.ZeroAddress,
                token1Pool: ethers.ZeroAddress,
                chainlinkDataFeed: mockChainlinkDataFeed,
                chainlinkTimeInterval: mockTimeInterval,
            };

            await expect(poolLibrary.addPool(poolData)).to.be.revertedWithCustomError(poolLibrary, "InvalidInput");
        });

        it("Should revert when updating pool with wrong values", async () => {
            const poolData = {
                mainPool: mockMainPool,
                token0Pool: mockToken0Pool,
                token1Pool: mockToken1Pool,
                chainlinkDataFeed: mockChainlinkDataFeed,
                chainlinkTimeInterval: mockTimeInterval,
            };

            await poolLibrary.addPool(poolData);

            let updatedPoolData = {
                mainPool: ethers.ZeroAddress,
                token0Pool: mockToken0Pool2,
                token1Pool: mockToken1Pool2,
                chainlinkDataFeed: mockChainlinkDataFeed2,
                chainlinkTimeInterval: mockTimeInterval2,
            };

            await expect(poolLibrary.updatePool(0, updatedPoolData)).to.be.revertedWithCustomError(poolLibrary, "InvalidInput");

            updatedPoolData = {
                mainPool: mockMainPool2,
                token0Pool: mockToken0Pool2,
                token1Pool: mockToken1Pool2,
                chainlinkDataFeed: ethers.ZeroAddress,
                chainlinkTimeInterval: mockTimeInterval2,
            };

            await expect(poolLibrary.updatePool(0, updatedPoolData)).to.be.revertedWithCustomError(poolLibrary, "InvalidInput");

            updatedPoolData = {
                mainPool: mockMainPool2,
                token0Pool: mockToken0Pool2,
                token1Pool: mockToken1Pool2,
                chainlinkDataFeed: mockChainlinkDataFeed2,
                chainlinkTimeInterval: 0,
            };

            await expect(poolLibrary.updatePool(0, updatedPoolData)).to.be.revertedWithCustomError(poolLibrary, "InvalidInput");

            updatedPoolData = {
                mainPool: mockMainPool2,
                token0Pool: ethers.ZeroAddress,
                token1Pool: ethers.ZeroAddress,
                chainlinkDataFeed: mockChainlinkDataFeed2,
                chainlinkTimeInterval: mockTimeInterval2,
            };

            await expect(poolLibrary.updatePool(0, updatedPoolData)).to.be.revertedWithCustomError(poolLibrary, "InvalidInput");
        });
    });
}
