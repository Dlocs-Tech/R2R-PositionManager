import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers, getNamedAccounts, getChainId } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { initValues_PositionManagerDistributor, roles, contractAddresses, percentages } from "../utils/constants";

const version = "v0.0.0";
const contractName = "PositionManagerDistributorWithExclusiveManager";

let InitValues = initValues_PositionManagerDistributor.ASTAR_USDT;

const ExclusiveManager = contractAddresses.ExclusiveManager;
const ExclusiveManagerFeePercentage =  percentages.ExclusiveManagerPercentage;

const deployFunction: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = parseInt(await getChainId(), 10);

    console.log("\nDeploying " + contractName + "...");

    console.log(`deployer: ${deployer}`);

    InitValues.receiverFeePercentage = percentages.ReceiverPercentageInExclusiveManagerVersion;

    const result = await deploy(contractName, {
        contract: contractName,
        from: deployer,
        log: true,
        waitConfirmations: 1,
        args: [
          InitValues, contractAddresses["Pool_USDT_WBNB"], ExclusiveManager, ExclusiveManagerFeePercentage
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
          contract: 'contracts/PositionManagerDistributorWithExclusiveManager.sol:PositionManagerDistributorWithExclusiveManager',
          constructorArguments: [InitValues, contractAddresses["Pool_USDT_WBNB"], ExclusiveManager, ExclusiveManagerFeePercentage],
        });
    } catch (error) {}

    try {
        console.log("Verifying...");
        await hre.run('verify:verify', {
          address: PositionManagerAddress,
          contract: 'contracts/PositionManager.sol:PositionManager',
          constructorArguments: [
            InitValues.dataFeedAddress,
            InitValues.poolAddress,
            InitValues.pool0Address,
            InitValues.pool1Address,
            contractAddresses["USDT"],
            InitValues.receiverAddress,
            InitValues.receiverFeePercentage,
          ],
        });
    } catch (error) {}

    if(chainId == 31337) {
      InitValues = initValues_PositionManagerDistributor.XRP_BTCB;
      InitValues.receiverFeePercentage = percentages.ReceiverPercentageInExclusiveManagerVersion;

      const result1 = await deploy(contractName + "_1", {
        contract: contractName,
        from: deployer,
        log: true,
        waitConfirmations: 1,
        args: [
            InitValues, contractAddresses["Pool_USDT_WBNB"], ExclusiveManager, ExclusiveManagerFeePercentage
        ],
      });

      console.log(contractName + " deployed to: ", result1.address);

      const PositionManagerDistributor1 = await ethers.getContractAt(contractName, result1.address);

      const PositionManagerAddress1 = await PositionManagerDistributor1.sharesContract();

      console.log("PositionManager deployed to:", PositionManagerAddress1);

      const PositionManager1 = await ethers.getContractAt("PositionManager", PositionManagerAddress1);

      await PositionManager1.grantRole(roles.POSITION_MANAGER_ROLE, contractAddresses.Manager);

      InitValues = initValues_PositionManagerDistributor.USDT_BTCB_2;
      InitValues.receiverFeePercentage = percentages.ReceiverPercentageInExclusiveManagerVersion;

      const result2 = await deploy(contractName + "_2", {
        contract: contractName,
        from: deployer,
        log: true,
        waitConfirmations: 1,
        args: [
            InitValues, contractAddresses["Pool_USDT_WBNB"], ExclusiveManager, ExclusiveManagerFeePercentage
        ],
      });

      console.log(contractName + " deployed to: ", result2.address);

      const PositionManagerDistributor2 = await ethers.getContractAt(contractName, result2.address);

      const PositionManagerAddress2 = await PositionManagerDistributor2.sharesContract();

      console.log("PositionManager deployed to:", PositionManagerAddress2);

      const PositionManager2 = await ethers.getContractAt("PositionManager", PositionManagerAddress2);

      await PositionManager2.grantRole(roles.POSITION_MANAGER_ROLE, contractAddresses.Manager);

      InitValues = initValues_PositionManagerDistributor.USDT_SOL;
      InitValues.receiverFeePercentage = percentages.ReceiverPercentageInExclusiveManagerVersion;

      const result3 = await deploy(contractName + "_3", {
        contract: contractName,
        from: deployer,
        log: true,
        waitConfirmations: 1,
        args: [
            InitValues, contractAddresses["Pool_USDT_WBNB"], ExclusiveManager, ExclusiveManagerFeePercentage
        ],
      });

      console.log(contractName + " deployed to: ", result3.address);

      const PositionManagerDistributor3 = await ethers.getContractAt(contractName, result3.address);

      const PositionManagerAddress3 = await PositionManagerDistributor3.sharesContract();

      console.log("PositionManager deployed to:", PositionManagerAddress3);

      const PositionManager3 = await ethers.getContractAt("PositionManager", PositionManagerAddress3);

      await PositionManager3.grantRole(roles.POSITION_MANAGER_ROLE, contractAddresses.Manager);

      InitValues = initValues_PositionManagerDistributor.USDC_USD1;
      InitValues.receiverFeePercentage = percentages.ReceiverPercentageInExclusiveManagerVersion;

      const result4 = await deploy(contractName + "_4", {
        contract: contractName,
        from: deployer,
        log: true,
        waitConfirmations: 1,
        args: [
            InitValues, contractAddresses["Pool_USDT_WBNB"], ExclusiveManager, ExclusiveManagerFeePercentage
        ],
      });

      console.log(contractName + " deployed to: ", result4.address);

      const PositionManagerDistributor4 = await ethers.getContractAt(contractName, result4.address);

      const PositionManagerAddress4 = await PositionManagerDistributor4.sharesContract();

      console.log("PositionManager deployed to:", PositionManagerAddress4);

      const PositionManager4 = await ethers.getContractAt("PositionManager", PositionManagerAddress4);

      await PositionManager4.grantRole(roles.POSITION_MANAGER_ROLE, contractAddresses.Manager);
    }

    return true;
};

export default deployFunction;

deployFunction.id = contractName + version;
deployFunction.tags = ["Actual" + contractName, version];
