// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IProtocolManager
 */
interface IProtocolManager is IAccessControl {
    /// @notice Manager role - keccak256("Manager_Role");
    function MANAGER_ROLE() external view returns (bytes32);

    function getDefaultAdminRole() external view returns (bytes32);

    function registerDeposit(address depositor) external;

    function registerWithdrawal(address depositor) external;

    function locker() external view returns (address);

    function poolLibrary() external view returns (address);

    function baseToken() external view returns (IERC20);

    function setReceiverData(address receiverAddress, uint256 receiverPercentage) external;
}
