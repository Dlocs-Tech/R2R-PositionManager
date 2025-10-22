// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {IPoolLibrary} from "./interfaces/IPoolLibrary.sol";

/**
 * @title PoolLibrary
 * @notice A contract that allows the owner to store and manage a data associated to pools.
 */
contract PoolLibrary is IPoolLibrary, OwnableUpgradeable {
    /// @notice Mapping from pool ID to PoolData.
    mapping(uint256 => PoolData) public poolsData;

    /// @inheritdoc IPoolLibrary
    uint256 public poolsCount;

    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {
        __Ownable_init(msg.sender);
    }

    /// @inheritdoc IPoolLibrary
    function addPool(PoolData memory poolData) external onlyOwner {
        require(
            poolData.chainlinkDataFeed != address(0) &&
                poolData.chainlinkTimeInterval != 0 &&
                poolData.mainPool != address(0) &&
                (poolData.token0Pool != address(0) || poolData.token1Pool != address(0)),
            InvalidInput()
        );

        poolsData[poolsCount] = poolData;

        emit PoolAdded(poolsCount, poolData.mainPool);

        poolsCount++;
    }

    /// @inheritdoc IPoolLibrary
    function updatePool(uint256 poolId, PoolData memory poolData) external onlyOwner {
        require(poolId < poolsCount, InvalidPoolId(poolId));
        require(
            poolData.chainlinkDataFeed != address(0) &&
                poolData.chainlinkTimeInterval != 0 &&
                poolData.mainPool != address(0) &&
                (poolData.token0Pool != address(0) || poolData.token1Pool != address(0)),
            InvalidInput()
        );

        poolsData[poolId] = poolData;

        emit PoolUpdated(poolId, poolData.mainPool);
    }

    /// @inheritdoc IPoolLibrary
    function getPoolData(uint256 poolId) external view returns (PoolData memory) {
        require(poolId < poolsCount, InvalidPoolId(poolId));

        return poolsData[poolId];
    }
}
