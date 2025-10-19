import { roles } from "../utils/constants";
import { ethers } from "hardhat";

// command to execute script:
// npx hardhat run ./scripts/grantManagerRole.ts --network <network name>

const manager = "0xBA627Ab3aB67Fc444297b7Ec13a15F975e796CEf";

export async function main() {
    // Get contract
    const PositionManagerDistributor = await ethers.getContractAt("PositionManagerDistributor", "");

    const PositionManagerAddress = await PositionManagerDistributor.sharesContract();

    console.log("PositionManager:", PositionManagerAddress);

    const PositionManager = await ethers.getContractAt("PositionManager", PositionManagerAddress);

    const tx = await PositionManager.grantRole(roles.POSITION_MANAGER_ROLE, manager);
    await tx.wait();

    console.log("Role granted!");
}

main();