/* eslint @typescript-eslint/no-var-requires: "off" */
import {expect} from "chai";
import {ethers, ignition} from "hardhat";
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {ProtocolManager, ERC20Mock, Locker, PoolLibrary} from "../typechain-types";
import {percentages} from "./../utils/constants";

import ProtocolManagerModule from "../ignition/modules/ProtocolManager";
import LockerModule from "../ignition/modules/Locker";
import PoolLibraryModule from "../ignition/modules/PoolLibrary";

const maxPercentage = percentages.MAX_PERCENTAGE;

export default async function suite(): Promise<void> {
    describe("ProtocolManager", () => {
        let owner: SignerWithAddress;
        let user1: SignerWithAddress;
        let user2: SignerWithAddress;
        let user3: SignerWithAddress;
        let user4: SignerWithAddress;
        let receiver: SignerWithAddress;

        let protocolManager: ProtocolManager;
        let locker: Locker;
        let poolLibrary: PoolLibrary;
        let baseToken: ERC20Mock;

        let defaultAdminRole: string;
        let managerRole: string;

        let snap: string;

        before(async () => {
            [owner, user1, user2, user3, user4, receiver] = await ethers.getSigners();

            /// Deploying contracts ///

            // Deploy base token mock
            const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
            baseToken = await ERC20MockFactory.deploy();

            // Deploy locker
            const {proxy: lockerProxy} = await ignition.deploy(LockerModule, {
                parameters: {
                    Locker: {
                        _lockedToken: await baseToken.getAddress(),
                    },
                },
            });
            locker = await ethers.getContractAt("Locker", await lockerProxy.getAddress());

            // Deploy pool library
            const {proxy: poolLibraryProxy} = await ignition.deploy(PoolLibraryModule);
            poolLibrary = await ethers.getContractAt("PoolLibrary", await poolLibraryProxy.getAddress());

            // Deploy protocol manager
            const {proxy: protocolManagerProxy} = await ignition.deploy(ProtocolManagerModule, {
                parameters: {
                    ProtocolManager: {
                        _baseToken: await baseToken.getAddress(),
                        _locker: await locker.getAddress(),
                        _poolLibrary: await poolLibrary.getAddress(),
                    },
                },
            });
            protocolManager = await ethers.getContractAt("ProtocolManager", await protocolManagerProxy.getAddress());

            /// Get roles ///

            defaultAdminRole = await protocolManager.getDefaultAdminRole();
            managerRole = await protocolManager.MANAGER_ROLE();

            /// Change ownership ///

            await locker.connect(owner).transferOwnership(await protocolManager.getAddress());
        });

        beforeEach(async function () {
            snap = await ethers.provider.send("evm_snapshot", []);
        });

        afterEach(async function () {
            await ethers.provider.send("evm_revert", [snap]);
        });

        it("Should baseToken be correctly set", async () => {
            expect(await protocolManager.baseToken()).to.equal(await baseToken.getAddress());
        });

        it("Should locker and poolLibrary be correctly set", async () => {
            expect(await protocolManager.locker()).to.equal(await locker.getAddress());
            expect(await protocolManager.poolLibrary()).to.equal(await poolLibrary.getAddress());
        });

        it("Should getDefaultAdminRole return correct value", async () => {
            const defaultAdminRole = await protocolManager.getDefaultAdminRole();
            expect(defaultAdminRole).to.equal(ethers.ZeroHash);
        });

        it("Should owner be admin", async () => {
            expect(await protocolManager.hasRole(defaultAdminRole, owner.address)).to.be.true;
        });

        it("Should position manager register deposits", async () => {
            const poolManager = user1;
            const depositor1 = user2;
            const depositor2 = user3;

            // Register depositor
            await protocolManager.connect(poolManager).registerDeposit(depositor1.address);

            // Check depositor is registered
            const usersSet = await protocolManager.usersSet(poolManager.address);
            expect(usersSet.length).to.equal(1);
            expect(usersSet).to.include(depositor1.address);

            // Register another depositor
            await protocolManager.connect(poolManager).registerDeposit(depositor2.address);

            // Check both depositors are registered
            const updatedUsersSet = await protocolManager.usersSet(poolManager.address);
            expect(updatedUsersSet.length).to.equal(2);
            expect(updatedUsersSet).to.include(depositor1.address);
            expect(updatedUsersSet).to.include(depositor2.address);
        });

        it("Should position manager register withdrawals", async () => {
            const poolManager = user1;
            const depositor1 = user2;
            const depositor2 = user3;

            // Register depositors
            await protocolManager.connect(poolManager).registerDeposit(depositor1.address);
            await protocolManager.connect(poolManager).registerDeposit(depositor2.address);

            // Unregister depositor1
            await protocolManager.connect(poolManager).registerWithdrawal(depositor1.address);

            // Check depositor1 is unregistered and depositor2 is still registered
            let usersSet = await protocolManager.usersSet(poolManager.address);
            expect(usersSet.length).to.equal(1);
            expect(usersSet).to.not.include(depositor1.address);
            expect(usersSet).to.include(depositor2.address);

            // Unregister depositor2
            await protocolManager.connect(poolManager).registerWithdrawal(depositor2.address);

            // Check both depositors are unregistered
            usersSet = await protocolManager.usersSet(poolManager.address);
            expect(usersSet.length).to.equal(0);
            expect(usersSet).to.not.include(depositor1.address);
            expect(usersSet).to.not.include(depositor2.address);
        });

        it("Should set receiver data correctly", async () => {
            const poolManager = user1;
            const receiverAddress = receiver.address;
            const receiverPercentage = ethers.parseEther("0.25"); // 25%

            // Set receiver data
            await expect(protocolManager.connect(poolManager).setReceiverData(receiverAddress, receiverPercentage))
                .to.emit(protocolManager, "ReceiverDataSet")
                .withArgs(poolManager.address, receiverAddress, receiverPercentage);

            // Get and check receiver data
            const [setReceiverAddress, setReceiverPercentage] = await protocolManager.getReceiverData(poolManager.address);
            expect(setReceiverAddress).to.equal(receiverAddress);
            expect(setReceiverPercentage).to.equal(receiverPercentage);
        });

        it("Should revert if random user tries to set locker or pool library", async () => {
            const randomUser = user2;

            await expect(protocolManager.connect(randomUser).setLocker(user3.address))
                .to.be.revertedWithCustomError(protocolManager, "AccessControlUnauthorizedAccount")
                .withArgs(randomUser.address, defaultAdminRole);

            await expect(protocolManager.connect(randomUser).setPoolLibrary(user3.address))
                .to.be.revertedWithCustomError(protocolManager, "AccessControlUnauthorizedAccount")
                .withArgs(randomUser.address, defaultAdminRole);
        });

        it("Should revert when locker is zero address", async () => {
            await expect(protocolManager.connect(owner).setLocker(ethers.ZeroAddress)).to.be.revertedWithCustomError(protocolManager, "ZeroAddress");
        });

        it("Should set a new locker", async () => {
            const newLocker = user4;

            await expect(protocolManager.connect(owner).setLocker(newLocker.address)).to.emit(protocolManager, "LockerUpdated").withArgs(newLocker.address);

            expect(await protocolManager.locker()).to.equal(newLocker.address);
        });

        it("Should revert when pool library is zero address", async () => {
            await expect(protocolManager.connect(owner).setPoolLibrary(ethers.ZeroAddress)).to.be.revertedWithCustomError(protocolManager, "ZeroAddress");
        });

        it("Should set a new pool library", async () => {
            const newPoolLibrary = user4;

            await expect(protocolManager.connect(owner).setPoolLibrary(newPoolLibrary.address))
                .to.emit(protocolManager, "PoolLibraryUpdated")
                .withArgs(newPoolLibrary.address);

            expect(await protocolManager.poolLibrary()).to.equal(newPoolLibrary.address);
        });

        it("Should revert if ProtocolManager tries to distribute rewards with zero balance", async () => {
            const poolManager = user1;

            await expect(protocolManager.distributeRewards(poolManager.address)).to.be.revertedWithCustomError(locker, "InsufficientBalance");
        });
    });
}
