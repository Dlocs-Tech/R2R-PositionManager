import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-dependency-compiler";

import * as dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.30",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  mocha: {
    timeout: 100000000,
  },
  networks: {
    hardhat: {
      forking: forkData(process.env.FORKING_NETWORK_ID),
    },
    bsc: {
      url: process.env.BSC_RPC_URL ? process.env.BSC_RPC_URL : "",
      chainId: 56,
      accounts: { mnemonic: process.env.DEPLOYER_MNEMONIC ? process.env.DEPLOYER_MNEMONIC : "" },
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY ? process.env.ETHERSCAN_API_KEY : "",
    customChains: [
    {
      network: "bsc",
      chainId: 56,
      urls: {
        apiURL: "https://api.etherscan.io/v2/api?chainid=56",
        browserURL: "https://bscscan.com/"
      }
    }]
  },
  dependencyCompiler: {
    paths: [
      "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol",
      "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol",
    ]
  },
};

export default config;

function forkData(networkId: string | undefined): any {
  let url: string;
  let blockNumber: number;

  switch (networkId) {
    case "56":
      console.log("Using BSC rpc");
      url = `${process.env.BSC_RPC_URL}`;
      blockNumber = 63106587;
      break;

    default:
      console.log("Defaulting to Hardhat without forking");
      return;
  }

  return {
    url: url,
    blockNumber: blockNumber,
  };
}