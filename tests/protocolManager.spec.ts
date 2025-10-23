/* eslint @typescript-eslint/no-var-requires: "off" */
import {expect} from "chai";
import {ethers, ignition} from "hardhat";
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {ProtocolManager, IERC20, Locker, PoolLibrary} from "../typechain-types";
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
        let baseToken: IERC20;

        let snap: string;

        before(async () => {
            [owner, user1, user2, user3, user4, receiver] = await ethers.getSigners();

            /// Deploying contracts ///

            // Deploy base token
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
                    }
                }
            });
            protocolManager = await ethers.getContractAt("ProtocolManager", await protocolManagerProxy.getAddress());
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
            expect(await protocolManager.hasRole(await protocolManager.getDefaultAdminRole(), owner.address)).to.be.true;
        });
    });
}
