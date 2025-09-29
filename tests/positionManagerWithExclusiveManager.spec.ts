import {expect} from "chai";
import {ethers, deployments} from "hardhat";
import {roles, percentages, contractAddresses} from "../utils/constants";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {PositionManagerDistributor, IERC20} from "../typechain";
import {BigNumber} from "ethers";

export default async function suite(): Promise<void> {
    const maxPercentage: BigNumber = BigNumber.from(1000000);
    const exclusiveManagerPercentage: BigNumber = BigNumber.from(percentages.ExclusiveManagerPercentage);

    let snap: string;
    let PositionManagerDistributor: PositionManagerDistributor;
    let PositionManager: any;

    let deployer: SignerWithAddress;
    let manager: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let user3: SignerWithAddress;
    let user4: SignerWithAddress;
    let receiver: SignerWithAddress;

    let USDTAddress = contractAddresses.USDT;
    let WBNBAddress = contractAddresses.WBNB;
    let exclusiveManagerAddress = contractAddresses.ExclusiveManager;

    let USDTContract: IERC20;
    let WBNBContract: IERC20;

    const wbnbToUsdt: BigNumber = ethers.utils.parseEther("616.3841228031"); // 1 WBNB = 616.3841228031 USDT

    describe("PositionManager USDT/USDC", function () {
        let USDCAddress = contractAddresses.USDC;

        let USDCContract: IERC20;

        const usdcToUsdt: BigNumber = ethers.utils.parseEther("1"); // 1 USDC = 1 USDT

        const usdcChainLinkPrice: BigNumber = BigNumber.from(99999439); // 1 USDC = 0.99999439 USDT

        const minTick: BigNumber = BigNumber.from(-887272);
        const maxTick: BigNumber = BigNumber.from(887272);

        before(async function () {
            await deployments.fixture(["PositionManagerDistributorWithExclusiveManager"]);

            PositionManagerDistributor = await ethers.getContract("PositionManagerDistributorWithExclusiveManager_6");

            [deployer, manager, user1, user2, user3, user4, receiver] = await ethers.getSigners();

            const PositionManagerAddress = await PositionManagerDistributor.sharesContract();

            PositionManager = await ethers.getContractAt("PositionManager", PositionManagerAddress);

            await PositionManager.setReceiverData(receiver.address, percentages.ReceiverPercentage);

            USDTContract = (await ethers.getContractAt("IERC20", USDTAddress)) as IERC20;
            USDCContract = (await ethers.getContractAt("IERC20", USDCAddress)) as IERC20;
            WBNBContract = (await ethers.getContractAt("IERC20", WBNBAddress)) as IERC20;

            await PositionManager.connect(deployer).grantRole(roles.POSITION_MANAGER_ROLE, manager.address);

            const holderAddress = "0x98cF4F4B03a4e967D54a3d0aeC9fCA90851f2Cca";

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [holderAddress],
            });

            await deployer.sendTransaction({
                to: holderAddress,
                value: ethers.utils.parseEther("1"), // Send 1 BNB
            });

            // Get the holder signer
            const holderSigner = await ethers.getSigner(holderAddress);

            // Send 10000 USDT to the deployer
            await USDTContract.connect(holderSigner).transfer(deployer.address, ethers.utils.parseUnits("10000", "18"));

            // Stop impersonating the holder address
            await hre.network.provider.request({
                method: "hardhat_stopImpersonatingAccount",
                params: [holderAddress],
            });
        });

        beforeEach(async function () {
            snap = await ethers.provider.send("evm_snapshot", []);
        });

        afterEach(async function () {
            await ethers.provider.send("evm_revert", [snap]);
        });

        it("Should deposit USDT into Position Manager (!inPosition)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            const expectedShares = amount.mul(usdcChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user1).deposit(amount))
                .to.emit(PositionManager, "Deposit")
                .withArgs(user1.address, expectedShares, amount);

            const balance = await PositionManager.balanceOf(user1.address);

            expect(balance).to.be.eq(expectedShares);
        });

        it("Should deposit and withdraw USDT from Position Manager (!inPosition)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            const expectedShares = amount.mul(usdcChainLinkPrice);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const newBalance = await PositionManager.balanceOf(user1.address);

            expect(newBalance).to.be.eq(0);
        });

        it("Should manager add liquidity to the pool", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should manager add liquidity and re add liquidity to the pool", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            await PositionManager.connect(manager).reAddLiquidity();

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.00001"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            await PositionManager.connect(manager).reAddLiquidity();

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.000000001"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should user deposit USDT after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount.mul(2));

            await USDTContract.connect(user1).approve(PositionManager.address, amount.mul(2));

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            await expect(PositionManagerDistributor.connect(user1).deposit(amount)).to.emit(PositionManager, "Deposit");

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const balance = await PositionManager.balanceOf(user1.address);

            expect(balance).to.be.not.eq(0);
        });

        it("Should manager update ticks after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const newMinTick = minTick.add(100);
            const newMaxTick = maxTick.sub(100);

            await PositionManager.connect(manager).updatePosition(newMinTick, newMaxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const ticks = await PositionManager.getTickRange();

            expect(ticks[0]).to.be.eq(newMinTick);
            expect(ticks[1]).to.be.eq(newMaxTick);
        });

        it("Should user withdraw after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount.mul(2));

            await USDTContract.connect(user1).approve(PositionManager.address, amount.mul(2));

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(usdcChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const newBalance = await PositionManager.balanceOf(user1.address);

            expect(newBalance).to.be.eq(0);
        });

        it("Should two users deposit USDT, then add liquidity and users withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);
            await USDTContract.connect(deployer).transfer(user2.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);
            await USDTContract.connect(user2).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount.mul(2));

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(usdcChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user2).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user2.address, expectedShares);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const user2NewBalance = await PositionManager.balanceOf(user2.address);

            expect(user2NewBalance).to.be.eq(0);

            const user1Balance = await PositionManager.balanceOf(user1.address);

            expect(user1Balance).to.be.eq(expectedShares);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const user1NewBalance = await PositionManager.balanceOf(user1.address);

            expect(user1NewBalance).to.be.eq(0);
        });

        it("Should deposit and add liquidity with different tick values (in range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(usdcChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should deposit and add liquidity with different tick values (under range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(0, 10);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(usdcChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should deposit and add liquidity with different tick values (over range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(-15, -10);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(usdcChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should deposit, add liquidity and remove liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            await PositionManager.connect(manager).removeLiquidity();

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(amount, ethers.utils.parseEther("0.1"));
        });

        it("Should deposit 3 times (different users)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);
            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);
            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);

            const expectedShares = amount.mul(usdcChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);
            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(expectedShares);
            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(expectedShares);
        });

        it("Should deposit user1, add liquidity, and then 3 different users deposits and withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(usdcChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);
            await USDTContract.connect(deployer).transfer(user4.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);
            await USDTContract.connect(user4).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user2).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);
            await PositionManagerDistributor.connect(user4).deposit(amount);

            expect(await PositionManager.balanceOf(user2.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user3.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user4.address)).to.be.not.eq(0);

            await PositionManagerDistributor.connect(user2).withdraw();
            await PositionManagerDistributor.connect(user3).withdraw();
            await PositionManagerDistributor.connect(user4).withdraw();

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(0);

            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            const user2USDCBalanceInUSDC = await USDCContract.balanceOf(user2.address);
            const user2USDCBalance = user2USDCBalanceInUSDC.mul(usdcToUsdt).div(BigNumber.from(10).pow(18));
            expect(user2USDTBalance.add(user2USDCBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.4"));

            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(0);

            const user3USDTBalance = await USDTContract.balanceOf(user3.address);
            const user3USDCBalanceInUSDC = await USDCContract.balanceOf(user3.address);
            const user3USDCBalance = user3USDCBalanceInUSDC.mul(usdcToUsdt).div(BigNumber.from(10).pow(18));
            expect(user3USDTBalance.add(user3USDCBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.05"));

            expect(await PositionManager.balanceOf(user4.address)).to.be.eq(0);

            const user4USDTBalance = await USDTContract.balanceOf(user4.address);
            const user4USDCBalanceInUSDC = await USDCContract.balanceOf(user4.address);
            const user4USDCBalance = user4USDCBalanceInUSDC.mul(usdcToUsdt).div(BigNumber.from(10).pow(18));
            expect(user4USDTBalance.add(user4USDCBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.2"));

            expect(await PositionManager.totalSupply()).to.be.eq(expectedShares);
        });

        it("Should deposit user1, add liquidity, and then 3 different users deposits and withdraw in other order", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(usdcChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);
            await USDTContract.connect(deployer).transfer(user4.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);
            await USDTContract.connect(user4).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user4).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await PositionManager.balanceOf(user2.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user3.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user4.address)).to.be.not.eq(0);

            await PositionManagerDistributor.connect(user4).withdraw();
            await PositionManagerDistributor.connect(user3).withdraw();
            await PositionManagerDistributor.connect(user2).withdraw();

            expect(await PositionManager.balanceOf(user4.address)).to.be.eq(0);

            const user4USDTBalance = await USDTContract.balanceOf(user4.address);
            const user4USDCBalanceInUSDC = await USDCContract.balanceOf(user4.address);
            const user4USDCBalance = user4USDCBalanceInUSDC.mul(usdcToUsdt).div(BigNumber.from(10).pow(18));
            expect(user4USDTBalance.add(user4USDCBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.4"));

            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(0);

            const user3USDTBalance = await USDTContract.balanceOf(user3.address);
            const user3USDCBalanceInUSDC = await USDCContract.balanceOf(user3.address);
            const user3USDCBalance = user3USDCBalanceInUSDC.mul(usdcToUsdt).div(BigNumber.from(10).pow(18));
            expect(user3USDTBalance.add(user3USDCBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.05"));

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(0);

            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            const user2USDCBalanceInUSDC = await USDCContract.balanceOf(user2.address);
            const user2USDCBalance = user2USDCBalanceInUSDC.mul(usdcToUsdt).div(BigNumber.from(10).pow(18));
            expect(user2USDTBalance.add(user2USDCBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.2"));

            expect(await PositionManager.totalSupply()).to.be.eq(expectedShares);
        });

        it("Should deposit, add liquidity, and withdraw will close position, so we can deposit and add liquidity again", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(usdcChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await PositionManagerDistributor.connect(user1).withdraw();

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(0);

            await USDTContract.connect(deployer).transfer(user2.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares2 = amount.mul(usdcChainLinkPrice);

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(expectedShares2);
        });

        it("Should add and remove liquidity 6 times, then withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            for (let i = 0; i < 6; i++) {
                await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

                expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
                expect(await USDCContract.balanceOf(PositionManager.address)).to.be.eq(0);

                await PositionManager.connect(manager).removeLiquidity();

                expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(amount, ethers.utils.parseEther("0.6"));
            }

            // Lose max 0.6 USDT in 6 add/remove liquidity
            await PositionManagerDistributor.connect(user1).withdraw();

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            expect(user1USDTBalance).to.be.closeTo(amount, ethers.utils.parseEther("0.6"));
        });

        it("Should set a deposit fee and charge it in a deposit", async function () {
            const amount = ethers.utils.parseEther("1000");

            const amountAfterFee = amount.mul(900000).div(1000000);

            const amountCharged = amount.sub(amountAfterFee);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManager.connect(deployer).setFee(100000, user2.address);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amountAfterFee);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(amountAfterFee.mul(usdcChainLinkPrice));

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);
            expect(user1USDTBalance).to.be.eq(0);

            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            expect(user2USDTBalance).to.be.equal(amountCharged);
        });

        it("revert: fails to distribute rewards if the contract has no balance", async function () {
            await expect(PositionManager.connect(manager).distributeRewards(0)).to.be.revertedWith("InvalidEntry");
        });

        it("revert: fails to set exclusive manager percentage over 100%", async function () {
            const exclusiveManagerContract = await ethers.getContractAt("PositionManagerDistributorWithExclusiveManager", PositionManagerDistributor.address);
            const invalidPercentage = maxPercentage.add(1); // 1,000,001 (over 100%)

            await expect(exclusiveManagerContract.connect(deployer).setExclusiveManagerData(exclusiveManagerAddress, invalidPercentage)).to.be.revertedWith(
                "InvalidEntry"
            );
        });

        it("should distribute to the receiver (zero users)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            // Check that exclusive manager received their 15%
            const exclusiveManagerBalance = await USDTContract.balanceOf(exclusiveManagerAddress);
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            expect(exclusiveManagerBalance).to.be.equal(expectedExclusiveManagerAmount);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            // After exclusive manager takes their cut, remaining goes to receiver
            const remainingForReceiver = amount.sub(expectedExclusiveManagerAmount);
            expect(receiverBalance).to.be.closeTo(remainingForReceiver.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.01"));
        });

        it("an user deposits and distributeRewards is called", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            expect(user1USDTBalance).to.be.eq(0);

            // Check that exclusive manager received their 15%
            const exclusiveManagerBalance = await USDTContract.balanceOf(exclusiveManagerAddress);
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            expect(exclusiveManagerBalance).to.be.equal(expectedExclusiveManagerAmount);

            // After exclusive manager takes 15%, remaining amount is distributed between receiver and users
            const remainingAfterExclusiveManager = amount.sub(expectedExclusiveManagerAmount);
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);
            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);

            expect(user1ContractUSDTBalance).to.be.equal(remainingAfterExclusiveManager.sub(expectedReceiverBalance));
        });

        it("revert: an user cannot collect rewards if the contract has no balance", async function () {
            await expect(PositionManagerDistributor.connect(user1).collectRewards()).to.be.revertedWith("InvalidEntry");
        });

        it("an user deposits, distributeRewards is called and the user collects rewards", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            await PositionManagerDistributor.connect(user1).collectRewards();

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            // First, exclusive manager takes 15%
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            const remainingAfterExclusiveManager = amount.sub(expectedExclusiveManagerAmount);

            // Then receiver takes 35% of the remaining
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            // User gets the rest
            const expectedUser1USDTBalance = remainingAfterExclusiveManager.sub(expectedReceiverBalance);

            expect(user1USDTBalance).to.be.equal(expectedUser1USDTBalance);

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);

            expect(user1ContractUSDTBalance).to.be.eq(0);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            const PositionManagerDistributorBalance = await USDTContract.balanceOf(PositionManagerDistributor.address);

            expect(PositionManagerDistributorBalance).to.be.eq(0);
        });

        it("4 users deposit differents amounts and distributeRewards is called", async function () {
            const amount1 = ethers.utils.parseEther("500");
            const amount2 = ethers.utils.parseEther("1000");
            const amount3 = ethers.utils.parseEther("1500");
            const amount4 = ethers.utils.parseEther("2000");

            await USDTContract.connect(deployer).transfer(user1.address, amount1);
            await USDTContract.connect(deployer).transfer(user2.address, amount2);
            await USDTContract.connect(deployer).transfer(user3.address, amount3);
            await USDTContract.connect(deployer).transfer(user4.address, amount4);

            await USDTContract.connect(user1).approve(PositionManager.address, amount1);
            await USDTContract.connect(user2).approve(PositionManager.address, amount2);
            await USDTContract.connect(user3).approve(PositionManager.address, amount3);
            await USDTContract.connect(user4).approve(PositionManager.address, amount4);

            await PositionManagerDistributor.connect(user1).deposit(amount1);
            await PositionManagerDistributor.connect(user2).deposit(amount2);
            await PositionManagerDistributor.connect(user3).deposit(amount3);
            await PositionManagerDistributor.connect(user4).deposit(amount4);

            const totalAmount = amount1.add(amount2).add(amount3).add(amount4);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, totalAmount);

            await PositionManager.connect(manager).distributeRewards(0);

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);
            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            const user3USDTBalance = await USDTContract.balanceOf(user3.address);
            const user4USDTBalance = await USDTContract.balanceOf(user4.address);

            expect(user1USDTBalance).to.be.eq(0);
            expect(user2USDTBalance).to.be.eq(0);
            expect(user3USDTBalance).to.be.eq(0);
            expect(user4USDTBalance).to.be.eq(0);

            // First, exclusive manager takes 15% of total amount
            const expectedExclusiveManagerAmount = totalAmount.mul(exclusiveManagerPercentage).div(maxPercentage);
            const remainingAfterExclusiveManager = totalAmount.sub(expectedExclusiveManagerAmount);

            // Then receiver takes 35% of the remaining
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.01"));

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);
            const user2ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user2.address);
            const user3ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user3.address);
            const user4ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user4.address);

            // Calculate each user's portion after exclusive manager takes their cut
            const expectedUser1USDTBalance = amount1
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount1.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser2USDTBalance = amount2
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount2.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser3USDTBalance = amount3
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount3.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser4USDTBalance = amount4
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount4.mul(expectedReceiverBalance).div(totalAmount));

            expect(user1ContractUSDTBalance).to.be.equal(expectedUser1USDTBalance);
            expect(user2ContractUSDTBalance).to.be.equal(expectedUser2USDTBalance);
            expect(user3ContractUSDTBalance).to.be.equal(expectedUser3USDTBalance);
            expect(user4ContractUSDTBalance).to.be.equal(expectedUser4USDTBalance);
        });

        it("should not send funds to exclusive manager when set to address(0)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            // Cast to the correct contract type and set exclusive manager to address(0) with 0 percentage
            const exclusiveManagerContract = await ethers.getContractAt("PositionManagerDistributorWithExclusiveManager", PositionManagerDistributor.address);
            await exclusiveManagerContract.connect(deployer).setExclusiveManagerData(ethers.constants.AddressZero, 0);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            // Check that address(0) did not receive any funds (should always be 0)
            const exclusiveManagerBalance = await USDTContract.balanceOf(ethers.constants.AddressZero);
            expect(exclusiveManagerBalance).to.be.equal(0);

            // Check that receiver gets the full percentage of the total amount (no exclusive manager deduction)
            const expectedReceiverBalance = amount.mul(percentages.ReceiverPercentage).div(maxPercentage);
            const receiverBalance = await WBNBContract.balanceOf(receiver.address);
            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            // Check that user gets the remaining amount (no exclusive manager deduction)
            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);
            expect(user1ContractUSDTBalance).to.be.equal(amount.sub(expectedReceiverBalance));
        });
    });

    describe("PositionManager USDT/WBNB", function () {
        const bnbChainLinkPrice: BigNumber = BigNumber.from(61540830210); // 61540830210 USDT

        const minTick: BigNumber = BigNumber.from(-887272);
        const maxTick: BigNumber = BigNumber.from(887272);

        before(async function () {
            await deployments.fixture(["PositionManagerDistributorWithExclusiveManager"]);

            PositionManagerDistributor = await ethers.getContract("PositionManagerDistributorWithExclusiveManager");

            [deployer, manager, user1, user2, user3, user4, receiver] = await ethers.getSigners();

            const PositionManagerAddress = await PositionManagerDistributor.sharesContract();

            PositionManager = await ethers.getContractAt("PositionManager", PositionManagerAddress);

            await PositionManager.setReceiverData(receiver.address, percentages.ReceiverPercentage);

            USDTContract = (await ethers.getContractAt("IERC20", USDTAddress)) as IERC20;
            WBNBContract = (await ethers.getContractAt("IERC20", WBNBAddress)) as IERC20;

            await PositionManager.connect(deployer).grantRole(roles.POSITION_MANAGER_ROLE, manager.address);

            const holderAddress = "0x98cF4F4B03a4e967D54a3d0aeC9fCA90851f2Cca";

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [holderAddress],
            });

            await deployer.sendTransaction({
                to: holderAddress,
                value: ethers.utils.parseEther("1"), // Send 1 BNB
            });

            // Get the holder signer
            const holderSigner = await ethers.getSigner(holderAddress);

            // Send 10000 USDT to the deployer
            await USDTContract.connect(holderSigner).transfer(deployer.address, ethers.utils.parseUnits("10000", "18"));

            // Stop impersonating the holder address
            await hre.network.provider.request({
                method: "hardhat_stopImpersonatingAccount",
                params: [holderAddress],
            });
        });

        beforeEach(async function () {
            snap = await ethers.provider.send("evm_snapshot", []);
        });

        afterEach(async function () {
            await ethers.provider.send("evm_revert", [snap]);
        });

        it("Should deposit USDT into Position Manager (!inPosition)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user1).deposit(amount))
                .to.emit(PositionManager, "Deposit")
                .withArgs(user1.address, expectedShares, amount);

            const balance = await PositionManager.balanceOf(user1.address);

            expect(balance).to.be.eq(expectedShares);
        });

        it("Should deposit and withdraw USDT from Position Manager (!inPosition)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const newBalance = await PositionManager.balanceOf(user1.address);

            expect(newBalance).to.be.eq(0);
        });

        it("Should manager add liquidity to the pool", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should manager add liquidity and re add liquidity to the pool", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            await PositionManager.connect(manager).reAddLiquidity();

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.00001"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            await PositionManager.connect(manager).reAddLiquidity();

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.000000001"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should user deposit USDT after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount.mul(2));

            await USDTContract.connect(user1).approve(PositionManager.address, amount.mul(2));

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            await expect(PositionManagerDistributor.connect(user1).deposit(amount)).to.emit(PositionManager, "Deposit");

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const balance = await PositionManager.balanceOf(user1.address);

            expect(balance).to.be.not.eq(0);
        });

        it("Should manager update ticks after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount.mul(2));

            await USDTContract.connect(user1).approve(PositionManager.address, amount.mul(2));

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const newMinTick = minTick.add(100);
            const newMaxTick = maxTick.sub(100);

            await PositionManager.connect(manager).updatePosition(newMinTick, newMaxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const ticks = await PositionManager.getTickRange();

            expect(ticks[0]).to.be.eq(newMinTick);
            expect(ticks[1]).to.be.eq(newMaxTick);
        });

        it("Should user withdraw after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount.mul(2));

            await USDTContract.connect(user1).approve(PositionManager.address, amount.mul(2));

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const newBalance = await PositionManager.balanceOf(user1.address);

            expect(newBalance).to.be.eq(0);
        });

        it("Should two users deposit USDT, then add liquidity and users withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);
            await USDTContract.connect(deployer).transfer(user2.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);
            await USDTContract.connect(user2).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount.mul(2));

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.2"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user2).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user2.address, expectedShares);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.02"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const user2NewBalance = await PositionManager.balanceOf(user2.address);

            expect(user2NewBalance).to.be.eq(0);

            const user1Balance = await PositionManager.balanceOf(user1.address);

            expect(user1Balance).to.be.eq(expectedShares);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const user1NewBalance = await PositionManager.balanceOf(user1.address);

            expect(user1NewBalance).to.be.eq(0);
        });

        it("Should deposit and add liquidity with different tick values (in range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(-887270, 887270);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should deposit and add liquidity with different tick values (under range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(-61000, -60000);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should deposit and add liquidity with different tick values (over range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(-66000, -65000);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should deposit, add liquidity and remove liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            await PositionManager.connect(manager).removeLiquidity();

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(amount, ethers.utils.parseEther("0.1"));
        });

        it("Should deposit 3 times (different users)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);
            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);
            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);
            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(expectedShares);
            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(expectedShares);
        });

        it("Should deposit user1, add liquidity, and then 3 different users deposit and withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);
            await USDTContract.connect(deployer).transfer(user4.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);
            await USDTContract.connect(user4).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user2).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);
            await PositionManagerDistributor.connect(user4).deposit(amount);

            expect(await PositionManager.balanceOf(user2.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user3.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user4.address)).to.be.not.eq(0);

            await PositionManagerDistributor.connect(user2).withdraw();
            await PositionManagerDistributor.connect(user3).withdraw();
            await PositionManagerDistributor.connect(user4).withdraw();

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(0);

            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            const user2WBNBBalanceInWBNB = await WBNBContract.balanceOf(user2.address);
            const user2WBNBBalance = user2WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            expect(user2USDTBalance.add(user2WBNBBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.3"));

            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(0);

            const user3USDTBalance = await USDTContract.balanceOf(user3.address);
            const user3WBNBBalanceInWBNB = await WBNBContract.balanceOf(user3.address);
            const user3WBNBBalance = user3WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            expect(user3USDTBalance.add(user3WBNBBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.7"));

            expect(await PositionManager.balanceOf(user4.address)).to.be.eq(0);

            const user4USDTBalance = await USDTContract.balanceOf(user4.address);
            const user4WBNBBalanceInWBNB = await WBNBContract.balanceOf(user4.address);
            const user4WBNBBalance = user4WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            expect(user4USDTBalance.add(user4WBNBBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1.1"));

            expect(await PositionManager.totalSupply()).to.be.eq(expectedShares);
        });

        it("Should deposit user1, add liquidity, and then 3 different users deposits and withdraw in other order", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);
            await USDTContract.connect(deployer).transfer(user4.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);
            await USDTContract.connect(user4).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user4).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await PositionManager.balanceOf(user2.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user3.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user4.address)).to.be.not.eq(0);

            await PositionManagerDistributor.connect(user4).withdraw();
            await PositionManagerDistributor.connect(user3).withdraw();
            await PositionManagerDistributor.connect(user2).withdraw();

            expect(await PositionManager.balanceOf(user4.address)).to.be.eq(0);

            const user4USDTBalance = await USDTContract.balanceOf(user4.address);
            const user4WBNBBalanceInWBNB = await WBNBContract.balanceOf(user4.address);
            const user4WBNBBalance = user4WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            expect(user4USDTBalance.add(user4WBNBBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.3"));

            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(0);

            const user3USDTBalance = await USDTContract.balanceOf(user3.address);
            const user3WBNBBalanceInWBNB = await WBNBContract.balanceOf(user3.address);
            const user3WBNBBalance = user3WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            expect(user3USDTBalance.add(user3WBNBBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.7"));

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(0);

            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            const user2WBNBBalanceInWBNB = await WBNBContract.balanceOf(user2.address);
            const user2WBNBBalance = user2WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            expect(user2USDTBalance.add(user2WBNBBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1.1"));

            expect(await PositionManager.totalSupply()).to.be.eq(expectedShares);
        });

        it("Should deposit, add liquidity, and withdraw will close position, so we can deposit and add liquidity again", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await PositionManagerDistributor.connect(user1).withdraw();

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(0);

            await USDTContract.connect(deployer).transfer(user2.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares2 = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(expectedShares2);
        });

        it("Should add and remove liquidity 10 times, then withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            for (let i = 0; i < 10; i++) {
                await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

                expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
                expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

                await PositionManager.connect(manager).removeLiquidity();

                expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(amount, ethers.utils.parseEther("1"));
            }

            // Lose max 1 USDT in 10 add/remove liquidity
            await PositionManagerDistributor.connect(user1).withdraw();

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            expect(user1USDTBalance).to.be.closeTo(amount, ethers.utils.parseEther("1"));
        });

        it("Should set a deposit fee and charge it in a deposit", async function () {
            const amount = ethers.utils.parseEther("1000");

            const amountAfterFee = amount.mul(900000).div(1000000);

            const amountCharged = amount.sub(amountAfterFee);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManager.connect(deployer).setFee(100000, user2.address);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amountAfterFee);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(amountAfterFee.mul(bnbChainLinkPrice));

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);
            expect(user1USDTBalance).to.be.eq(0);

            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            expect(user2USDTBalance).to.be.equal(amountCharged);
        });

        it("revert: fails to distribute rewards if the contract has no balance", async function () {
            await expect(PositionManager.connect(manager).distributeRewards(0)).to.be.revertedWith("InvalidEntry");
        });

        it("should distribute to the receiver (zero users)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            // Check that exclusive manager received their 15%
            const exclusiveManagerBalance = await USDTContract.balanceOf(exclusiveManagerAddress);
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            expect(exclusiveManagerBalance).to.be.equal(expectedExclusiveManagerAmount);

            // After exclusive manager takes their cut, remaining goes to receiver
            const remainingForReceiver = amount.sub(expectedExclusiveManagerAmount);
            expect(receiverBalance).to.be.closeTo(remainingForReceiver.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.01"));
        });

        it("an user deposits and distributeRewards is called", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            expect(user1USDTBalance).to.be.eq(0);

            // Check that exclusive manager received their 15%
            const exclusiveManagerBalance = await USDTContract.balanceOf(exclusiveManagerAddress);
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            expect(exclusiveManagerBalance).to.be.equal(expectedExclusiveManagerAmount);

            // After exclusive manager takes 15%, remaining amount is distributed between receiver and users
            const remainingAfterExclusiveManager = amount.sub(expectedExclusiveManagerAmount);
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);
            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);

            expect(user1ContractUSDTBalance).to.be.equal(remainingAfterExclusiveManager.sub(expectedReceiverBalance));
        });

        it("revert: an user cannot collect rewards if the contract has no balance", async function () {
            await expect(PositionManagerDistributor.connect(user1).collectRewards()).to.be.revertedWith("InvalidEntry");
        });

        it("an user deposits, distributeRewards is called and the user collects rewards", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            await PositionManagerDistributor.connect(user1).collectRewards();

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            // First, exclusive manager takes 15%
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            const remainingAfterExclusiveManager = amount.sub(expectedExclusiveManagerAmount);

            // Then receiver takes 35% of the remaining
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            // User gets the rest
            const expectedUser1USDTBalance = remainingAfterExclusiveManager.sub(expectedReceiverBalance);

            expect(user1USDTBalance).to.be.equal(expectedUser1USDTBalance);

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);

            expect(user1ContractUSDTBalance).to.be.eq(0);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            const PositionManagerDistributorBalance = await USDTContract.balanceOf(PositionManagerDistributor.address);

            expect(PositionManagerDistributorBalance).to.be.eq(0);
        });

        it("4 users deposit differents amounts and distributeRewards is called", async function () {
            const amount1 = ethers.utils.parseEther("500");
            const amount2 = ethers.utils.parseEther("1000");
            const amount3 = ethers.utils.parseEther("1500");
            const amount4 = ethers.utils.parseEther("2000");

            await USDTContract.connect(deployer).transfer(user1.address, amount1);
            await USDTContract.connect(deployer).transfer(user2.address, amount2);
            await USDTContract.connect(deployer).transfer(user3.address, amount3);
            await USDTContract.connect(deployer).transfer(user4.address, amount4);

            await USDTContract.connect(user1).approve(PositionManager.address, amount1);
            await USDTContract.connect(user2).approve(PositionManager.address, amount2);
            await USDTContract.connect(user3).approve(PositionManager.address, amount3);
            await USDTContract.connect(user4).approve(PositionManager.address, amount4);

            await PositionManagerDistributor.connect(user1).deposit(amount1);
            await PositionManagerDistributor.connect(user2).deposit(amount2);
            await PositionManagerDistributor.connect(user3).deposit(amount3);
            await PositionManagerDistributor.connect(user4).deposit(amount4);

            const totalAmount = amount1.add(amount2).add(amount3).add(amount4);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, totalAmount);

            await PositionManager.connect(manager).distributeRewards(0);

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);
            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            const user3USDTBalance = await USDTContract.balanceOf(user3.address);
            const user4USDTBalance = await USDTContract.balanceOf(user4.address);

            expect(user1USDTBalance).to.be.eq(0);
            expect(user2USDTBalance).to.be.eq(0);
            expect(user3USDTBalance).to.be.eq(0);
            expect(user4USDTBalance).to.be.eq(0);

            // First, exclusive manager takes 15% of total amount
            const expectedExclusiveManagerAmount = totalAmount.mul(exclusiveManagerPercentage).div(maxPercentage);
            const remainingAfterExclusiveManager = totalAmount.sub(expectedExclusiveManagerAmount);

            // Then receiver takes 35% of the remaining
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.01"));

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);
            const user2ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user2.address);
            const user3ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user3.address);
            const user4ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user4.address);

            // Calculate each user's portion after exclusive manager takes their cut
            const expectedUser1USDTBalance = amount1
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount1.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser2USDTBalance = amount2
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount2.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser3USDTBalance = amount3
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount3.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser4USDTBalance = amount4
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount4.mul(expectedReceiverBalance).div(totalAmount));

            expect(user1ContractUSDTBalance).to.be.equal(expectedUser1USDTBalance);
            expect(user2ContractUSDTBalance).to.be.equal(expectedUser2USDTBalance);
            expect(user3ContractUSDTBalance).to.be.equal(expectedUser3USDTBalance);
            expect(user4ContractUSDTBalance).to.be.equal(expectedUser4USDTBalance);
        });

        it("should not send funds to exclusive manager when set to address(0)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            // Set exclusive manager to address(0) with 0% fee
            const exclusiveManagerContract = await ethers.getContractAt("PositionManagerDistributorWithExclusiveManager", PositionManagerDistributor.address);
            await exclusiveManagerContract.connect(deployer).setExclusiveManagerData(ethers.constants.AddressZero, 0);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            // Distribute rewards
            await PositionManager.connect(manager).distributeRewards(0);

            // Check that exclusive manager (address(0)) receives no funds
            const exclusiveManagerBalance = await USDTContract.balanceOf(ethers.constants.AddressZero);
            expect(exclusiveManagerBalance).to.be.equal(0);

            // Receiver should get 35% of the total amount (no deduction for exclusive manager)
            const expectedReceiverBalance = amount.mul(percentages.ReceiverPercentage).div(maxPercentage);
            const receiverBalance = await WBNBContract.balanceOf(receiver.address);
            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            // User should get remaining 65% of the total amount
            const userBalance = await PositionManagerDistributor.balanceOf(user1.address);
            const expectedUserBalance = amount.sub(expectedReceiverBalance);
            expect(userBalance).to.be.equal(expectedUserBalance);
        });

        it("revert: fails to set exclusive manager percentage over 100%", async function () {
            const exclusiveManagerContract = await ethers.getContractAt("PositionManagerDistributorWithExclusiveManager", PositionManagerDistributor.address);
            const invalidPercentage = maxPercentage.add(1); // 1,000,001 (over 100%)

            await expect(exclusiveManagerContract.connect(deployer).setExclusiveManagerData(exclusiveManagerAddress, invalidPercentage)).to.be.revertedWith(
                "InvalidEntry"
            );
        });
    });

    describe("PositionManager ETH/USDT", function () {
        let ETHAddress = contractAddresses.ETH;

        let ETHContract: IERC20;

        const ethToUsdt: BigNumber = ethers.utils.parseEther("3359"); // 1 ETH = 3359 USDT

        const usdChainLinkPrice: BigNumber = BigNumber.from(99962487);

        const minTick: BigNumber = BigNumber.from(-887270);
        const maxTick: BigNumber = BigNumber.from(887270);

        before(async function () {
            await deployments.fixture(["PositionManagerDistributorWithExclusiveManager"]);

            PositionManagerDistributor = await ethers.getContract("PositionManagerDistributorWithExclusiveManager_2");

            [deployer, manager, user1, user2, user3, user4, receiver] = await ethers.getSigners();

            const PositionManagerAddress = await PositionManagerDistributor.sharesContract();

            PositionManager = await ethers.getContractAt("PositionManager", PositionManagerAddress);

            await PositionManager.setReceiverData(receiver.address, percentages.ReceiverPercentage);

            USDTContract = (await ethers.getContractAt("IERC20", USDTAddress)) as IERC20;
            ETHContract = (await ethers.getContractAt("IERC20", ETHAddress)) as IERC20;
            WBNBContract = (await ethers.getContractAt("IERC20", WBNBAddress)) as IERC20;

            await PositionManager.connect(deployer).grantRole(roles.POSITION_MANAGER_ROLE, manager.address);

            const holderAddress = "0x98cF4F4B03a4e967D54a3d0aeC9fCA90851f2Cca";

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [holderAddress],
            });

            await deployer.sendTransaction({
                to: holderAddress,
                value: ethers.utils.parseEther("1"), // Send 1 BNB
            });

            // Get the holder signer
            const holderSigner = await ethers.getSigner(holderAddress);

            // Send 10000 USDT to the deployer
            await USDTContract.connect(holderSigner).transfer(deployer.address, ethers.utils.parseUnits("10000", "18"));

            // Stop impersonating the holder address
            await hre.network.provider.request({
                method: "hardhat_stopImpersonatingAccount",
                params: [holderAddress],
            });
        });

        beforeEach(async function () {
            snap = await ethers.provider.send("evm_snapshot", []);
        });

        afterEach(async function () {
            await ethers.provider.send("evm_revert", [snap]);
        });

        it("Should deposit USDT into Position Manager (!inPosition)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            const expectedShares = amount.mul(usdChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user1).deposit(amount))
                .to.emit(PositionManager, "Deposit")
                .withArgs(user1.address, expectedShares, amount);

            const balance = await PositionManager.balanceOf(user1.address);

            expect(balance).to.be.eq(expectedShares);
        });

        it("Should deposit and withdraw USDT from Position Manager (!inPosition)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            const expectedShares = amount.mul(usdChainLinkPrice);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const newBalance = await PositionManager.balanceOf(user1.address);

            expect(newBalance).to.be.eq(0);
        });

        it("Should manager add liquidity to the pool", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));
        });

        it("Should manager add liquidity and re add liquidity to the pool", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));

            await PositionManager.connect(manager).reAddLiquidity();

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.0001"));

            await PositionManager.connect(manager).reAddLiquidity();

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.0000001"));
        });

        it("Should user deposit USDT after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount.mul(2));

            await USDTContract.connect(user1).approve(PositionManager.address, amount.mul(2));

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));

            await expect(PositionManagerDistributor.connect(user1).deposit(amount)).to.emit(PositionManager, "Deposit");

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.2"));

            const balance = await PositionManager.balanceOf(user1.address);

            expect(balance).to.be.not.eq(0);
        });

        it("Should manager update ticks after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));

            const newMinTick = minTick.add(100);
            const newMaxTick = maxTick.sub(100);

            await PositionManager.connect(manager).updatePosition(newMinTick, newMaxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.0001"));
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 45);

            const ticks = await PositionManager.getTickRange();

            expect(ticks[0]).to.be.eq(newMinTick);
            expect(ticks[1]).to.be.eq(newMaxTick);
        });

        it("Should user withdraw after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount.mul(2));

            await USDTContract.connect(user1).approve(PositionManager.address, amount.mul(2));

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));

            const expectedShares = amount.mul(usdChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const newBalance = await PositionManager.balanceOf(user1.address);

            expect(newBalance).to.be.eq(0);
        });

        it("Should two users deposit USDT, then add liquidity and users withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);
            await USDTContract.connect(deployer).transfer(user2.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);
            await USDTContract.connect(user2).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount.mul(2));

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.5"));

            const expectedShares = amount.mul(usdChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user2).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user2.address, expectedShares);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.0001"));
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 45);

            const user2NewBalance = await PositionManager.balanceOf(user2.address);

            expect(user2NewBalance).to.be.eq(0);

            const user1Balance = await PositionManager.balanceOf(user1.address);

            expect(user1Balance).to.be.eq(expectedShares);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const user1NewBalance = await PositionManager.balanceOf(user1.address);

            expect(user1NewBalance).to.be.eq(0);
        });

        it("Should deposit and add liquidity with different tick values (in range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(-887270, 887270);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));

            const expectedShares = amount.mul(usdChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.2"));
        });

        it("Should deposit and add liquidity with different tick values (under range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(81180, 81190);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 10);

            const expectedShares = amount.mul(usdChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 10);
        });

        it("Should deposit and add liquidity with different tick values (over range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(81070, 81090);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(usdChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should deposit, add liquidity and remove liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));

            await PositionManager.connect(manager).removeLiquidity();

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(amount, ethers.utils.parseEther("0.5"));
        });

        it("Should deposit 3 times (different users)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);
            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);
            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);

            const expectedShares = amount.mul(usdChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);
            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(expectedShares);
            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(expectedShares);
        });

        it("Should deposit user1, add liquidity, and then 3 different users deposits and withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));

            const expectedShares = amount.mul(usdChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);
            await USDTContract.connect(deployer).transfer(user4.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);
            await USDTContract.connect(user4).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user2).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);
            await PositionManagerDistributor.connect(user4).deposit(amount);

            expect(await PositionManager.balanceOf(user2.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user3.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user4.address)).to.be.not.eq(0);

            await PositionManagerDistributor.connect(user2).withdraw();
            await PositionManagerDistributor.connect(user3).withdraw();
            await PositionManagerDistributor.connect(user4).withdraw();

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(0);

            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            const user2ETHBalanceInETH = await ETHContract.balanceOf(user2.address);
            const user2ETHBalance = user2ETHBalanceInETH.mul(ethToUsdt).div(BigNumber.from(10).pow(18));
            expect(user2USDTBalance.add(user2ETHBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1.2"));

            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(0);

            const user3USDTBalance = await USDTContract.balanceOf(user3.address);
            const user3ETHBalanceInETH = await ETHContract.balanceOf(user3.address);
            const user3ETHBalance = user3ETHBalanceInETH.mul(ethToUsdt).div(BigNumber.from(10).pow(18));
            expect(user3USDTBalance.add(user3ETHBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1.5"));

            expect(await PositionManager.balanceOf(user4.address)).to.be.eq(0);

            const user4USDTBalance = await USDTContract.balanceOf(user4.address);
            const user4ETHBalanceInETH = await ETHContract.balanceOf(user4.address);
            const user4ETHBalance = user4ETHBalanceInETH.mul(ethToUsdt).div(BigNumber.from(10).pow(18));
            expect(user4USDTBalance.add(user4ETHBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1.7"));

            expect(await PositionManager.totalSupply()).to.be.eq(expectedShares);
        });

        it("Should deposit user1, add liquidity, and then 3 different users deposits and withdraw in other order", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));

            const expectedShares = amount.mul(usdChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);
            await USDTContract.connect(deployer).transfer(user4.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);
            await USDTContract.connect(user4).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user4).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await PositionManager.balanceOf(user2.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user3.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user4.address)).to.be.not.eq(0);

            await PositionManagerDistributor.connect(user4).withdraw();
            await PositionManagerDistributor.connect(user3).withdraw();
            await PositionManagerDistributor.connect(user2).withdraw();

            expect(await PositionManager.balanceOf(user4.address)).to.be.eq(0);

            const user4USDTBalance = await USDTContract.balanceOf(user4.address);
            const user4ETHBalanceInETH = await ETHContract.balanceOf(user4.address);
            const user4ETHBalance = user4ETHBalanceInETH.mul(ethToUsdt).div(BigNumber.from(10).pow(18));
            expect(user4USDTBalance.add(user4ETHBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1.2"));

            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(0);

            const user3USDTBalance = await USDTContract.balanceOf(user3.address);
            const user3ETHBalanceInETH = await ETHContract.balanceOf(user3.address);
            const user3ETHBalance = user3ETHBalanceInETH.mul(ethToUsdt).div(BigNumber.from(10).pow(18));
            expect(user3USDTBalance.add(user3ETHBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1.5"));

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(0);

            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            const user2ETHBalanceInETH = await ETHContract.balanceOf(user2.address);
            const user2ETHBalance = user2ETHBalanceInETH.mul(ethToUsdt).div(BigNumber.from(10).pow(18));
            expect(user2USDTBalance.add(user2ETHBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1.7"));

            expect(await PositionManager.totalSupply()).to.be.eq(expectedShares);
        });

        it("Should deposit, add liquidity, and withdraw will close position, so we can deposit and add liquidity again", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));

            const expectedShares = amount.mul(usdChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await PositionManagerDistributor.connect(user1).withdraw();

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(0);

            await USDTContract.connect(deployer).transfer(user2.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));

            const expectedShares2 = amount.mul(usdChainLinkPrice);

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(expectedShares2);
        });

        it("Should add and remove liquidity 10 times, then withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            for (let i = 0; i < 10; i++) {
                await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

                expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
                expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));

                await PositionManager.connect(manager).removeLiquidity();

                expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(amount, ethers.utils.parseEther("5"));
            }

            // Lose max 5 USDT in 10 add/remove liquidity
            await PositionManagerDistributor.connect(user1).withdraw();

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            expect(user1USDTBalance).to.be.closeTo(amount, ethers.utils.parseEther("5"));
        });

        it("Should set a deposit fee and charge it in a deposit", async function () {
            const amount = ethers.utils.parseEther("1000");

            const amountAfterFee = amount.mul(900000).div(1000000);

            const amountCharged = amount.sub(amountAfterFee);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManager.connect(deployer).setFee(100000, user2.address);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amountAfterFee);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(amountAfterFee.mul(usdChainLinkPrice));

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);
            expect(user1USDTBalance).to.be.eq(0);

            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            expect(user2USDTBalance).to.be.equal(amountCharged);
        });

        it("revert: fails to distribute rewards if the contract has no balance", async function () {
            await expect(PositionManager.connect(manager).distributeRewards(0)).to.be.revertedWith("InvalidEntry");
        });

        it("should distribute to the receiver (zero users)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            // Check that exclusive manager received their 15%
            const exclusiveManagerBalance = await USDTContract.balanceOf(exclusiveManagerAddress);
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            expect(exclusiveManagerBalance).to.be.equal(expectedExclusiveManagerAmount);

            // After exclusive manager takes their cut, remaining goes to receiver
            const remainingForReceiver = amount.sub(expectedExclusiveManagerAmount);
            expect(receiverBalance).to.be.closeTo(remainingForReceiver.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.01"));
        });

        it("an user deposits and distributeRewards is called", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            expect(user1USDTBalance).to.be.eq(0);

            // Check that exclusive manager received their 15%
            const exclusiveManagerBalance = await USDTContract.balanceOf(exclusiveManagerAddress);
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            expect(exclusiveManagerBalance).to.be.equal(expectedExclusiveManagerAmount);

            // After exclusive manager takes 15%, remaining amount is distributed between receiver and users
            const remainingAfterExclusiveManager = amount.sub(expectedExclusiveManagerAmount);
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);
            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);

            expect(user1ContractUSDTBalance).to.be.equal(remainingAfterExclusiveManager.sub(expectedReceiverBalance));
        });

        it("revert: an user cannot collect rewards if the contract has no balance", async function () {
            await expect(PositionManagerDistributor.connect(user1).collectRewards()).to.be.revertedWith("InvalidEntry");
        });

        it("an user deposits, distributeRewards is called and the user collects rewards", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            await PositionManagerDistributor.connect(user1).collectRewards();

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            // First, exclusive manager takes 15%
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            const remainingAfterExclusiveManager = amount.sub(expectedExclusiveManagerAmount);

            // Then receiver takes 35% of the remaining
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            // User gets the rest
            const expectedUser1USDTBalance = remainingAfterExclusiveManager.sub(expectedReceiverBalance);

            expect(user1USDTBalance).to.be.equal(expectedUser1USDTBalance);

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);

            expect(user1ContractUSDTBalance).to.be.eq(0);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            const PositionManagerDistributorBalance = await USDTContract.balanceOf(PositionManagerDistributor.address);

            expect(PositionManagerDistributorBalance).to.be.eq(0);
        });

        it("4 users deposit differents amounts and distributeRewards is called", async function () {
            const amount1 = ethers.utils.parseEther("500");
            const amount2 = ethers.utils.parseEther("1000");
            const amount3 = ethers.utils.parseEther("1500");
            const amount4 = ethers.utils.parseEther("2000");

            await USDTContract.connect(deployer).transfer(user1.address, amount1);
            await USDTContract.connect(deployer).transfer(user2.address, amount2);
            await USDTContract.connect(deployer).transfer(user3.address, amount3);
            await USDTContract.connect(deployer).transfer(user4.address, amount4);

            await USDTContract.connect(user1).approve(PositionManager.address, amount1);
            await USDTContract.connect(user2).approve(PositionManager.address, amount2);
            await USDTContract.connect(user3).approve(PositionManager.address, amount3);
            await USDTContract.connect(user4).approve(PositionManager.address, amount4);

            await PositionManagerDistributor.connect(user1).deposit(amount1);
            await PositionManagerDistributor.connect(user2).deposit(amount2);
            await PositionManagerDistributor.connect(user3).deposit(amount3);
            await PositionManagerDistributor.connect(user4).deposit(amount4);

            const totalAmount = amount1.add(amount2).add(amount3).add(amount4);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, totalAmount);

            await PositionManager.connect(manager).distributeRewards(0);

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);
            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            const user3USDTBalance = await USDTContract.balanceOf(user3.address);
            const user4USDTBalance = await USDTContract.balanceOf(user4.address);

            expect(user1USDTBalance).to.be.eq(0);
            expect(user2USDTBalance).to.be.eq(0);
            expect(user3USDTBalance).to.be.eq(0);
            expect(user4USDTBalance).to.be.eq(0);

            // First, exclusive manager takes 15% of total amount
            const expectedExclusiveManagerAmount = totalAmount.mul(exclusiveManagerPercentage).div(maxPercentage);
            const remainingAfterExclusiveManager = totalAmount.sub(expectedExclusiveManagerAmount);

            // Then receiver takes 35% of the remaining
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.01"));

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);
            const user2ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user2.address);
            const user3ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user3.address);
            const user4ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user4.address);

            // Calculate each user's portion after exclusive manager takes their cut
            const expectedUser1USDTBalance = amount1
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount1.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser2USDTBalance = amount2
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount2.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser3USDTBalance = amount3
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount3.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser4USDTBalance = amount4
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount4.mul(expectedReceiverBalance).div(totalAmount));

            expect(user1ContractUSDTBalance).to.be.equal(expectedUser1USDTBalance);
            expect(user2ContractUSDTBalance).to.be.equal(expectedUser2USDTBalance);
            expect(user3ContractUSDTBalance).to.be.equal(expectedUser3USDTBalance);
            expect(user4ContractUSDTBalance).to.be.equal(expectedUser4USDTBalance);
        });

        it("should not send funds to exclusive manager when set to address(0)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            // Set exclusive manager to address(0) with 0% fee
            const exclusiveManagerContract = await ethers.getContractAt("PositionManagerDistributorWithExclusiveManager", PositionManagerDistributor.address);
            await exclusiveManagerContract.connect(deployer).setExclusiveManagerData(ethers.constants.AddressZero, 0);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            // Distribute rewards
            await PositionManager.connect(manager).distributeRewards(0);

            // Check that exclusive manager (address(0)) receives no funds
            const exclusiveManagerBalance = await USDTContract.balanceOf(ethers.constants.AddressZero);
            expect(exclusiveManagerBalance).to.be.equal(0);

            // Receiver should get 35% of the total amount (no deduction for exclusive manager)
            const expectedReceiverBalance = amount.mul(percentages.ReceiverPercentage).div(maxPercentage);
            const receiverBalance = await WBNBContract.balanceOf(receiver.address);
            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            // User should get remaining 65% of the total amount
            const userBalance = await PositionManagerDistributor.balanceOf(user1.address);
            const expectedUserBalance = amount.sub(expectedReceiverBalance);
            expect(userBalance).to.be.equal(expectedUserBalance);
        });

        it("revert: fails to set exclusive manager percentage over 100%", async function () {
            const exclusiveManagerContract = await ethers.getContractAt("PositionManagerDistributorWithExclusiveManager", PositionManagerDistributor.address);
            const invalidPercentage = maxPercentage.add(1); // 1,000,001 (over 100%)

            await expect(exclusiveManagerContract.connect(deployer).setExclusiveManagerData(exclusiveManagerAddress, invalidPercentage)).to.be.revertedWith(
                "InvalidEntry"
            );
        });
    });

    describe("PositionManager ETH/WBNB", function () {
        let ETHAddress = contractAddresses.ETH;

        let ETHContract: IERC20;

        const ethToUsdt: BigNumber = ethers.utils.parseEther("3359"); // 1 ETH = 3359 USDT

        const bnbChainLinkPrice: BigNumber = BigNumber.from(61540830210); // 61540830210 USDT

        const minTick: BigNumber = BigNumber.from(-887270);
        const maxTick: BigNumber = BigNumber.from(887270);

        before(async function () {
            await deployments.fixture(["PositionManagerDistributorWithExclusiveManager"]);

            PositionManagerDistributor = await ethers.getContract("PositionManagerDistributorWithExclusiveManager_3");

            [deployer, manager, user1, user2, user3, user4, receiver] = await ethers.getSigners();

            const PositionManagerAddress = await PositionManagerDistributor.sharesContract();

            PositionManager = await ethers.getContractAt("PositionManager", PositionManagerAddress);

            await PositionManager.setReceiverData(receiver.address, percentages.ReceiverPercentage);

            USDTContract = (await ethers.getContractAt("IERC20", USDTAddress)) as IERC20;
            WBNBContract = (await ethers.getContractAt("IERC20", WBNBAddress)) as IERC20;
            ETHContract = (await ethers.getContractAt("IERC20", ETHAddress)) as IERC20;

            await PositionManager.connect(deployer).grantRole(roles.POSITION_MANAGER_ROLE, manager.address);

            const holderAddress = "0x98cF4F4B03a4e967D54a3d0aeC9fCA90851f2Cca";

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [holderAddress],
            });

            await deployer.sendTransaction({
                to: holderAddress,
                value: ethers.utils.parseEther("1"), // Send 1 BNB
            });

            // Get the holder signer
            const holderSigner = await ethers.getSigner(holderAddress);

            // Send 10000 USDT to the deployer
            await USDTContract.connect(holderSigner).transfer(deployer.address, ethers.utils.parseUnits("10000", "18"));

            // Stop impersonating the holder address
            await hre.network.provider.request({
                method: "hardhat_stopImpersonatingAccount",
                params: [holderAddress],
            });
        });

        beforeEach(async function () {
            snap = await ethers.provider.send("evm_snapshot", []);
        });

        afterEach(async function () {
            await ethers.provider.send("evm_revert", [snap]);
        });

        it("Should deposit USDT into Position Manager (!inPosition)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user1).deposit(amount))
                .to.emit(PositionManager, "Deposit")
                .withArgs(user1.address, expectedShares, amount);

            const balance = await PositionManager.balanceOf(user1.address);

            expect(balance).to.be.eq(expectedShares);
        });

        it("Should deposit and withdraw USDT from Position Manager (!inPosition)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const newBalance = await PositionManager.balanceOf(user1.address);

            expect(newBalance).to.be.eq(0);
        });

        it("Should manager add liquidity to the pool", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.001"));
        });

        it("Should manager add liquidity and re add liquidity to the pool", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.001"));

            await PositionManager.connect(manager).reAddLiquidity();

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.0000001"));

            await PositionManager.connect(manager).reAddLiquidity();

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.0000000001"));
        });

        it("Should user deposit USDT after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount.mul(2));

            await USDTContract.connect(user1).approve(PositionManager.address, amount.mul(2));

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.001"));

            await expect(PositionManagerDistributor.connect(user1).deposit(amount)).to.emit(PositionManager, "Deposit");

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.001"));

            const balance = await PositionManager.balanceOf(user1.address);

            expect(balance).to.be.not.eq(0);
        });

        it("Should manager update ticks after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.001"));

            const newMinTick = minTick.add(100);
            const newMaxTick = maxTick.sub(100);

            await PositionManager.connect(manager).updatePosition(newMinTick, newMaxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.00001"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(2);

            const ticks = await PositionManager.getTickRange();

            expect(ticks[0]).to.be.eq(newMinTick);
            expect(ticks[1]).to.be.eq(newMaxTick);
        });

        it("Should user withdraw after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount.mul(2));

            await USDTContract.connect(user1).approve(PositionManager.address, amount.mul(2));

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const newBalance = await PositionManager.balanceOf(user1.address);

            expect(newBalance).to.be.eq(0);
        });

        it("Should two users deposit USDT, then add liquidity and users withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);
            await USDTContract.connect(deployer).transfer(user2.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);
            await USDTContract.connect(user2).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount.mul(2));

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.001"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user2).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user2.address, expectedShares);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.0001"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const user2NewBalance = await PositionManager.balanceOf(user2.address);

            expect(user2NewBalance).to.be.eq(0);

            const user1Balance = await PositionManager.balanceOf(user1.address);

            expect(user1Balance).to.be.eq(expectedShares);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const user1NewBalance = await PositionManager.balanceOf(user1.address);

            expect(user1NewBalance).to.be.eq(0);
        });

        it("Should deposit and add liquidity with different tick values (in range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(-887270, 887270);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.001"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.001"));
        });

        it("Should deposit and add liquidity with different tick values (under range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(16950, 16970);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should deposit and add liquidity with different tick values (over range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(-62000, -61000);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should deposit, add liquidity and remove liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.001"));

            await PositionManager.connect(manager).removeLiquidity();

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(amount, ethers.utils.parseEther("0.6"));
        });

        it("Should deposit 3 times (different users)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);
            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);
            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);
            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(expectedShares);
            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(expectedShares);
        });

        it("Should deposit user1, add liquidity, and then 3 different users deposits and withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.001"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);
            await USDTContract.connect(deployer).transfer(user4.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);
            await USDTContract.connect(user4).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user2).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);
            await PositionManagerDistributor.connect(user4).deposit(amount);

            expect(await PositionManager.balanceOf(user2.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user3.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user4.address)).to.be.not.eq(0);

            await PositionManagerDistributor.connect(user2).withdraw();
            await PositionManagerDistributor.connect(user3).withdraw();
            await PositionManagerDistributor.connect(user4).withdraw();

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(0);

            const user2WBNBBalanceInWBNB = await WBNBContract.balanceOf(user2.address);
            const user2WBNBBalance = user2WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user2ETHBalanceInETH = await ETHContract.balanceOf(user2.address);
            const user2ETHBalance = user2ETHBalanceInETH.mul(ethToUsdt).div(BigNumber.from(10).pow(18));
            expect(user2WBNBBalance.add(user2ETHBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1.5"));

            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(0);

            const user3WBNBBalanceInWBNB = await WBNBContract.balanceOf(user3.address);
            const user3WBNBBalance = user3WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user3ETHBalanceInETH = await ETHContract.balanceOf(user3.address);
            const user3ETHBalance = user3ETHBalanceInETH.mul(ethToUsdt).div(BigNumber.from(10).pow(18));
            expect(user3WBNBBalance.add(user3ETHBalance)).to.be.closeTo(amount, ethers.utils.parseEther("2.1"));

            expect(await PositionManager.balanceOf(user4.address)).to.be.eq(0);

            const user4WBNBBalanceInWBNB = await WBNBContract.balanceOf(user4.address);
            const user4WBNBBalance = user4WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user4ETHBalanceInETH = await ETHContract.balanceOf(user4.address);
            const user4ETHBalance = user4ETHBalanceInETH.mul(ethToUsdt).div(BigNumber.from(10).pow(18));
            expect(user4WBNBBalance.add(user4ETHBalance)).to.be.closeTo(amount, ethers.utils.parseEther("2.5"));

            expect(await PositionManager.totalSupply()).to.be.eq(expectedShares);
        });

        it("Should deposit user1, add liquidity, and then 3 different users deposits and withdraw in other order", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.001"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);
            await USDTContract.connect(deployer).transfer(user4.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);
            await USDTContract.connect(user4).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user4).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await PositionManager.balanceOf(user2.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user3.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user4.address)).to.be.not.eq(0);

            await PositionManagerDistributor.connect(user4).withdraw();
            await PositionManagerDistributor.connect(user3).withdraw();
            await PositionManagerDistributor.connect(user2).withdraw();

            expect(await PositionManager.balanceOf(user4.address)).to.be.eq(0);

            const user4WBNBBalanceInWBNB = await WBNBContract.balanceOf(user4.address);
            const user4WBNBBalance = user4WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user4ETHBalanceInETH = await ETHContract.balanceOf(user4.address);
            const user4ETHBalance = user4ETHBalanceInETH.mul(ethToUsdt).div(BigNumber.from(10).pow(18));
            expect(user4WBNBBalance.add(user4ETHBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1.5"));

            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(0);

            const user3WBNBBalanceInWBNB = await WBNBContract.balanceOf(user3.address);
            const user3WBNBBalance = user3WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user3ETHBalanceInETH = await ETHContract.balanceOf(user3.address);
            const user3ETHBalance = user3ETHBalanceInETH.mul(ethToUsdt).div(BigNumber.from(10).pow(18));
            expect(user3WBNBBalance.add(user3ETHBalance)).to.be.closeTo(amount, ethers.utils.parseEther("2.1"));

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(0);

            const user2WBNBBalanceInWBNB = await WBNBContract.balanceOf(user2.address);
            const user2WBNBBalance = user2WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user2ETHBalanceInETH = await ETHContract.balanceOf(user2.address);
            const user2ETHBalance = user2ETHBalanceInETH.mul(ethToUsdt).div(BigNumber.from(10).pow(18));
            expect(user2WBNBBalance.add(user2ETHBalance)).to.be.closeTo(amount, ethers.utils.parseEther("2.5"));

            expect(await PositionManager.totalSupply()).to.be.eq(expectedShares);
        });

        it("Should deposit, add liquidity, and withdraw will close position, so we can deposit and add liquidity again", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.001"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await PositionManagerDistributor.connect(user1).withdraw();

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(0);

            await USDTContract.connect(deployer).transfer(user2.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.001"));

            const expectedShares2 = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(expectedShares2);
        });

        it("Should add and remove liquidity 10 times, then withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            for (let i = 0; i < 10; i++) {
                await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

                expect(await ETHContract.balanceOf(PositionManager.address)).to.be.eq(0);
                expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.001"));

                await PositionManager.connect(manager).removeLiquidity();

                expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(amount, ethers.utils.parseEther("9"));
            }

            // Lose max 9 USDT in 10 add/remove liquidity
            await PositionManagerDistributor.connect(user1).withdraw();

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            expect(user1USDTBalance).to.be.closeTo(amount, ethers.utils.parseEther("9"));
        });

        it("Should set a deposit fee and charge it in a deposit", async function () {
            const amount = ethers.utils.parseEther("1000");

            const amountAfterFee = amount.mul(900000).div(1000000);

            const amountCharged = amount.sub(amountAfterFee);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManager.connect(deployer).setFee(100000, user2.address);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amountAfterFee);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(amountAfterFee.mul(bnbChainLinkPrice));

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);
            expect(user1USDTBalance).to.be.eq(0);

            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            expect(user2USDTBalance).to.be.equal(amountCharged);
        });

        it("revert: fails to distribute rewards if the contract has no balance", async function () {
            await expect(PositionManager.connect(manager).distributeRewards(0)).to.be.revertedWith("InvalidEntry");
        });

        it("should distribute to the receiver (zero users)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            // Check that exclusive manager received their 15%
            const exclusiveManagerBalance = await USDTContract.balanceOf(exclusiveManagerAddress);
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            expect(exclusiveManagerBalance).to.be.equal(expectedExclusiveManagerAmount);

            // After exclusive manager takes their cut, remaining goes to receiver
            const remainingForReceiver = amount.sub(expectedExclusiveManagerAmount);
            expect(receiverBalance).to.be.closeTo(remainingForReceiver.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.01"));
        });

        it("an user deposits and distributeRewards is called", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            expect(user1USDTBalance).to.be.eq(0);

            // Check that exclusive manager received their 15%
            const exclusiveManagerBalance = await USDTContract.balanceOf(exclusiveManagerAddress);
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            expect(exclusiveManagerBalance).to.be.equal(expectedExclusiveManagerAmount);

            // After exclusive manager takes 15%, remaining amount is distributed between receiver and users
            const remainingAfterExclusiveManager = amount.sub(expectedExclusiveManagerAmount);
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);
            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);

            expect(user1ContractUSDTBalance).to.be.equal(remainingAfterExclusiveManager.sub(expectedReceiverBalance));
        });

        it("revert: an user cannot collect rewards if the contract has no balance", async function () {
            await expect(PositionManagerDistributor.connect(user1).collectRewards()).to.be.revertedWith("InvalidEntry");
        });

        it("an user deposits, distributeRewards is called and the user collects rewards", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            await PositionManagerDistributor.connect(user1).collectRewards();

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            // First, exclusive manager takes 15%
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            const remainingAfterExclusiveManager = amount.sub(expectedExclusiveManagerAmount);

            // Then receiver takes 35% of the remaining
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            // User gets the rest
            const expectedUser1USDTBalance = remainingAfterExclusiveManager.sub(expectedReceiverBalance);

            expect(user1USDTBalance).to.be.equal(expectedUser1USDTBalance);

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);

            expect(user1ContractUSDTBalance).to.be.eq(0);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            const PositionManagerDistributorBalance = await USDTContract.balanceOf(PositionManagerDistributor.address);

            expect(PositionManagerDistributorBalance).to.be.eq(0);
        });

        it("4 users deposit differents amounts and distributeRewards is called", async function () {
            const amount1 = ethers.utils.parseEther("500");
            const amount2 = ethers.utils.parseEther("1000");
            const amount3 = ethers.utils.parseEther("1500");
            const amount4 = ethers.utils.parseEther("2000");

            await USDTContract.connect(deployer).transfer(user1.address, amount1);
            await USDTContract.connect(deployer).transfer(user2.address, amount2);
            await USDTContract.connect(deployer).transfer(user3.address, amount3);
            await USDTContract.connect(deployer).transfer(user4.address, amount4);

            await USDTContract.connect(user1).approve(PositionManager.address, amount1);
            await USDTContract.connect(user2).approve(PositionManager.address, amount2);
            await USDTContract.connect(user3).approve(PositionManager.address, amount3);
            await USDTContract.connect(user4).approve(PositionManager.address, amount4);

            await PositionManagerDistributor.connect(user1).deposit(amount1);
            await PositionManagerDistributor.connect(user2).deposit(amount2);
            await PositionManagerDistributor.connect(user3).deposit(amount3);
            await PositionManagerDistributor.connect(user4).deposit(amount4);

            const totalAmount = amount1.add(amount2).add(amount3).add(amount4);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, totalAmount);

            await PositionManager.connect(manager).distributeRewards(0);

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);
            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            const user3USDTBalance = await USDTContract.balanceOf(user3.address);
            const user4USDTBalance = await USDTContract.balanceOf(user4.address);

            expect(user1USDTBalance).to.be.eq(0);
            expect(user2USDTBalance).to.be.eq(0);
            expect(user3USDTBalance).to.be.eq(0);
            expect(user4USDTBalance).to.be.eq(0);

            // First, exclusive manager takes 15% of total amount
            const expectedExclusiveManagerAmount = totalAmount.mul(exclusiveManagerPercentage).div(maxPercentage);
            const remainingAfterExclusiveManager = totalAmount.sub(expectedExclusiveManagerAmount);

            // Then receiver takes 35% of the remaining
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.01"));

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);
            const user2ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user2.address);
            const user3ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user3.address);
            const user4ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user4.address);

            // Calculate each user's portion after exclusive manager takes their cut
            const expectedUser1USDTBalance = amount1
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount1.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser2USDTBalance = amount2
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount2.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser3USDTBalance = amount3
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount3.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser4USDTBalance = amount4
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount4.mul(expectedReceiverBalance).div(totalAmount));

            expect(user1ContractUSDTBalance).to.be.equal(expectedUser1USDTBalance);
            expect(user2ContractUSDTBalance).to.be.equal(expectedUser2USDTBalance);
            expect(user3ContractUSDTBalance).to.be.equal(expectedUser3USDTBalance);
            expect(user4ContractUSDTBalance).to.be.equal(expectedUser4USDTBalance);
        });

        it("should not send funds to exclusive manager when set to address(0)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            // Set exclusive manager to address(0) with 0% fee
            const exclusiveManagerContract = await ethers.getContractAt("PositionManagerDistributorWithExclusiveManager", PositionManagerDistributor.address);
            await exclusiveManagerContract.connect(deployer).setExclusiveManagerData(ethers.constants.AddressZero, 0);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            // Distribute rewards
            await PositionManager.connect(manager).distributeRewards(0);

            // Check that exclusive manager (address(0)) receives no funds
            const exclusiveManagerBalance = await USDTContract.balanceOf(ethers.constants.AddressZero);
            expect(exclusiveManagerBalance).to.be.equal(0);

            // Receiver should get 35% of the total amount (no deduction for exclusive manager)
            const expectedReceiverBalance = amount.mul(percentages.ReceiverPercentage).div(maxPercentage);
            const receiverBalance = await WBNBContract.balanceOf(receiver.address);
            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            // User should get remaining 65% of the total amount
            const userBalance = await PositionManagerDistributor.balanceOf(user1.address);
            const expectedUserBalance = amount.sub(expectedReceiverBalance);
            expect(userBalance).to.be.equal(expectedUserBalance);
        });

        it("revert: fails to set exclusive manager percentage over 100%", async function () {
            const exclusiveManagerContract = await ethers.getContractAt("PositionManagerDistributorWithExclusiveManager", PositionManagerDistributor.address);
            const invalidPercentage = maxPercentage.add(1); // 1,000,001 (over 100%)

            await expect(exclusiveManagerContract.connect(deployer).setExclusiveManagerData(exclusiveManagerAddress, invalidPercentage)).to.be.revertedWith(
                "InvalidEntry"
            );
        });
    });

    describe("PositionManager USDT/BTCB", function () {
        let BTCBAddress = contractAddresses.BTCB;

        let BTCBContract: IERC20;

        const btcbToUsdt: BigNumber = ethers.utils.parseEther("92800.0418671");

        const btcbChainLinkPrice: BigNumber = ethers.utils.parseEther("0.000009266215747491");

        const minTick: BigNumber = BigNumber.from(-887270);
        const maxTick: BigNumber = BigNumber.from(887270);

        before(async function () {
            await deployments.fixture(["PositionManagerDistributorWithExclusiveManager"]);

            PositionManagerDistributor = await ethers.getContract("PositionManagerDistributorWithExclusiveManager_4");

            [deployer, manager, user1, user2, user3, user4, receiver] = await ethers.getSigners();

            const PositionManagerAddress = await PositionManagerDistributor.sharesContract();

            PositionManager = await ethers.getContractAt("PositionManager", PositionManagerAddress);

            await PositionManager.setReceiverData(receiver.address, percentages.ReceiverPercentage);

            USDTContract = (await ethers.getContractAt("IERC20", USDTAddress)) as IERC20;
            BTCBContract = (await ethers.getContractAt("IERC20", BTCBAddress)) as IERC20;
            WBNBContract = (await ethers.getContractAt("IERC20", WBNBAddress)) as IERC20;

            await PositionManager.connect(deployer).grantRole(roles.POSITION_MANAGER_ROLE, manager.address);

            const holderAddress = "0x98cF4F4B03a4e967D54a3d0aeC9fCA90851f2Cca";

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [holderAddress],
            });

            await deployer.sendTransaction({
                to: holderAddress,
                value: ethers.utils.parseEther("1"), // Send 1 BNB
            });

            // Get the holder signer
            const holderSigner = await ethers.getSigner(holderAddress);

            // Send 10000 USDT to the deployer
            await USDTContract.connect(holderSigner).transfer(deployer.address, ethers.utils.parseUnits("10000", "18"));

            // Stop impersonating the holder address
            await hre.network.provider.request({
                method: "hardhat_stopImpersonatingAccount",
                params: [holderAddress],
            });
        });

        beforeEach(async function () {
            snap = await ethers.provider.send("evm_snapshot", []);
        });

        afterEach(async function () {
            await ethers.provider.send("evm_revert", [snap]);
        });

        it("Should deposit USDT into Position Manager (!inPosition)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            const expectedShares = amount.mul(btcbChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user1).deposit(amount))
                .to.emit(PositionManager, "Deposit")
                .withArgs(user1.address, expectedShares, amount);

            const balance = await PositionManager.balanceOf(user1.address);

            expect(balance).to.be.eq(expectedShares);
        });

        it("Should deposit and withdraw USDT from Position Manager (!inPosition)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            const expectedShares = amount.mul(btcbChainLinkPrice);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const newBalance = await PositionManager.balanceOf(user1.address);

            expect(newBalance).to.be.eq(0);
        });

        it("Should manager add liquidity to the pool", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should manager add liquidity and re add liquidity to the pool", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            await PositionManager.connect(manager).reAddLiquidity();

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.0001"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            await PositionManager.connect(manager).reAddLiquidity();

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.0000001"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should user deposit USDT after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount.mul(2));

            await USDTContract.connect(user1).approve(PositionManager.address, amount.mul(2));

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            await expect(PositionManagerDistributor.connect(user1).deposit(amount)).to.emit(PositionManager, "Deposit");

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.4"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const balance = await PositionManager.balanceOf(user1.address);

            expect(balance).to.be.not.eq(0);
        });

        it("Should manager update ticks after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount.mul(2));

            await USDTContract.connect(user1).approve(PositionManager.address, amount.mul(2));

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const newMinTick = minTick.add(100);
            const newMaxTick = maxTick.sub(100);

            await PositionManager.connect(manager).updatePosition(newMinTick, newMaxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const ticks = await PositionManager.getTickRange();

            expect(ticks[0]).to.be.eq(newMinTick);
            expect(ticks[1]).to.be.eq(newMaxTick);
        });

        it("Should user withdraw after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount.mul(2));

            await USDTContract.connect(user1).approve(PositionManager.address, amount.mul(2));

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(btcbChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const newBalance = await PositionManager.balanceOf(user1.address);

            expect(newBalance).to.be.eq(0);
        });

        it("Should two users deposit USDT, then add liquidity and users withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);
            await USDTContract.connect(deployer).transfer(user2.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);
            await USDTContract.connect(user2).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount.mul(2));

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.5"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(btcbChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user2).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user2.address, expectedShares);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.1"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const user2NewBalance = await PositionManager.balanceOf(user2.address);

            expect(user2NewBalance).to.be.eq(0);

            const user1Balance = await PositionManager.balanceOf(user1.address);

            expect(user1Balance).to.be.eq(expectedShares);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const user1NewBalance = await PositionManager.balanceOf(user1.address);

            expect(user1NewBalance).to.be.eq(0);
        });

        it("Should deposit and add liquidity with different tick values (in range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(-887270, 887270);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(btcbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.4"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should deposit and add liquidity with different tick values (under range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(0, 887270);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(btcbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should deposit and add liquidity with different tick values (over range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(-887270, -200000);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(btcbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should deposit, add liquidity and remove liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            await PositionManager.connect(manager).removeLiquidity();

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(amount, ethers.utils.parseEther("0.5"));
        });

        it("Should deposit 3 times (different users)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);
            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);
            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);

            const expectedShares = amount.mul(btcbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);
            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(expectedShares);
            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(expectedShares);
        });

        it("Should deposit user1, add liquidity, and then 3 different users deposits and withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(btcbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);
            await USDTContract.connect(deployer).transfer(user4.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);
            await USDTContract.connect(user4).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user2).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);
            await PositionManagerDistributor.connect(user4).deposit(amount);

            expect(await PositionManager.balanceOf(user2.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user3.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user4.address)).to.be.not.eq(0);

            await PositionManagerDistributor.connect(user2).withdraw();
            await PositionManagerDistributor.connect(user3).withdraw();
            await PositionManagerDistributor.connect(user4).withdraw();

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(0);

            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            const user2BTCBBalanceInBTCB = await BTCBContract.balanceOf(user2.address);
            const user2BTCBBalance = user2BTCBBalanceInBTCB.mul(btcbToUsdt).div(BigNumber.from(10).pow(18));
            expect(user2USDTBalance.add(user2BTCBBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.05"));

            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(0);

            const user3USDTBalance = await USDTContract.balanceOf(user3.address);
            const user3BTCBBalanceInBTCB = await BTCBContract.balanceOf(user3.address);
            const user3BTCBBalance = user3BTCBBalanceInBTCB.mul(btcbToUsdt).div(BigNumber.from(10).pow(18));
            expect(user3USDTBalance.add(user3BTCBBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.6"));

            expect(await PositionManager.balanceOf(user4.address)).to.be.eq(0);

            const user4USDTBalance = await USDTContract.balanceOf(user4.address);
            const user4BTCBBalanceInBTCB = await BTCBContract.balanceOf(user4.address);
            const user4BTCBBalance = user4BTCBBalanceInBTCB.mul(btcbToUsdt).div(BigNumber.from(10).pow(18));
            expect(user4USDTBalance.add(user4BTCBBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1"));

            expect(await PositionManager.totalSupply()).to.be.eq(expectedShares);
        });

        it("Should deposit user1, add liquidity, and then 3 different users deposits and withdraw in other order", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(btcbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);
            await USDTContract.connect(deployer).transfer(user4.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);
            await USDTContract.connect(user4).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user4).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await PositionManager.balanceOf(user2.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user3.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user4.address)).to.be.not.eq(0);

            await PositionManagerDistributor.connect(user4).withdraw();
            await PositionManagerDistributor.connect(user3).withdraw();
            await PositionManagerDistributor.connect(user2).withdraw();

            expect(await PositionManager.balanceOf(user4.address)).to.be.eq(0);

            const user4USDTBalance = await USDTContract.balanceOf(user4.address);
            const user4BTCBBalanceInBTCB = await BTCBContract.balanceOf(user4.address);
            const user4BTCBBalance = user4BTCBBalanceInBTCB.mul(btcbToUsdt).div(BigNumber.from(10).pow(18));
            expect(user4USDTBalance.add(user4BTCBBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.05"));

            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(0);

            const user3USDTBalance = await USDTContract.balanceOf(user3.address);
            const user3BTCBBalanceInBTCB = await BTCBContract.balanceOf(user3.address);
            const user3BTCBBalance = user3BTCBBalanceInBTCB.mul(btcbToUsdt).div(BigNumber.from(10).pow(18));
            expect(user3USDTBalance.add(user3BTCBBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.6"));

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(0);

            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            const user2BTCBBalanceInBTCB = await BTCBContract.balanceOf(user2.address);
            const user2BTCBBalance = user2BTCBBalanceInBTCB.mul(btcbToUsdt).div(BigNumber.from(10).pow(18));
            expect(user2USDTBalance.add(user2BTCBBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1"));

            expect(await PositionManager.totalSupply()).to.be.eq(expectedShares);
        });

        it("Should deposit, add liquidity, and withdraw will close position, so we can deposit and add liquidity again", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(btcbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await PositionManagerDistributor.connect(user1).withdraw();

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(0);

            await USDTContract.connect(deployer).transfer(user2.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));
            expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares2 = amount.mul(btcbChainLinkPrice);

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(expectedShares2);
        });

        it("Should add and remove liquidity 10 times, then withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            for (let i = 0; i < 10; i++) {
                await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

                expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.3"));
                expect(await BTCBContract.balanceOf(PositionManager.address)).to.be.eq(0);

                await PositionManager.connect(manager).removeLiquidity();

                expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(amount, ethers.utils.parseEther("5"));
            }

            // Lose max 5 USDT in 10 add/remove liquidity
            await PositionManagerDistributor.connect(user1).withdraw();

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            expect(user1USDTBalance).to.be.closeTo(amount, ethers.utils.parseEther("5"));
        });

        it("Should set a deposit fee and charge it in a deposit", async function () {
            const amount = ethers.utils.parseEther("1000");

            const amountAfterFee = amount.mul(900000).div(1000000);

            const amountCharged = amount.sub(amountAfterFee);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManager.connect(deployer).setFee(100000, user2.address);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amountAfterFee);

            expect(await PositionManager.balanceOf(user1.address)).to.be.closeTo(
                amountAfterFee.mul(btcbChainLinkPrice),
                ethers.utils.parseEther("100000000000000")
            );

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);
            expect(user1USDTBalance).to.be.eq(0);

            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            expect(user2USDTBalance).to.be.equal(amountCharged);
        });

        it("revert: fails to distribute rewards if the contract has no balance", async function () {
            await expect(PositionManager.connect(manager).distributeRewards(0)).to.be.revertedWith("InvalidEntry");
        });

        it("should distribute to the receiver (zero users)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            // Check that exclusive manager received their 15%
            const exclusiveManagerBalance = await USDTContract.balanceOf(exclusiveManagerAddress);
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            expect(exclusiveManagerBalance).to.be.equal(expectedExclusiveManagerAmount);

            // After exclusive manager takes their cut, remaining goes to receiver
            const remainingForReceiver = amount.sub(expectedExclusiveManagerAmount);
            expect(receiverBalance).to.be.closeTo(remainingForReceiver.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.01"));
        });

        it("an user deposits and distributeRewards is called", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            expect(user1USDTBalance).to.be.eq(0);

            // Check that exclusive manager received their 15%
            const exclusiveManagerBalance = await USDTContract.balanceOf(exclusiveManagerAddress);
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            expect(exclusiveManagerBalance).to.be.equal(expectedExclusiveManagerAmount);

            // After exclusive manager takes 15%, remaining amount is distributed between receiver and users
            const remainingAfterExclusiveManager = amount.sub(expectedExclusiveManagerAmount);
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);
            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);

            expect(user1ContractUSDTBalance).to.be.equal(remainingAfterExclusiveManager.sub(expectedReceiverBalance));
        });

        it("revert: an user cannot collect rewards if the contract has no balance", async function () {
            await expect(PositionManagerDistributor.connect(user1).collectRewards()).to.be.revertedWith("InvalidEntry");
        });

        it("an user deposits, distributeRewards is called and the user collects rewards", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            await PositionManagerDistributor.connect(user1).collectRewards();

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            // First, exclusive manager takes 15%
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            const remainingAfterExclusiveManager = amount.sub(expectedExclusiveManagerAmount);

            // Then receiver takes 35% of the remaining
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            // User gets the rest
            const expectedUser1USDTBalance = remainingAfterExclusiveManager.sub(expectedReceiverBalance);

            expect(user1USDTBalance).to.be.equal(expectedUser1USDTBalance);

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);

            expect(user1ContractUSDTBalance).to.be.eq(0);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            const PositionManagerDistributorBalance = await USDTContract.balanceOf(PositionManagerDistributor.address);

            expect(PositionManagerDistributorBalance).to.be.eq(0);
        });

        it("4 users deposit differents amounts and distributeRewards is called", async function () {
            const amount1 = ethers.utils.parseEther("500");
            const amount2 = ethers.utils.parseEther("1000");
            const amount3 = ethers.utils.parseEther("1500");
            const amount4 = ethers.utils.parseEther("2000");

            await USDTContract.connect(deployer).transfer(user1.address, amount1);
            await USDTContract.connect(deployer).transfer(user2.address, amount2);
            await USDTContract.connect(deployer).transfer(user3.address, amount3);
            await USDTContract.connect(deployer).transfer(user4.address, amount4);

            await USDTContract.connect(user1).approve(PositionManager.address, amount1);
            await USDTContract.connect(user2).approve(PositionManager.address, amount2);
            await USDTContract.connect(user3).approve(PositionManager.address, amount3);
            await USDTContract.connect(user4).approve(PositionManager.address, amount4);

            await PositionManagerDistributor.connect(user1).deposit(amount1);
            await PositionManagerDistributor.connect(user2).deposit(amount2);
            await PositionManagerDistributor.connect(user3).deposit(amount3);
            await PositionManagerDistributor.connect(user4).deposit(amount4);

            const totalAmount = amount1.add(amount2).add(amount3).add(amount4);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, totalAmount);

            await PositionManager.connect(manager).distributeRewards(0);

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);
            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            const user3USDTBalance = await USDTContract.balanceOf(user3.address);
            const user4USDTBalance = await USDTContract.balanceOf(user4.address);

            expect(user1USDTBalance).to.be.eq(0);
            expect(user2USDTBalance).to.be.eq(0);
            expect(user3USDTBalance).to.be.eq(0);
            expect(user4USDTBalance).to.be.eq(0);

            // First, exclusive manager takes 15% of total amount
            const expectedExclusiveManagerAmount = totalAmount.mul(exclusiveManagerPercentage).div(maxPercentage);
            const remainingAfterExclusiveManager = totalAmount.sub(expectedExclusiveManagerAmount);

            // Then receiver takes 35% of the remaining
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.01"));

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);
            const user2ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user2.address);
            const user3ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user3.address);
            const user4ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user4.address);

            // Calculate each user's portion after exclusive manager takes their cut
            const expectedUser1USDTBalance = amount1
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount1.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser2USDTBalance = amount2
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount2.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser3USDTBalance = amount3
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount3.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser4USDTBalance = amount4
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount4.mul(expectedReceiverBalance).div(totalAmount));

            expect(user1ContractUSDTBalance).to.be.equal(expectedUser1USDTBalance);
            expect(user2ContractUSDTBalance).to.be.equal(expectedUser2USDTBalance);
            expect(user3ContractUSDTBalance).to.be.equal(expectedUser3USDTBalance);
            expect(user4ContractUSDTBalance).to.be.equal(expectedUser4USDTBalance);
        });

        it("should not send funds to exclusive manager when set to address(0)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            // Set exclusive manager to address(0) with 0% fee
            const exclusiveManagerContract = await ethers.getContractAt("PositionManagerDistributorWithExclusiveManager", PositionManagerDistributor.address);
            await exclusiveManagerContract.connect(deployer).setExclusiveManagerData(ethers.constants.AddressZero, 0);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            // Distribute rewards
            await PositionManager.connect(manager).distributeRewards(0);

            // Check that exclusive manager (address(0)) receives no funds
            const exclusiveManagerBalance = await USDTContract.balanceOf(ethers.constants.AddressZero);
            expect(exclusiveManagerBalance).to.be.equal(0);

            // Receiver should get 35% of the total amount (no deduction for exclusive manager)
            const expectedReceiverBalance = amount.mul(percentages.ReceiverPercentage).div(maxPercentage);
            const receiverBalance = await WBNBContract.balanceOf(receiver.address);
            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            // User should get remaining 65% of the total amount
            const userBalance = await PositionManagerDistributor.balanceOf(user1.address);
            const expectedUserBalance = amount.sub(expectedReceiverBalance);
            expect(userBalance).to.be.equal(expectedUserBalance);
        });

        it("revert: fails to set exclusive manager percentage over 100%", async function () {
            const exclusiveManagerContract = await ethers.getContractAt("PositionManagerDistributorWithExclusiveManager", PositionManagerDistributor.address);
            const invalidPercentage = maxPercentage.add(1); // 1,000,001 (over 100%)

            await expect(exclusiveManagerContract.connect(deployer).setExclusiveManagerData(exclusiveManagerAddress, invalidPercentage)).to.be.revertedWith(
                "InvalidEntry"
            );
        });
    });

    describe("PositionManager XRP/WBNB", function () {
        let XRPAddress = contractAddresses.XRP;

        let XRPContract: IERC20;

        const xrpToUsdt: BigNumber = ethers.utils.parseEther("1.387445"); // 1 XRP = 1.387445 USDT

        const bnbChainLinkPrice: BigNumber = BigNumber.from(61540830210); // 61540830210 USDT

        const minTick: BigNumber = BigNumber.from(-887250);
        const maxTick: BigNumber = BigNumber.from(887250);

        before(async function () {
            await deployments.fixture(["PositionManagerDistributorWithExclusiveManager"]);

            PositionManagerDistributor = await ethers.getContract("PositionManagerDistributorWithExclusiveManager_5");

            [deployer, manager, user1, user2, user3, user4, receiver] = await ethers.getSigners();

            const PositionManagerAddress = await PositionManagerDistributor.sharesContract();

            PositionManager = await ethers.getContractAt("PositionManager", PositionManagerAddress);

            await PositionManager.setReceiverData(receiver.address, percentages.ReceiverPercentage);

            USDTContract = (await ethers.getContractAt("IERC20", USDTAddress)) as IERC20;
            WBNBContract = (await ethers.getContractAt("IERC20", WBNBAddress)) as IERC20;
            XRPContract = (await ethers.getContractAt("IERC20", XRPAddress)) as IERC20;

            await PositionManager.connect(deployer).grantRole(roles.POSITION_MANAGER_ROLE, manager.address);

            const holderAddress = "0x98cF4F4B03a4e967D54a3d0aeC9fCA90851f2Cca";

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [holderAddress],
            });

            await deployer.sendTransaction({
                to: holderAddress,
                value: ethers.utils.parseEther("1"), // Send 1 BNB
            });

            // Get the holder signer
            const holderSigner = await ethers.getSigner(holderAddress);

            // Send 10000 USDT to the deployer
            await USDTContract.connect(holderSigner).transfer(deployer.address, ethers.utils.parseUnits("10000", "18"));

            // Stop impersonating the holder address
            await hre.network.provider.request({
                method: "hardhat_stopImpersonatingAccount",
                params: [holderAddress],
            });
        });

        beforeEach(async function () {
            snap = await ethers.provider.send("evm_snapshot", []);
        });

        afterEach(async function () {
            await ethers.provider.send("evm_revert", [snap]);
        });

        it("Should deposit USDT into Position Manager (!inPosition)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user1).deposit(amount))
                .to.emit(PositionManager, "Deposit")
                .withArgs(user1.address, expectedShares, amount);

            const balance = await PositionManager.balanceOf(user1.address);

            expect(balance).to.be.eq(expectedShares);
        });

        it("Should deposit and withdraw USDT from Position Manager (!inPosition)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const newBalance = await PositionManager.balanceOf(user1.address);

            expect(newBalance).to.be.eq(0);
        });

        it("Should manager add liquidity to the pool", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 15);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));
        });

        it("Should manager add liquidity and re add liquidity to the pool", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 15);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            await PositionManager.connect(manager).reAddLiquidity();

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 10);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.00001"));

            await PositionManager.connect(manager).reAddLiquidity();

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 15);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.00000001"));
        });

        it("Should user deposit USDT after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount.mul(2));

            await USDTContract.connect(user1).approve(PositionManager.address, amount.mul(2));

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 15);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            await expect(PositionManagerDistributor.connect(user1).deposit(amount)).to.emit(PositionManager, "Deposit");

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 15);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const balance = await PositionManager.balanceOf(user1.address);

            expect(balance).to.be.not.eq(0);
        });

        it("Should manager update ticks after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 15);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const newMinTick = minTick.add(100);
            const newMaxTick = maxTick.sub(100);

            await PositionManager.connect(manager).updatePosition(newMinTick, newMaxTick);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const ticks = await PositionManager.getTickRange();

            expect(ticks[0]).to.be.eq(newMinTick);
            expect(ticks[1]).to.be.eq(newMaxTick);
        });

        it("Should user withdraw after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount.mul(2));

            await USDTContract.connect(user1).approve(PositionManager.address, amount.mul(2));

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 15);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const newBalance = await PositionManager.balanceOf(user1.address);

            expect(newBalance).to.be.eq(0);
        });

        it("Should two users deposit USDT, then add liquidity and users withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);
            await USDTContract.connect(deployer).transfer(user2.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);
            await USDTContract.connect(user2).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount.mul(2));

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 20);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user2).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user2.address, expectedShares);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const user2NewBalance = await PositionManager.balanceOf(user2.address);

            expect(user2NewBalance).to.be.eq(0);

            const user1Balance = await PositionManager.balanceOf(user1.address);

            expect(user1Balance).to.be.eq(expectedShares);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const user1NewBalance = await PositionManager.balanceOf(user1.address);

            expect(user1NewBalance).to.be.eq(0);
        });

        it("Should deposit and add liquidity with different tick values (in range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 15);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 15);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));
        });

        it("Should deposit and add liquidity with different tick values (under range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(-60000, -50000);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 10);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 10);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should deposit and add liquidity with different tick values (over range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(-62000, -61000);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should deposit, add liquidity and remove liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 15);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            await PositionManager.connect(manager).removeLiquidity();

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(amount, ethers.utils.parseEther("3"));
        });

        it("Should deposit 3 times (different users)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);
            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);
            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);
            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(expectedShares);
            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(expectedShares);
        });

        it("Should deposit user1, add liquidity, and then 3 different users deposits and withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 15);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);
            await USDTContract.connect(deployer).transfer(user4.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);
            await USDTContract.connect(user4).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user2).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);
            await PositionManagerDistributor.connect(user4).deposit(amount);

            expect(await PositionManager.balanceOf(user2.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user3.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user4.address)).to.be.not.eq(0);

            await PositionManagerDistributor.connect(user2).withdraw();
            await PositionManagerDistributor.connect(user3).withdraw();
            await PositionManagerDistributor.connect(user4).withdraw();

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(0);

            const user2WBNBBalanceInWBNB = await WBNBContract.balanceOf(user2.address);
            const user2WBNBBalance = user2WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user2XRPBalanceInXRP = await XRPContract.balanceOf(user2.address);
            const user2XRPBalance = user2XRPBalanceInXRP.mul(xrpToUsdt).div(BigNumber.from(10).pow(18));
            expect(user2WBNBBalance.add(user2XRPBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.3"));

            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(0);

            const user3WBNBBalanceInWBNB = await WBNBContract.balanceOf(user3.address);
            const user3WBNBBalance = user3WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user3XRPBalanceInXRP = await XRPContract.balanceOf(user3.address);
            const user3XRPBalance = user3XRPBalanceInXRP.mul(xrpToUsdt).div(BigNumber.from(10).pow(18));
            expect(user3WBNBBalance.add(user3XRPBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.8"));

            expect(await PositionManager.balanceOf(user4.address)).to.be.eq(0);

            const user4WBNBBalanceInWBNB = await WBNBContract.balanceOf(user4.address);
            const user4WBNBBalance = user4WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user4XRPBalanceInXRP = await XRPContract.balanceOf(user4.address);
            const user4XRPBalance = user4XRPBalanceInXRP.mul(xrpToUsdt).div(BigNumber.from(10).pow(18));
            expect(user4WBNBBalance.add(user4XRPBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1.6"));

            expect(await PositionManager.totalSupply()).to.be.eq(expectedShares);
        });

        it("Should deposit user1, add liquidity, and then 3 different users deposits and withdraw in other order", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 15);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);
            await USDTContract.connect(deployer).transfer(user4.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);
            await USDTContract.connect(user4).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user4).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await PositionManager.balanceOf(user2.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user3.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user4.address)).to.be.not.eq(0);

            await PositionManagerDistributor.connect(user4).withdraw();
            await PositionManagerDistributor.connect(user3).withdraw();
            await PositionManagerDistributor.connect(user2).withdraw();

            expect(await PositionManager.balanceOf(user4.address)).to.be.eq(0);

            const user4WBNBBalanceInWBNB = await WBNBContract.balanceOf(user4.address);
            const user4WBNBBalance = user4WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user4XRPBalanceInXRP = await XRPContract.balanceOf(user4.address);
            const user4XRPBalance = user4XRPBalanceInXRP.mul(xrpToUsdt).div(BigNumber.from(10).pow(18));
            expect(user4WBNBBalance.add(user4XRPBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.3"));

            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(0);

            const user3WBNBBalanceInWBNB = await WBNBContract.balanceOf(user3.address);
            const user3WBNBBalance = user3WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user3XRPBalanceInXRP = await XRPContract.balanceOf(user3.address);
            const user3XRPBalance = user3XRPBalanceInXRP.mul(xrpToUsdt).div(BigNumber.from(10).pow(18));
            expect(user3WBNBBalance.add(user3XRPBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.8"));

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(0);

            const user2WBNBBalanceInWBNB = await WBNBContract.balanceOf(user2.address);
            const user2WBNBBalance = user2WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user2XRPBalanceInXRP = await XRPContract.balanceOf(user2.address);
            const user2XRPBalance = user2XRPBalanceInXRP.mul(xrpToUsdt).div(BigNumber.from(10).pow(18));
            expect(user2WBNBBalance.add(user2XRPBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1.6"));

            expect(await PositionManager.totalSupply()).to.be.eq(expectedShares);
        });

        it("Should deposit, add liquidity, and withdraw will close position, so we can deposit and add liquidity again", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 15);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await PositionManagerDistributor.connect(user1).withdraw();

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(0);

            await USDTContract.connect(deployer).transfer(user2.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 20);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const expectedShares2 = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(expectedShares2);
        });

        it("Should add and remove liquidity 10 times, then withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            for (let i = 0; i < 10; i++) {
                await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

                expect(await XRPContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 20);
                expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

                await PositionManager.connect(manager).removeLiquidity();

                expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(amount, ethers.utils.parseEther("26"));
            }

            // Lose max 26 USDT in 10 add/remove liquidity
            await PositionManagerDistributor.connect(user1).withdraw();

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            expect(user1USDTBalance).to.be.closeTo(amount, ethers.utils.parseEther("26"));
        });

        it("Should set a deposit fee and charge it in a deposit", async function () {
            const amount = ethers.utils.parseEther("1000");

            const amountAfterFee = amount.mul(900000).div(1000000);

            const amountCharged = amount.sub(amountAfterFee);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManager.connect(deployer).setFee(100000, user2.address);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amountAfterFee);

            expect(await PositionManager.balanceOf(user1.address)).to.be.closeTo(amountAfterFee.mul(bnbChainLinkPrice), ethers.utils.parseEther("1"));

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);
            expect(user1USDTBalance).to.be.eq(0);

            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            expect(user2USDTBalance).to.be.equal(amountCharged);
        });

        it("revert: fails to distribute rewards if the contract has no balance", async function () {
            await expect(PositionManager.connect(manager).distributeRewards(0)).to.be.revertedWith("InvalidEntry");
        });

        it("should distribute to the receiver (zero users)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            // Check that exclusive manager received their 15%
            const exclusiveManagerBalance = await USDTContract.balanceOf(exclusiveManagerAddress);
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            expect(exclusiveManagerBalance).to.be.equal(expectedExclusiveManagerAmount);

            // After exclusive manager takes their cut, remaining goes to receiver
            const remainingForReceiver = amount.sub(expectedExclusiveManagerAmount);
            expect(receiverBalance).to.be.closeTo(remainingForReceiver.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.01"));
        });

        it("an user deposits and distributeRewards is called", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            expect(user1USDTBalance).to.be.eq(0);

            // Check that exclusive manager received their 15%
            const exclusiveManagerBalance = await USDTContract.balanceOf(exclusiveManagerAddress);
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            expect(exclusiveManagerBalance).to.be.equal(expectedExclusiveManagerAmount);

            // After exclusive manager takes 15%, remaining amount is distributed between receiver and users
            const remainingAfterExclusiveManager = amount.sub(expectedExclusiveManagerAmount);
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);
            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);

            expect(user1ContractUSDTBalance).to.be.equal(remainingAfterExclusiveManager.sub(expectedReceiverBalance));
        });

        it("revert: an user cannot collect rewards if the contract has no balance", async function () {
            await expect(PositionManagerDistributor.connect(user1).collectRewards()).to.be.revertedWith("InvalidEntry");
        });

        it("an user deposits, distributeRewards is called and the user collects rewards", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            await PositionManagerDistributor.connect(user1).collectRewards();

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            // First, exclusive manager takes 15%
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            const remainingAfterExclusiveManager = amount.sub(expectedExclusiveManagerAmount);

            // Then receiver takes 35% of the remaining
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            // User gets the rest
            const expectedUser1USDTBalance = remainingAfterExclusiveManager.sub(expectedReceiverBalance);

            expect(user1USDTBalance).to.be.equal(expectedUser1USDTBalance);

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);

            expect(user1ContractUSDTBalance).to.be.eq(0);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            const PositionManagerDistributorBalance = await USDTContract.balanceOf(PositionManagerDistributor.address);

            expect(PositionManagerDistributorBalance).to.be.eq(0);
        });

        it("4 users deposit differents amounts and distributeRewards is called", async function () {
            const amount1 = ethers.utils.parseEther("500");
            const amount2 = ethers.utils.parseEther("1000");
            const amount3 = ethers.utils.parseEther("1500");
            const amount4 = ethers.utils.parseEther("2000");

            await USDTContract.connect(deployer).transfer(user1.address, amount1);
            await USDTContract.connect(deployer).transfer(user2.address, amount2);
            await USDTContract.connect(deployer).transfer(user3.address, amount3);
            await USDTContract.connect(deployer).transfer(user4.address, amount4);

            await USDTContract.connect(user1).approve(PositionManager.address, amount1);
            await USDTContract.connect(user2).approve(PositionManager.address, amount2);
            await USDTContract.connect(user3).approve(PositionManager.address, amount3);
            await USDTContract.connect(user4).approve(PositionManager.address, amount4);

            await PositionManagerDistributor.connect(user1).deposit(amount1);
            await PositionManagerDistributor.connect(user2).deposit(amount2);
            await PositionManagerDistributor.connect(user3).deposit(amount3);
            await PositionManagerDistributor.connect(user4).deposit(amount4);

            const totalAmount = amount1.add(amount2).add(amount3).add(amount4);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, totalAmount);

            await PositionManager.connect(manager).distributeRewards(0);

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);
            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            const user3USDTBalance = await USDTContract.balanceOf(user3.address);
            const user4USDTBalance = await USDTContract.balanceOf(user4.address);

            expect(user1USDTBalance).to.be.eq(0);
            expect(user2USDTBalance).to.be.eq(0);
            expect(user3USDTBalance).to.be.eq(0);
            expect(user4USDTBalance).to.be.eq(0);

            // First, exclusive manager takes 15% of total amount
            const expectedExclusiveManagerAmount = totalAmount.mul(exclusiveManagerPercentage).div(maxPercentage);
            const remainingAfterExclusiveManager = totalAmount.sub(expectedExclusiveManagerAmount);

            // Then receiver takes 35% of the remaining
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.01"));

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);
            const user2ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user2.address);
            const user3ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user3.address);
            const user4ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user4.address);

            // Calculate each user's portion after exclusive manager takes their cut
            const expectedUser1USDTBalance = amount1
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount1.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser2USDTBalance = amount2
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount2.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser3USDTBalance = amount3
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount3.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser4USDTBalance = amount4
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount4.mul(expectedReceiverBalance).div(totalAmount));

            expect(user1ContractUSDTBalance).to.be.equal(expectedUser1USDTBalance);
            expect(user2ContractUSDTBalance).to.be.equal(expectedUser2USDTBalance);
            expect(user3ContractUSDTBalance).to.be.equal(expectedUser3USDTBalance);
            expect(user4ContractUSDTBalance).to.be.equal(expectedUser4USDTBalance);
        });

        it("should not send funds to exclusive manager when set to address(0)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            // Set exclusive manager to address(0) with 0% fee
            const exclusiveManagerContract = await ethers.getContractAt("PositionManagerDistributorWithExclusiveManager", PositionManagerDistributor.address);
            await exclusiveManagerContract.connect(deployer).setExclusiveManagerData(ethers.constants.AddressZero, 0);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            // Distribute rewards
            await PositionManager.connect(manager).distributeRewards(0);

            // Check that exclusive manager (address(0)) receives no funds
            const exclusiveManagerBalance = await USDTContract.balanceOf(ethers.constants.AddressZero);
            expect(exclusiveManagerBalance).to.be.equal(0);

            // Receiver should get 35% of the total amount (no deduction for exclusive manager)
            const expectedReceiverBalance = amount.mul(percentages.ReceiverPercentage).div(maxPercentage);
            const receiverBalance = await WBNBContract.balanceOf(receiver.address);
            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            // User should get remaining 65% of the total amount
            const userBalance = await PositionManagerDistributor.balanceOf(user1.address);
            const expectedUserBalance = amount.sub(expectedReceiverBalance);
            expect(userBalance).to.be.equal(expectedUserBalance);
        });

        it("revert: fails to set exclusive manager percentage over 100%", async function () {
            const exclusiveManagerContract = await ethers.getContractAt("PositionManagerDistributorWithExclusiveManager", PositionManagerDistributor.address);
            const invalidPercentage = maxPercentage.add(1); // 1,000,001 (over 100%)

            await expect(exclusiveManagerContract.connect(deployer).setExclusiveManagerData(exclusiveManagerAddress, invalidPercentage)).to.be.revertedWith(
                "InvalidEntry"
            );
        });
    });

    describe("PositionManager SOL/WBNB", function () {
        let SOLAddress = contractAddresses.SOL;

        let SOLContract: IERC20;

        const solToUsdt: BigNumber = ethers.utils.parseEther("232.602847"); // 1 SOL = 232.602847 USDT

        const bnbChainLinkPrice: BigNumber = BigNumber.from(61540830210); // 61540830210 USDT

        const minTick: BigNumber = BigNumber.from(-887250);
        const maxTick: BigNumber = BigNumber.from(887250);

        before(async function () {
            await deployments.fixture(["PositionManagerDistributorWithExclusiveManager"]);

            PositionManagerDistributor = await ethers.getContract("PositionManagerDistributorWithExclusiveManager_7");

            [deployer, manager, user1, user2, user3, user4, receiver] = await ethers.getSigners();

            const PositionManagerAddress = await PositionManagerDistributor.sharesContract();

            PositionManager = await ethers.getContractAt("PositionManager", PositionManagerAddress);

            await PositionManager.setReceiverData(receiver.address, percentages.ReceiverPercentage);

            USDTContract = (await ethers.getContractAt("IERC20", USDTAddress)) as IERC20;
            WBNBContract = (await ethers.getContractAt("IERC20", WBNBAddress)) as IERC20;
            SOLContract = (await ethers.getContractAt("IERC20", SOLAddress)) as IERC20;

            await PositionManager.connect(deployer).grantRole(roles.POSITION_MANAGER_ROLE, manager.address);

            const holderAddress = "0x98cF4F4B03a4e967D54a3d0aeC9fCA90851f2Cca";

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [holderAddress],
            });

            await deployer.sendTransaction({
                to: holderAddress,
                value: ethers.utils.parseEther("1"), // Send 1 BNB
            });

            // Get the holder signer
            const holderSigner = await ethers.getSigner(holderAddress);

            // Send 10000 USDT to the deployer
            await USDTContract.connect(holderSigner).transfer(deployer.address, ethers.utils.parseUnits("10000", "18"));

            // Stop impersonating the holder address
            await hre.network.provider.request({
                method: "hardhat_stopImpersonatingAccount",
                params: [holderAddress],
            });
        });

        beforeEach(async function () {
            snap = await ethers.provider.send("evm_snapshot", []);
        });

        afterEach(async function () {
            await ethers.provider.send("evm_revert", [snap]);
        });

        it("Should deposit USDT into Position Manager (!inPosition)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user1).deposit(amount))
                .to.emit(PositionManager, "Deposit")
                .withArgs(user1.address, expectedShares, amount);

            const balance = await PositionManager.balanceOf(user1.address);

            expect(balance).to.be.eq(expectedShares);
        });

        it("Should deposit and withdraw USDT from Position Manager (!inPosition)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const newBalance = await PositionManager.balanceOf(user1.address);

            expect(newBalance).to.be.eq(0);
        });

        it("Should manager add liquidity to the pool", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(1);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));
        });

        it("Should manager add liquidity and re add liquidity to the pool", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(1);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            await PositionManager.connect(manager).reAddLiquidity();

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 1);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.000001"));

            await PositionManager.connect(manager).reAddLiquidity();

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 1);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.0000000001"));
        });

        it("Should user deposit USDT after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount.mul(2));

            await USDTContract.connect(user1).approve(PositionManager.address, amount.mul(2));

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(1);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            await expect(PositionManagerDistributor.connect(user1).deposit(amount)).to.emit(PositionManager, "Deposit");

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(1);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const balance = await PositionManager.balanceOf(user1.address);

            expect(balance).to.be.not.eq(0);
        });

        it("Should manager update ticks after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(1);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const newMinTick = minTick.add(100);
            const newMaxTick = maxTick.sub(100);

            await PositionManager.connect(manager).updatePosition(newMinTick, newMaxTick);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.001"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const ticks = await PositionManager.getTickRange();

            expect(ticks[0]).to.be.eq(newMinTick);
            expect(ticks[1]).to.be.eq(newMaxTick);
        });

        it("Should user withdraw after adding liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount.mul(2));

            await USDTContract.connect(user1).approve(PositionManager.address, amount.mul(2));

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(1);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const newBalance = await PositionManager.balanceOf(user1.address);

            expect(newBalance).to.be.eq(0);
        });

        it("Should two users deposit USDT, then add liquidity and users withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);
            await USDTContract.connect(deployer).transfer(user2.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);
            await USDTContract.connect(user2).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount.mul(2));

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 1);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            await expect(PositionManagerDistributor.connect(user2).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user2.address, expectedShares);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.001"));
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const user2NewBalance = await PositionManager.balanceOf(user2.address);

            expect(user2NewBalance).to.be.eq(0);

            const user1Balance = await PositionManager.balanceOf(user1.address);

            expect(user1Balance).to.be.eq(expectedShares);

            await expect(PositionManagerDistributor.connect(user1).withdraw()).to.emit(PositionManager, "Withdraw").withArgs(user1.address, expectedShares);

            const user1NewBalance = await PositionManager.balanceOf(user1.address);

            expect(user1NewBalance).to.be.eq(0);
        });

        it("Should deposit and add liquidity with different tick values (in range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(1);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(1);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));
        });

        it("Should deposit and add liquidity with different tick values (under range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(-60000, -50000);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should deposit and add liquidity with different tick values (over range)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(-62000, -61000);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.eq(0);
        });

        it("Should deposit, add liquidity and remove liquidity", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(1);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            await PositionManager.connect(manager).removeLiquidity();

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(amount, ethers.utils.parseEther("3"));
        });

        it("Should deposit 3 times (different users)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);
            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);
            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);
            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(expectedShares);
            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(expectedShares);
        });

        it("Should deposit user1, add liquidity, and then 3 different users deposits and withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(1);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);
            await USDTContract.connect(deployer).transfer(user4.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);
            await USDTContract.connect(user4).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user2).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);
            await PositionManagerDistributor.connect(user4).deposit(amount);

            expect(await PositionManager.balanceOf(user2.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user3.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user4.address)).to.be.not.eq(0);

            await PositionManagerDistributor.connect(user2).withdraw();
            await PositionManagerDistributor.connect(user3).withdraw();
            await PositionManagerDistributor.connect(user4).withdraw();

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(0);

            const user2WBNBBalanceInWBNB = await WBNBContract.balanceOf(user2.address);
            const user2WBNBBalance = user2WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user2SOLBalanceInSOL = await SOLContract.balanceOf(user2.address);
            const user2SOLBalance = user2SOLBalanceInSOL.mul(solToUsdt).div(BigNumber.from(10).pow(18));
            expect(user2WBNBBalance.add(user2SOLBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.1"));

            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(0);

            const user3WBNBBalanceInWBNB = await WBNBContract.balanceOf(user3.address);
            const user3WBNBBalance = user3WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user3SOLBalanceInSOL = await SOLContract.balanceOf(user3.address);
            const user3SOLBalance = user3SOLBalanceInSOL.mul(solToUsdt).div(BigNumber.from(10).pow(18));
            expect(user3WBNBBalance.add(user3SOLBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1.1"));

            expect(await PositionManager.balanceOf(user4.address)).to.be.eq(0);

            const user4WBNBBalanceInWBNB = await WBNBContract.balanceOf(user4.address);
            const user4WBNBBalance = user4WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user4SOLBalanceInSOL = await SOLContract.balanceOf(user4.address);
            const user4SOLBalance = user4SOLBalanceInSOL.mul(solToUsdt).div(BigNumber.from(10).pow(18));
            expect(user4WBNBBalance.add(user4SOLBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1.7"));

            expect(await PositionManager.totalSupply()).to.be.eq(expectedShares);
        });

        it("Should deposit user1, add liquidity, and then 3 different users deposits and withdraw in other order", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(1);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await USDTContract.connect(deployer).transfer(user2.address, amount);
            await USDTContract.connect(deployer).transfer(user3.address, amount);
            await USDTContract.connect(deployer).transfer(user4.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);
            await USDTContract.connect(user3).approve(PositionManager.address, amount);
            await USDTContract.connect(user4).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user4).deposit(amount);
            await PositionManagerDistributor.connect(user3).deposit(amount);
            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await PositionManager.balanceOf(user2.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user3.address)).to.be.not.eq(0);

            expect(await PositionManager.balanceOf(user4.address)).to.be.not.eq(0);

            await PositionManagerDistributor.connect(user4).withdraw();
            await PositionManagerDistributor.connect(user3).withdraw();
            await PositionManagerDistributor.connect(user2).withdraw();

            expect(await PositionManager.balanceOf(user4.address)).to.be.eq(0);

            const user4WBNBBalanceInWBNB = await WBNBContract.balanceOf(user4.address);
            const user4WBNBBalance = user4WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user4SOLBalanceInSOL = await SOLContract.balanceOf(user4.address);
            const user4SOLBalance = user4SOLBalanceInSOL.mul(solToUsdt).div(BigNumber.from(10).pow(18));
            expect(user4WBNBBalance.add(user4SOLBalance)).to.be.closeTo(amount, ethers.utils.parseEther("0.1"));

            expect(await PositionManager.balanceOf(user3.address)).to.be.eq(0);

            const user3WBNBBalanceInWBNB = await WBNBContract.balanceOf(user3.address);
            const user3WBNBBalance = user3WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user3SOLBalanceInSOL = await SOLContract.balanceOf(user3.address);
            const user3SOLBalance = user3SOLBalanceInSOL.mul(solToUsdt).div(BigNumber.from(10).pow(18));
            expect(user3WBNBBalance.add(user3SOLBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1.1"));

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(0);

            const user2WBNBBalanceInWBNB = await WBNBContract.balanceOf(user2.address);
            const user2WBNBBalance = user2WBNBBalanceInWBNB.mul(wbnbToUsdt).div(BigNumber.from(10).pow(18));
            const user2SOLBalanceInSOL = await SOLContract.balanceOf(user2.address);
            const user2SOLBalance = user2SOLBalanceInSOL.mul(solToUsdt).div(BigNumber.from(10).pow(18));
            expect(user2WBNBBalance.add(user2SOLBalance)).to.be.closeTo(amount, ethers.utils.parseEther("1.7"));

            expect(await PositionManager.totalSupply()).to.be.eq(expectedShares);
        });

        it("Should deposit, add liquidity, and withdraw will close position, so we can deposit and add liquidity again", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(1);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const expectedShares = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(expectedShares);

            await PositionManagerDistributor.connect(user1).withdraw();

            expect(await PositionManager.balanceOf(user1.address)).to.be.eq(0);

            await USDTContract.connect(deployer).transfer(user2.address, amount);

            await USDTContract.connect(user2).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user2).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

            expect(await SOLContract.balanceOf(PositionManager.address)).to.be.eq(0);
            expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

            const expectedShares2 = amount.mul(bnbChainLinkPrice);

            expect(await PositionManager.balanceOf(user2.address)).to.be.eq(expectedShares2);
        });

        it("Should add and remove liquidity 10 times, then withdraw", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amount);

            for (let i = 0; i < 10; i++) {
                await PositionManager.connect(manager).addLiquidity(minTick, maxTick);

                expect(await SOLContract.balanceOf(PositionManager.address)).to.be.closeTo(0, 1);
                expect(await WBNBContract.balanceOf(PositionManager.address)).to.be.closeTo(0, ethers.utils.parseEther("0.01"));

                await PositionManager.connect(manager).removeLiquidity();

                expect(await USDTContract.balanceOf(PositionManager.address)).to.be.closeTo(amount, ethers.utils.parseEther("26"));
            }

            // Lose max 26 USDT in 10 add/remove liquidity
            await PositionManagerDistributor.connect(user1).withdraw();

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            expect(user1USDTBalance).to.be.closeTo(amount, ethers.utils.parseEther("26"));
        });

        it("Should set a deposit fee and charge it in a deposit", async function () {
            const amount = ethers.utils.parseEther("1000");

            const amountAfterFee = amount.mul(900000).div(1000000);

            const amountCharged = amount.sub(amountAfterFee);

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManager.connect(deployer).setFee(100000, user2.address);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            expect(await USDTContract.balanceOf(PositionManager.address)).to.be.eq(amountAfterFee);

            expect(await PositionManager.balanceOf(user1.address)).to.be.closeTo(amountAfterFee.mul(bnbChainLinkPrice), ethers.utils.parseEther("1"));

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);
            expect(user1USDTBalance).to.be.eq(0);

            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            expect(user2USDTBalance).to.be.equal(amountCharged);
        });

        it("revert: fails to distribute rewards if the contract has no balance", async function () {
            await expect(PositionManager.connect(manager).distributeRewards(0)).to.be.revertedWith("InvalidEntry");
        });

        it("should distribute to the receiver (zero users)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            // Check that exclusive manager received their 15%
            const exclusiveManagerBalance = await USDTContract.balanceOf(exclusiveManagerAddress);
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            expect(exclusiveManagerBalance).to.be.equal(expectedExclusiveManagerAmount);

            // After exclusive manager takes their cut, remaining goes to receiver
            const remainingForReceiver = amount.sub(expectedExclusiveManagerAmount);
            expect(receiverBalance).to.be.closeTo(remainingForReceiver.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.01"));
        });

        it("an user deposits and distributeRewards is called", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            expect(user1USDTBalance).to.be.eq(0);

            // Check that exclusive manager received their 15%
            const exclusiveManagerBalance = await USDTContract.balanceOf(exclusiveManagerAddress);
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            expect(exclusiveManagerBalance).to.be.equal(expectedExclusiveManagerAmount);

            // After exclusive manager takes 15%, remaining amount is distributed between receiver and users
            const remainingAfterExclusiveManager = amount.sub(expectedExclusiveManagerAmount);
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);
            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);

            expect(user1ContractUSDTBalance).to.be.equal(remainingAfterExclusiveManager.sub(expectedReceiverBalance));
        });

        it("revert: an user cannot collect rewards if the contract has no balance", async function () {
            await expect(PositionManagerDistributor.connect(user1).collectRewards()).to.be.revertedWith("InvalidEntry");
        });

        it("an user deposits, distributeRewards is called and the user collects rewards", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            await PositionManager.connect(manager).distributeRewards(0);

            await PositionManagerDistributor.connect(user1).collectRewards();

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);

            // First, exclusive manager takes 15%
            const expectedExclusiveManagerAmount = amount.mul(exclusiveManagerPercentage).div(maxPercentage);
            const remainingAfterExclusiveManager = amount.sub(expectedExclusiveManagerAmount);

            // Then receiver takes 35% of the remaining
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            // User gets the rest
            const expectedUser1USDTBalance = remainingAfterExclusiveManager.sub(expectedReceiverBalance);

            expect(user1USDTBalance).to.be.equal(expectedUser1USDTBalance);

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);

            expect(user1ContractUSDTBalance).to.be.eq(0);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            const PositionManagerDistributorBalance = await USDTContract.balanceOf(PositionManagerDistributor.address);

            expect(PositionManagerDistributorBalance).to.be.eq(0);
        });

        it("4 users deposit differents amounts and distributeRewards is called", async function () {
            const amount1 = ethers.utils.parseEther("500");
            const amount2 = ethers.utils.parseEther("1000");
            const amount3 = ethers.utils.parseEther("1500");
            const amount4 = ethers.utils.parseEther("2000");

            await USDTContract.connect(deployer).transfer(user1.address, amount1);
            await USDTContract.connect(deployer).transfer(user2.address, amount2);
            await USDTContract.connect(deployer).transfer(user3.address, amount3);
            await USDTContract.connect(deployer).transfer(user4.address, amount4);

            await USDTContract.connect(user1).approve(PositionManager.address, amount1);
            await USDTContract.connect(user2).approve(PositionManager.address, amount2);
            await USDTContract.connect(user3).approve(PositionManager.address, amount3);
            await USDTContract.connect(user4).approve(PositionManager.address, amount4);

            await PositionManagerDistributor.connect(user1).deposit(amount1);
            await PositionManagerDistributor.connect(user2).deposit(amount2);
            await PositionManagerDistributor.connect(user3).deposit(amount3);
            await PositionManagerDistributor.connect(user4).deposit(amount4);

            const totalAmount = amount1.add(amount2).add(amount3).add(amount4);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, totalAmount);

            await PositionManager.connect(manager).distributeRewards(0);

            const user1USDTBalance = await USDTContract.balanceOf(user1.address);
            const user2USDTBalance = await USDTContract.balanceOf(user2.address);
            const user3USDTBalance = await USDTContract.balanceOf(user3.address);
            const user4USDTBalance = await USDTContract.balanceOf(user4.address);

            expect(user1USDTBalance).to.be.eq(0);
            expect(user2USDTBalance).to.be.eq(0);
            expect(user3USDTBalance).to.be.eq(0);
            expect(user4USDTBalance).to.be.eq(0);

            // First, exclusive manager takes 15% of total amount
            const expectedExclusiveManagerAmount = totalAmount.mul(exclusiveManagerPercentage).div(maxPercentage);
            const remainingAfterExclusiveManager = totalAmount.sub(expectedExclusiveManagerAmount);

            // Then receiver takes 35% of the remaining
            const expectedReceiverBalance = remainingAfterExclusiveManager.mul(percentages.ReceiverPercentage).div(maxPercentage);

            const receiverBalance = await WBNBContract.balanceOf(receiver.address);

            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.01"));

            const user1ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user1.address);
            const user2ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user2.address);
            const user3ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user3.address);
            const user4ContractUSDTBalance = await PositionManagerDistributor.balanceOf(user4.address);

            // Calculate each user's portion after exclusive manager takes their cut
            const expectedUser1USDTBalance = amount1
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount1.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser2USDTBalance = amount2
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount2.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser3USDTBalance = amount3
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount3.mul(expectedReceiverBalance).div(totalAmount));
            const expectedUser4USDTBalance = amount4
                .mul(remainingAfterExclusiveManager)
                .div(totalAmount)
                .sub(amount4.mul(expectedReceiverBalance).div(totalAmount));

            expect(user1ContractUSDTBalance).to.be.equal(expectedUser1USDTBalance);
            expect(user2ContractUSDTBalance).to.be.equal(expectedUser2USDTBalance);
            expect(user3ContractUSDTBalance).to.be.equal(expectedUser3USDTBalance);
            expect(user4ContractUSDTBalance).to.be.equal(expectedUser4USDTBalance);
        });

        it("should not send funds to exclusive manager when set to address(0)", async function () {
            const amount = ethers.utils.parseEther("1000");

            await USDTContract.connect(deployer).transfer(user1.address, amount);

            await USDTContract.connect(user1).approve(PositionManager.address, amount);

            // Set exclusive manager to address(0) with 0% fee
            const exclusiveManagerContract = await ethers.getContractAt("PositionManagerDistributorWithExclusiveManager", PositionManagerDistributor.address);
            await exclusiveManagerContract.connect(deployer).setExclusiveManagerData(ethers.constants.AddressZero, 0);

            await PositionManagerDistributor.connect(user1).deposit(amount);

            await USDTContract.connect(deployer).transfer(PositionManagerDistributor.address, amount);

            // Distribute rewards
            await PositionManager.connect(manager).distributeRewards(0);

            // Check that exclusive manager (address(0)) receives no funds
            const exclusiveManagerBalance = await USDTContract.balanceOf(ethers.constants.AddressZero);
            expect(exclusiveManagerBalance).to.be.equal(0);

            // Receiver should get 35% of the total amount (no deduction for exclusive manager)
            const expectedReceiverBalance = amount.mul(percentages.ReceiverPercentage).div(maxPercentage);
            const receiverBalance = await WBNBContract.balanceOf(receiver.address);
            expect(receiverBalance).to.be.closeTo(expectedReceiverBalance.mul(ethers.utils.parseEther("1")).div(wbnbToUsdt), ethers.utils.parseEther("0.001"));

            // User should get remaining 65% of the total amount
            const userBalance = await PositionManagerDistributor.balanceOf(user1.address);
            const expectedUserBalance = amount.sub(expectedReceiverBalance);
            expect(userBalance).to.be.equal(expectedUserBalance);
        });

        it("revert: fails to set exclusive manager percentage over 100%", async function () {
            const exclusiveManagerContract = await ethers.getContractAt("PositionManagerDistributorWithExclusiveManager", PositionManagerDistributor.address);
            const invalidPercentage = maxPercentage.add(1); // 1,000,001 (over 100%)

            await expect(exclusiveManagerContract.connect(deployer).setExclusiveManagerData(exclusiveManagerAddress, invalidPercentage)).to.be.revertedWith(
                "InvalidEntry"
            );
        });
    });
}
