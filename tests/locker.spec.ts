/* eslint @typescript-eslint/no-var-requires: "off" */
import {expect} from "chai";
import {ethers, ignition} from "hardhat";
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {Locker, ERC20Mock} from "../typechain-types";
import LockerModule from "../ignition/modules/Locker";
import Locker from "../ignition/modules/Locker";

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

        it("Should revert if amount to deposit is zero", async () => {
            await expect(locker.connect(user1).deposit(0)).to.be.revertedWithCustomError(locker, "InsufficientBalance");
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

        it("Should user deposit 2 times", async () => {
            const depositAmount = ethers.parseEther("50");

            await lockedToken.mint(depositAmount * BigInt(2));
            await lockedToken.transfer(user1.address, depositAmount * BigInt(2));

            await lockedToken.connect(user1).approve(await locker.getAddress(), depositAmount * BigInt(2));

            await locker.connect(user1).deposit(depositAmount);

            const lockerBalance = await lockedToken.balanceOf(await locker.getAddress());
            expect(lockerBalance).to.equal(depositAmount);

            const balanceLocked = await locker.balancesLocked(user1.address);
            expect(balanceLocked).to.equal(depositAmount);

            await locker.connect(user1).deposit(depositAmount);

            const lockerBalance2 = await lockedToken.balanceOf(await locker.getAddress());
            expect(lockerBalance2).to.equal(depositAmount * BigInt(2));

            const balanceLocked2 = await locker.balancesLocked(user1.address);
            expect(balanceLocked2).to.equal(depositAmount * BigInt(2));
        });

        it("Should 2 users deposit tokens", async () => {
            const depositAmount = ethers.parseEther("75");

            await lockedToken.mint(depositAmount * BigInt(2));
            await lockedToken.transfer(user1.address, depositAmount);
            await lockedToken.transfer(user2.address, depositAmount);

            await lockedToken.connect(user1).approve(await locker.getAddress(), depositAmount);
            await lockedToken.connect(user2).approve(await locker.getAddress(), depositAmount);

            await locker.connect(user1).deposit(depositAmount);
            await locker.connect(user2).deposit(depositAmount);

            const lockerBalance = await lockedToken.balanceOf(await locker.getAddress());
            expect(lockerBalance).to.equal(depositAmount * BigInt(2));

            const balanceLocked1 = await locker.balancesLocked(user1.address);
            expect(balanceLocked1).to.equal(depositAmount);

            const balanceLocked2 = await locker.balancesLocked(user2.address);
            expect(balanceLocked2).to.equal(depositAmount);
        });

        it("Should revert if trying to withdraw with zero balance", async () => {
            await expect(locker.withdraw(user1.address)).to.be.revertedWithCustomError(locker, "InsufficientBalance");
        });

        it("Should admin withdraw tokens", async () => {
            const depositAmount = ethers.parseEther("200");

            await lockedToken.mint(depositAmount);
            await lockedToken.transfer(user1.address, depositAmount);

            await lockedToken.connect(user1).approve(await locker.getAddress(), depositAmount);

            await locker.connect(user1).deposit(depositAmount);

            const amountWithdrawn = await locker.withdraw.staticCall(user1.address);
            await expect(locker.withdraw(user1.address)).to.emit(locker, "TokensWithdrawn").withArgs(depositAmount);

            expect(amountWithdrawn).to.equal(depositAmount);

            const lockerBalance = await lockedToken.balanceOf(await locker.getAddress());
            expect(lockerBalance).to.equal(0);

            const balanceLocked = await locker.balancesLocked(user1.address);
            expect(balanceLocked).to.equal(0);

            const ownerBalance = await lockedToken.balanceOf(owner.address);
            expect(ownerBalance).to.equal(depositAmount);
        });

        it("Should admin withdraw, then user deposit again, and admin withdraw again", async () => {
            const depositAmount = ethers.parseEther("120");

            await lockedToken.mint(depositAmount * BigInt(2));
            await lockedToken.transfer(user1.address, depositAmount * BigInt(2));

            await lockedToken.connect(user1).approve(await locker.getAddress(), depositAmount * BigInt(2));

            await locker.connect(user1).deposit(depositAmount);

            const amountWithdrawn1 = await locker.withdraw.staticCall(user1.address);
            await expect(locker.withdraw(user1.address)).to.emit(locker, "TokensWithdrawn").withArgs(depositAmount);
            expect(amountWithdrawn1).to.equal(depositAmount);

            const lockerBalance1 = await lockedToken.balanceOf(await locker.getAddress());
            expect(lockerBalance1).to.equal(0);

            const balanceLocked1 = await locker.balancesLocked(user1.address);
            expect(balanceLocked1).to.equal(0);

            const ownerBalance1 = await lockedToken.balanceOf(owner.address);
            expect(ownerBalance1).to.equal(depositAmount);

            // User deposits again
            await locker.connect(user1).deposit(depositAmount);

            const amountWithdrawn2 = await locker.withdraw.staticCall(user1.address);
            await expect(locker.withdraw(user1.address)).to.emit(locker, "TokensWithdrawn").withArgs(depositAmount);
            expect(amountWithdrawn2).to.equal(depositAmount);

            const lockerBalance2 = await lockedToken.balanceOf(await locker.getAddress());
            expect(lockerBalance2).to.equal(0);

            const balanceLocked2 = await locker.balancesLocked(user1.address);
            expect(balanceLocked2).to.equal(0);

            const ownerBalance2 = await lockedToken.balanceOf(owner.address);
            expect(ownerBalance2).to.equal(depositAmount * BigInt(2));
        });

        it("Should admin withdraw tokens deposited by different users", async () => {
            const depositAmount = ethers.parseEther("150");

            await lockedToken.mint(depositAmount * BigInt(2));
            await lockedToken.transfer(user1.address, depositAmount);
            await lockedToken.transfer(user2.address, depositAmount);

            await lockedToken.connect(user1).approve(await locker.getAddress(), depositAmount);
            await lockedToken.connect(user2).approve(await locker.getAddress(), depositAmount);

            await locker.connect(user1).deposit(depositAmount);
            await locker.connect(user2).deposit(depositAmount);

            const amountWithdrawn1 = await locker.withdraw.staticCall(user1.address);
            await expect(locker.withdraw(user1.address)).to.emit(locker, "TokensWithdrawn").withArgs(depositAmount);
            expect(amountWithdrawn1).to.equal(depositAmount);

            const amountWithdrawn2 = await locker.withdraw.staticCall(user2.address);
            await expect(locker.withdraw(user2.address)).to.emit(locker, "TokensWithdrawn").withArgs(depositAmount);
            expect(amountWithdrawn2).to.equal(depositAmount);

            const lockerBalance = await lockedToken.balanceOf(await locker.getAddress());
            expect(lockerBalance).to.equal(0);

            const balanceLocked1 = await locker.balancesLocked(user1.address);
            expect(balanceLocked1).to.equal(0);

            const balanceLocked2 = await locker.balancesLocked(user2.address);
            expect(balanceLocked2).to.equal(0);

            const ownerBalance = await lockedToken.balanceOf(owner.address);
            expect(ownerBalance).to.equal(depositAmount * BigInt(2));
        });
    });
}
