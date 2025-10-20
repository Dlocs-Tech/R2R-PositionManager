// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title IPoolLibrary
 */
interface IPoolLibrary {
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

    /// @notice Total number of pools added.
    function poolsCount() external view returns (uint256);

    /**
     * @notice Adds a new pool with the given PoolData.
     * @param poolData The PoolData to be added.
     */
    function addPool(PoolData memory poolData) external;

    /**
     * @notice Updates the PoolData for a given pool ID.
     * @param poolId The ID of the pool to be updated.
     * @param poolData The new PoolData.
     */
    function updatePool(uint256 poolId, PoolData memory poolData) external;

    /**
     * @notice Retrieves the PoolData for a given pool ID.
     * @param poolId The ID of the pool to retrieve.
     * @return The PoolData associated with the given pool ID.
     */
    function getPoolData(uint256 poolId) external view returns (PoolData memory);
}
