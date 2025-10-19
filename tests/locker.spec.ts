/* eslint @typescript-eslint/no-var-requires: "off" */
import {expect} from "chai";
import {ethers, ignition} from "hardhat";
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {Locker, ERC20Mock} from "../typechain-types";
import LockerModule from "../ignition/modules/Locker";

export default async function suite(): Promise<void> {
    describe("Locker", () => {
        let owner: SignerWithAddress;
        let user1: SignerWithAddress;
        let user2: SignerWithAddress;

        let locker: Locker;
        let lockedToken: ERC20Mock;

        let snap: string;

        before(async () => {
            [owner, user1, user2] = await ethers.getSigners();

            const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
            lockedToken = await ERC20MockFactory.deploy();

            const {proxy: lockerProxy} = await ignition.deploy(LockerModule, {
                parameters: {
                    Locker: {
                        _lockedToken: await lockedToken.getAddress(),
                    },
                },
            });

            locker = await ethers.getContractAt("Locker", await lockerProxy.getAddress());
        });

        beforeEach(async function () {
            snap = await ethers.provider.send("evm_snapshot", []);
        });

        afterEach(async function () {
            await ethers.provider.send("evm_revert", [snap]);
        });

        it("Should lockedToken be set correctly", async () => {
            expect(await locker.lockedToken()).to.equal(await lockedToken.getAddress());
        });

        it("Should allow users to deposit tokens", async () => {
            const depositAmount = ethers.parseEther("100");

            await lockedToken.mint(depositAmount);
            await lockedToken.transfer(user1.address, depositAmount);

            await lockedToken.connect(user1).approve(await locker.getAddress(), depositAmount);

            await expect(locker.connect(user1).deposit(depositAmount)).to.emit(locker, "TokensDeposited").withArgs(user1.address, depositAmount);
    
            const lockerBalance = await lockedToken.balanceOf(await locker.getAddress());
            expect(lockerBalance).to.equal(depositAmount);

            const balanceLocked = await locker.balancesLocked(user1.address);
            expect(balanceLocked).to.equal(depositAmount);
        });
    });
}
