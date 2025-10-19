// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title PoolLibrary
 * @notice A contract that allows the owner to store and manage a data associated to pools.
 */
contract PoolLibrary is OwnableUpgradeable {
    event PoolAdded(uint256 indexed poolId, address indexed mainPool);

    event PoolUpdated(uint256 indexed poolId, address indexed mainPool);

    error InvalidPoolId(uint256 poolId);

    /**
     * @notice Structure to hold pool data.
     * @param mainPool The address of the main pool.
     * @param token0Pool The address of the token0 pool.
     * @param token1Pool The address of the token1 pool.
     * @param chainlinkDataFeed The address of the Chainlink data feed.
     * @param chainlinkTimeInterval The time interval for Chainlink data feed updates.
     */
    struct PoolData {
        address mainPool;
        address token0Pool;
        address token1Pool;
        address chainlinkDataFeed;
        uint256 chainlinkTimeInterval;
    }

    /// @notice Mapping from pool ID to PoolData.
    mapping(uint256 => PoolData) public poolsData;

    /// @notice Total number of pools added.
    uint256 public poolsCount;

    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {
        __Ownable_init(msg.sender);
    }

    /**
     * @notice Adds a new pool with the given PoolData.
     * @param poolData The PoolData to be added.
     */
    function addPool(PoolData memory poolData) external onlyOwner {
        poolsData[poolsCount] = poolData;

        emit PoolAdded(poolsCount, poolData.mainPool);

        poolsCount++;
    }

    /**
     * @notice Updates the PoolData for a given pool ID.
     * @param poolId The ID of the pool to be updated.
     * @param poolData The new PoolData.
     */
    function updatePool(uint256 poolId, PoolData memory poolData) external onlyOwner {
        require(poolId < poolsCount, InvalidPoolId(poolId));

        poolsData[poolId] = poolData;

        emit PoolUpdated(poolId, poolData.mainPool);
    }

    /**
     * @notice Retrieves the PoolData for a given pool ID.
     * @param poolId The ID of the pool to retrieve.
     * @return The PoolData associated with the given pool ID.
     */
    function getPoolData(uint256 poolId) external view returns (PoolData memory) {
        require(poolId < poolsCount, InvalidPoolId(poolId));

        return poolsData[poolId];
    }
}
