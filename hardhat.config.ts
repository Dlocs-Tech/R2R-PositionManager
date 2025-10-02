import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-deploy";
import "hardhat-deploy-ethers";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.18",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.24",
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
        blockNumber: 44364882,
      },
    },
    amoy: {
      url: process.env.AMOY_RPC_URL ? process.env.AMOY_RPC_URL : "",
      chainId: 80002,
      accounts: { mnemonic: process.env.DEPLOYER_MNEMONIC ? process.env.DEPLOYER_MNEMONIC : "" },
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL ? process.env.POLYGON_RPC_URL : "",
      chainId: 137,
      accounts: { mnemonic: process.env.DEPLOYER_MNEMONIC ? process.env.DEPLOYER_MNEMONIC : "" },
    },
    bsc: {
      url: process.env.BSC_RPC_URL ? process.env.BSC_RPC_URL : "",
      chainId: 56,
      accounts: { mnemonic: process.env.DEPLOYER_MNEMONIC ? process.env.DEPLOYER_MNEMONIC : "" },
    }
  },
  namedAccounts: {
    deployer: 0,
    r2rAccount: 1,
    manager: 2,
    user1: 3,
    user2: 4,
    user3: 5,
  },
  gasReporter: {
    enabled: false,
    currency: "USD",
    token: "BNB",
    gasPriceApi: `https://api.bscscan.com/api?module=proxy&action=eth_gasPrice&apikey=${process.env.BSC_ETHERSCAN_API_KEY}`,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
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
    },
  ]
  },
  paths: {
    sources: "./contracts",
    tests: "./tests",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
