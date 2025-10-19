import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

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
      blockGasLimit: 140000000, // BSC block gas limit
      forking: {
        url: `${process.env.BSC_RPC_URL}`,
        blockNumber: 63106587,
      },
    },
    bsc: {
      url: process.env.BSC_RPC_URL ? process.env.BSC_RPC_URL : "",
      chainId: 56,
      accounts: { mnemonic: process.env.DEPLOYER_MNEMONIC ? process.env.DEPLOYER_MNEMONIC : "" },
    }
  },
  etherscan: {
    apiKey: process.env.BSC_ETHERSCAN_API_KEY ? process.env.BSC_ETHERSCAN_API_KEY : "",
    customChains: [
    {
      network: "bsc",
      chainId: 56,
      urls: {
        apiURL: "https://api.etherscan.io/v2/api?chainid=56",
        browserURL: "https://bscscan.com/"
      }
    }]
  }
};

export default config;
