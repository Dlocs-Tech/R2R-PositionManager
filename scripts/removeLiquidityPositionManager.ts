import { ethers } from "hardhat";

// command to execute script:
// npx hardhat run ./scripts/PositionManager/removeLiquidityPositionManager.ts --network <network name>

const positionManagerDistributorAddress = "";

export async function main() {
    // Get contract
    const positionManagerFactory = await ethers.getContractAt("PositionManagerDistributor", positionManagerDistributorAddress);

    const tx = await positionManagerFactory.withdraw();
    await tx.wait();

    console.log("Withdrawn liquidity from PositionManagerDistributor");
}

main();
