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
    }

    return true;
};

export default deployFunction;

deployFunction.id = contractName + version;
deployFunction.tags = ["Actual" + contractName, version];
