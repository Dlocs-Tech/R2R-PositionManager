import {buildModule} from "@nomicfoundation/hardhat-ignition/modules";

const contractName = "PositionManager";
const id = "";

export default buildModule(contractName, (m) => {
    const contract = m.contract(contractName, [m.getParameter("poolId"), m.getParameter("protocolManager"), m.getParameter("receiverAddress"), m.getParameter("receiverPercentage")], {
        id: id,
    });

    return {contract};
});
