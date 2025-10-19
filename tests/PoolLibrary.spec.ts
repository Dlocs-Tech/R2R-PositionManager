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

        it("Should poolsCount be zero", async () => {
            expect(await poolLibrary.poolsCount()).to.equal(0);
        });
    });
}
