// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IProtocolManager} from "../interfaces/IProtocolManager.sol";

contract PositionManagerMock is ERC20 {
    constructor() ERC20("PMMock", "PMM") {}

    function mint(uint256 amount) external {
        _mint(msg.sender, amount);
    }

    function setReceiverData(address receiverAddress, uint256 receiverPercentage, IProtocolManager protocolManager) external {
        protocolManager.setReceiverData(receiverAddress, receiverPercentage);
    }

    function registerDeposit(address depositor, IProtocolManager protocolManager) external {
        protocolManager.registerDeposit(depositor);
    }
}
