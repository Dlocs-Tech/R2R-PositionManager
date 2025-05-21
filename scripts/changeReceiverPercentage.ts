import { initValues_PositionManagerDistributor, roles, contractAddresses } from "../utils/constants";
import { ethers } from "hardhat";

// command to execute script:
// npx hardhat run ./scripts/changeReceiverPercentage.ts --network <network name>

const percentage = 350000; // 35%

export async function main() {
    // Get contract
    const PositionManagerDistributor = await ethers.getContractAt("PositionManagerDistributor", "");

    const PositionManagerAddress = await PositionManagerDistributor.sharesContract();

    console.log("PositionManager deployed to:", PositionManagerAddress);

    const PositionManager = await ethers.getContractAt("PositionManager", PositionManagerAddress);

    const receiverAddress = await PositionManagerDistributor.receiverAddress();

    console.log("Receiver address:", receiverAddress);

    const tx = await PositionManager.setReceiverData(receiverAddress, percentage);
    await tx.wait();

    console.log("Receiver percentage changed to:", percentage);
}

main();