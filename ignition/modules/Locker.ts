import {buildModule} from "@nomicfoundation/hardhat-ignition/modules";

const contractName = "Locker";
const proxyContractName = "TransparentUpgradeableProxy";

export default buildModule(contractName, (m) => {
    const proxyAdminOwner = m.getAccount(0);

    const contract = m.contract(contractName, [m.getParameter("_lockedToken")]);

    // encode init data
    const initDataEncoded = m.encodeFunctionCall(contract, "initialize", []);

    const proxy = m.contract(proxyContractName, [contract, proxyAdminOwner, initDataEncoded]);

    const proxyAdminAddress = m.readEventArgument(proxy, "AdminChanged", "newAdmin");

    const proxyAdmin = m.contractAt("ProxyAdmin", proxyAdminAddress);

    return {proxy, proxyAdmin};
});
