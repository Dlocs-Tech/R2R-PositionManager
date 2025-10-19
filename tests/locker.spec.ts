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
    });
}