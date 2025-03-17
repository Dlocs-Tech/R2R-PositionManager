import * as dotenv from "dotenv";

dotenv.config();

export const roles: any = {
    DEFAULT_ADMIN_ROLE: "0x0000000000000000000000000000000000000000000000000000000000000000",
    POSITION_MANAGER_ROLE: "0xf33d40e6c84e251a3e1cff80c569d5646a4f006b85649b53b993dadc59eb3748"
};

// BSC Addresses
export const contractAddresses: any = {
    USDT: "0x55d398326f99059fF775485246999027B3197955",
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    ETH: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
    BTCB: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
    XRP: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE",

    SwapRouter: "0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2",

    ChainLink_WBNB_USD: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE",
    ChainLink_USDT_USD: "0xB97Ad0E74fa7d920791E90258A6E2085088b4320",
    ChainLink_BTCB_USD: "0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf",
    ChainLink_USDC_USD: "0x51597f405303C4377E36123cBc172b13269EA163",

    Pool_USDT_WBNB: "0x172fcD41E0913e95784454622d1c3724f546f849",
    Pool_ETH_USDT: "0xBe141893E4c6AD9272e8C04BAB7E6a10604501a5",
    Pool_ETH_WBNB: "0xD0e226f674bBf064f54aB47F42473fF80DB98CBA",
    Pool_USDT_BTCB: "0x46Cf1cF8c69595804ba91dFdd8d6b960c9B0a7C4",
    Pool_XRP_WBNB: "0xd15B00E81F98A7DB25f1dC1BA6E983a4316c4CaC",
    Pool_USDT_USDC: "0x92b7807bF19b7DDdf89b706143896d05228f3121",

    DefaultFundsDistributor: "0xDCE30F31ccf1F19C314b8E41586FfdE58aED96D6",

    R2RWallet : "0x2F764e19d71904EE6dD89Df47117Dcdf6dbB8d82",
    Admin: "0x43c12678434DBEcE2C013008810dDf3a561C0cef",
    Manager: "0x21151F4eF2e4680EBdC9A9ebAAa54610d9efF57f"
};

export const percentages: any = {
    FundsDistributorPercentage: 300000, // 30%
};

export const initValues_PositionManagerDistributor: any = {
    USDT_WBNB: {
        swapRouter: contractAddresses["SwapRouter"],
        usdtToToken0Path: "0x",
        usdtToToken1Path: "0x55d398326f99059fF775485246999027B3197955000064bb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        token0ToUsdtPath: "0x",
        token1ToUsdtPath: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c00006455d398326f99059fF775485246999027B3197955",
        dataFeed: contractAddresses["ChainLink_WBNB_USD"],
        pool: contractAddresses["Pool_USDT_WBNB"],
        fundsDistributor: contractAddresses["DefaultFundsDistributor"],
        fundsDistributorPercentage: percentages["FundsDistributorPercentage"],
    },
    ETH_USDT: {
        swapRouter: contractAddresses["SwapRouter"],
        usdtToToken0Path: "0x55d398326f99059fF775485246999027B31979550001F42170Ed0880ac9A755fd29B2688956BD959F933F8",
        usdtToToken1Path: "0x",
        token0ToUsdtPath: "0x2170Ed0880ac9A755fd29B2688956BD959F933F80001F455d398326f99059fF775485246999027B3197955",
        token1ToUsdtPath: "0x",
        dataFeed: contractAddresses["ChainLink_USDT_USD"],
        pool: contractAddresses["Pool_ETH_USDT"],
        fundsDistributor: contractAddresses["DefaultFundsDistributor"],
        fundsDistributorPercentage: percentages["FundsDistributorPercentage"],
    },
    ETH_WBNB: {
        swapRouter: contractAddresses["SwapRouter"],
        usdtToToken0Path: "0x55d398326f99059fF775485246999027B31979550001F42170Ed0880ac9A755fd29B2688956BD959F933F8",
        usdtToToken1Path: "0x55d398326f99059fF775485246999027B3197955000064bb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        token0ToUsdtPath: "0x2170Ed0880ac9A755fd29B2688956BD959F933F80001F455d398326f99059fF775485246999027B3197955",
        token1ToUsdtPath: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c00006455d398326f99059fF775485246999027B3197955",
        dataFeed: contractAddresses["ChainLink_WBNB_USD"],
        pool: contractAddresses["Pool_ETH_WBNB"],
        fundsDistributor: contractAddresses["DefaultFundsDistributor"],
        fundsDistributorPercentage: percentages["FundsDistributorPercentage"],
    },
    USDT_BTCB: {
        swapRouter: contractAddresses["SwapRouter"],
        usdtToToken0Path: "0x",
        usdtToToken1Path: "0x55d398326f99059fF775485246999027B31979550001F47130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
        token0ToUsdtPath: "0x",
        token1ToUsdtPath: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c0001F455d398326f99059fF775485246999027B3197955",
        dataFeed: contractAddresses["ChainLink_BTCB_USD"],
        pool: contractAddresses["Pool_USDT_BTCB"],
        fundsDistributor: contractAddresses["DefaultFundsDistributor"],
        fundsDistributorPercentage: percentages["FundsDistributorPercentage"],
    },
    XRP_WBNB: {
        swapRouter: contractAddresses["SwapRouter"],
        usdtToToken0Path: "0x55d398326f99059fF775485246999027B3197955000BB81D2F0da169ceB9fC7B3144628dB156f3F6c60dBE",
        usdtToToken1Path: "0x55d398326f99059fF775485246999027B3197955000064bb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        token0ToUsdtPath: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE000BB855d398326f99059fF775485246999027B3197955",
        token1ToUsdtPath: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c00006455d398326f99059fF775485246999027B3197955",
        dataFeed: contractAddresses["ChainLink_WBNB_USD"],
        pool: contractAddresses["Pool_XRP_WBNB"],
        fundsDistributor: contractAddresses["DefaultFundsDistributor"],
        fundsDistributorPercentage: percentages["FundsDistributorPercentage"],
    },
    USDT_USDC: {
        swapRouter: contractAddresses["SwapRouter"],
        usdtToToken0Path: "0x",
        usdtToToken1Path: "0x55d398326f99059fF775485246999027B31979550000648AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        token0ToUsdtPath: "0x",
        token1ToUsdtPath: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d00006455d398326f99059fF775485246999027B3197955",
        dataFeed: contractAddresses["ChainLink_USDC_USD"],
        pool: contractAddresses["Pool_USDT_USDC"],
        fundsDistributor: contractAddresses["DefaultFundsDistributor"],
        fundsDistributorPercentage: percentages["FundsDistributorPercentage"],
    },
};