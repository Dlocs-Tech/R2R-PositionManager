// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title IPositionManagerDistributor
 */
interface IPositionManagerDistributor {
    /// @dev Error thrown when the caller is not the PositionManager contract
    error WrongCaller();

    /// @dev Error thrown when the input is invalid
    error InvalidEntry();

    /// @dev Error thrown when the caller is not the pool
    error NotPool();

    /// @dev Error thrown when the balance is not enough
    error NotEnoughBalance();

    /**
     * @notice Event emitted when the rewards are distributed
     * @param amount Amount of USDT distributed
     */
    event RewardsDistributed(uint256 amount);

    /**
     * @notice Event emitted when the user collects the rewards
     * @param user Address of the user
     * @param amount Amount of USDT collected
     */
    event RewardCollected(address indexed user, uint256 amount);

    /**
     * @dev Parameters to create the PositionManager contract
     * @param dataFeedAddress Address of the data feed used to get the token1 price in USD
     * @param poolAddress Address of the main PancakeSwap V3 pool
     * @param pool0Address Address of the pool to swap USDT to token0
     * @param pool1Address Address of the pool to swap USDT to token1
     * @param receiverAddress Address of the receiver of the fees
     * @param receiverFeePercentage Percentage of the funds destined to the receiver
     */
    struct CreatePositionManagerParams {
        address dataFeedAddress;
        address poolAddress;
        address pool0Address;
        address pool1Address;
        address receiverAddress;
        uint256 receiverFeePercentage;
    }

    /**
     * @notice Deposit USDT to the positionManager
     * @param depositAmount Amount of USDT to deposit
     */
    function deposit(uint256 depositAmount) external returns (uint256 shares);

    /// @notice Withdraw Funds from the positionManager
    function withdraw() external;

    /**
     * @notice Distribute the rewards accumulated by the PositionManager contract
     * @param receiverAddress Address of the receiver of the fees
     * @param receiverPercentage Percentage of the funds destined to the receiver
     * @param amountOutMin Minimum amount of wnative to receive
     * @dev Only the PositionManager contract can call this function
     */
    function distributeRewards(address receiverAddress, uint256 receiverPercentage, uint256 amountOutMin) external;

    /**
     * @notice Collect rewards for the caller
     * @dev User must have a balance greater than 0
     */
    function collectRewards() external;

    /**
     * @notice Get the balance of a user
     * @param user Address of the user
     */
    function balanceOf(address user) external view returns (uint256);

    /**
     * @notice Get the users set
     * @return Users set
     */
    function usersSet() external view returns (address[] memory);
}
