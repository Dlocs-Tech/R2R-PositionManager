import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers, getNamedAccounts, getChainId } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { initValues_PositionManagerDistributor, roles, contractAddresses } from "../utils/constants";

const version = "v0.0.0";
const contractName = "PositionManagerDistributor";

const InitValues = initValues_PositionManagerDistributor.USDT_WBNB;

const deployFunction: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = parseInt(await getChainId(), 10);

    console.log("\nDeploying " + contractName + "...");

    console.log(`deployer: ${deployer}`);

    const result = await deploy(contractName, {
        contract: contractName,
        from: deployer,
        log: true,
        waitConfirmations: 1,
        args: [
          InitValues
        ],
    });

    console.log(contractName + " deployed to: ", result.address);

    const PositionManagerDistributor = await ethers.getContractAt(contractName, result.address);

    const PositionManagerAddress = await PositionManagerDistributor.sharesContract();

    console.log("PositionManager deployed to:", PositionManagerAddress);

    const PositionManager = await ethers.getContractAt("PositionManager", PositionManagerAddress);

    const tx = await PositionManager.grantRole(roles.POSITION_MANAGER_ROLE, contractAddresses.Manager);
    await tx.wait();

    try {
        console.log("Verifying...");
        await hre.run('verify:verify', {
          address: result.address,
          contract: 'contracts/PositionManagerDistributor.sol:PositionManagerDistributor',
          constructorArguments: [InitValues],
        });
    } catch (error) {}

    try {
        console.log("Verifying...");
        await hre.run('verify:verify', {
          address: PositionManagerAddress,
          contract: 'contracts/PositionManager.sol:PositionManager',
          constructorArguments: [
            InitValues.swapRouter,
            InitValues.usdtToToken0Path,
            InitValues.usdtToToken1Path,
            InitValues.token0ToUsdtPath,
            InitValues.token1ToUsdtPath,
            contractAddresses.USDT,
            InitValues.dataFeed,
            InitValues.pool,
            InitValues.fundsDistributor,
            InitValues.fundsDistributorPercentage,
          ],
        });
    } catch (error) {}

    if(chainId == 31337) {
      const result = await deploy(contractName + "_2", {
        contract: contractName,
        from: deployer,
        log: true,
        waitConfirmations: 1,
        args: [
            initValues_PositionManagerDistributor.ETH_USDT
        ],
      });

      console.log(contractName + " deployed to: ", result.address);

      const PositionManagerDistributor = await ethers.getContractAt(contractName, result.address);

      const PositionManagerAddress = await PositionManagerDistributor.sharesContract();

      console.log("PositionManager deployed to:", PositionManagerAddress);

      const PositionManager = await ethers.getContractAt("PositionManager", PositionManagerAddress);

      await PositionManager.grantRole(roles.POSITION_MANAGER_ROLE, contractAddresses.Manager);

      const result2 = await deploy(contractName + "_3", {
        contract: contractName,
        from: deployer,
        log: true,
        waitConfirmations: 1,
        args: [
            initValues_PositionManagerDistributor.ETH_WBNB
        ],
      });

      console.log(contractName + " deployed to: ", result2.address);

      const PositionManagerDistributor2 = await ethers.getContractAt(contractName, result2.address);

      const PositionManagerAddress2 = await PositionManagerDistributor2.sharesContract();

      console.log("PositionManager deployed to:", PositionManagerAddress2);

      const PositionManager2 = await ethers.getContractAt("PositionManager", PositionManagerAddress2);

      await PositionManager2.grantRole(roles.POSITION_MANAGER_ROLE, contractAddresses.Manager);

      const result3 = await deploy(contractName + "_4", {
        contract: contractName,
        from: deployer,
        log: true,
        waitConfirmations: 1,
        args: [
            initValues_PositionManagerDistributor.USDT_BTCB
        ],
      });

      console.log(contractName + " deployed to: ", result3.address);

      const PositionManagerDistributor3 = await ethers.getContractAt(contractName, result3.address);

      const PositionManagerAddress3 = await PositionManagerDistributor3.sharesContract();

      console.log("PositionManager deployed to:", PositionManagerAddress3);

      const PositionManager3 = await ethers.getContractAt("PositionManager", PositionManagerAddress3);

      await PositionManager3.grantRole(roles.POSITION_MANAGER_ROLE, contractAddresses.Manager);

      const result4 = await deploy(contractName + "_5", {
        contract: contractName,
        from: deployer,
        log: true,
        waitConfirmations: 1,
        args: [
            initValues_PositionManagerDistributor.XRP_WBNB
        ],
      });

      console.log(contractName + " deployed to: ", result4.address);

      const PositionManagerDistributor4 = await ethers.getContractAt(contractName, result4.address);

      const PositionManagerAddress4 = await PositionManagerDistributor4.sharesContract();

      console.log("PositionManager deployed to:", PositionManagerAddress4);

      const PositionManager4 = await ethers.getContractAt("PositionManager", PositionManagerAddress4);

      await PositionManager4.grantRole(roles.POSITION_MANAGER_ROLE, contractAddresses.Manager);

      const result5 = await deploy(contractName + "_6", {
        contract: contractName,
        from: deployer,
        log: true,
        waitConfirmations: 1,
        args: [
            initValues_PositionManagerDistributor.USDT_USDC
        ],
      });

      console.log(contractName + " deployed to: ", result5.address);

      const PositionManagerDistributor5 = await ethers.getContractAt(contractName, result5.address);

      const PositionManagerAddress5 = await PositionManagerDistributor5.sharesContract();

      console.log("PositionManager deployed to:", PositionManagerAddress5);

      const PositionManager5 = await ethers.getContractAt("PositionManager", PositionManagerAddress5);

      await PositionManager5.grantRole(roles.POSITION_MANAGER_ROLE, contractAddresses.Manager);
    }

    return true;
};

export default deployFunction;

deployFunction.id = contractName + version;
deployFunction.tags = [contractName, version];
