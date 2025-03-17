import { ethers } from "hardhat";
import { BigNumber } from "ethers";

// command to execute script:
// npx hardhat run ./scripts/PositionManager/addLiquidityPool.ts --network <network name>

const positionManagerAddress = "";

const tickLower = BigNumber.from(-887272);
const tickUpper = BigNumber.from(887272);

export async function main() {
    // Get contract
    const positionManager = await ethers.getContractAt("PositionManager", positionManagerAddress);

    const tx = await positionManager.addLiquidity(tickLower, tickUpper, { gasLimit: 500000 });
    await tx.wait();

    console.log("Liquidity added to pool of PositionManager:", positionManagerAddress);

    const positionKey = ethers.utils.keccak256(ethers.utils.solidityPack(["address", "int24", "int24"], [positionManagerAddress, tickLower, tickUpper]));

    console.log("Position key:", positionKey);
}

main();
