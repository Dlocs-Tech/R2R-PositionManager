// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

/**
 * @title IProtocolManager
 */
interface IProtocolManager is IAccessControl {
    /// @notice Manager role - keccak256("Manager_Role");
    function MANAGER_ROLE() external view returns (bytes32);

    function DEFAULT_ADMIN_ROLE() external view returns (bytes32);
}
