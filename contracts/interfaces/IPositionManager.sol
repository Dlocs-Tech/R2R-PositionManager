// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title IPositionManager
 */
interface IPositionManager {
    /// @dev Error thrown when an invalid input is provided
    error InvalidInput();

    /// @dev Error thrown when user has insufficient shares to withdraw
    error InsufficientBalance();

    /// @dev Error thrown when the caller is not the valid pool
    error NotPool();

    /// @dev Error thrown when the balance is not enough
    error NotEnoughBalance();

    /**
     * @notice Event emitted when a user deposits USDT and receives shares
     * @param user Address of the user
     * @param shares Amount of shares received
     * @param depositAmount Amount of USDT deposited
     */
    event Deposit(address indexed user, uint256 shares, uint256 depositAmount);

    /**
     * @notice Event emitted when a user withdraws shares and receives funds
     * @param user Address of the user
     * @param shares Amount of shares withdrawn
     */
    event Withdraw(address indexed user, uint256 shares);

    /**
     * @notice Event emitted when liquidity is added to the position
     * @param tickLower Lower tick of the position
     * @param tickUpper Upper tick of the position
     */
    event LiquidityAdded(int24 tickLower, int24 tickUpper);

    /**
     * @notice Event emitted when liquidity is removed from the position
     * @param tickLower Lower tick of the position
     * @param tickUpper Upper tick of the position
     */
    event LiquidityRemoved(int24 tickLower, int24 tickUpper);

    /**
     * @notice Event emitted when the position is updated
     * @param tickLower New lower tick of the position
     * @param tickUpper New upper tick of the position
     */
    event PositionUpdated(int24 tickLower, int24 tickUpper);

    /**
     * @notice Event emitted when the receiver address and fee percentage are updated
     * @param receiverAddress Address of the receiver of the fees
     * @param receiverFeePercentage Percentage of the funds destined to the receiver
     */
    event ReceiverDataUpdated(address indexed receiverAddress, uint256 receiverFeePercentage);

    /**
     * @notice Event emitted when the slippage is updated
     * @param slippage New slippage value
     */
    event SlippageUpdated(uint256 slippage);

    /**
     * @notice Event emitted when the minimum deposit amount is updated
     * @param minimumDepositAmount New minimum deposit amount
     */
    event MinDepositAmountUpdated(uint256 minimumDepositAmount);

    /**
     * @notice Function to deposit USDT and receive shares in return
     * @param depositAmount Amount of USDT to deposit
     * @return shares Amount of shares sent to the user
     * @dev The user must approve the contract to spend the USDT before calling this function
     */
    function deposit(uint256 depositAmount, address sender) external returns (uint256 shares);

    /**
     * @notice Function to withdraw shares and receive funds in return
     * @dev The user must have shares to withdraw
     *      NOTE: If the contract is in position, the user will receive token0 and token1
     *            If the contract is not in position, the user will receive USDT
     */
    function withdraw(address sender) external;

    /**
     * @notice Function to add liquidity to the position
     * @param tickLower Lower tick of the position
     * @param tickUpper Upper tick of the position
     * @dev Only the manager can call this function
     */
    function addLiquidity(int24 tickLower, int24 tickUpper) external;

    /**
     * @notice Function to remove liquidity from the position
     * @dev Only the manager can call this function
     */
    function removeLiquidity() external;

    /**
     * @notice Function to update the position
     * @param tickLower Lower tick of the position
     * @param tickUpper Upper tick of the position
     * @dev Only the manager can call this function
     */
    function updatePosition(int24 tickLower, int24 tickUpper) external;

    /**
     * @notice Function to re-add liquidity to the position
     * @dev Since this function adds the remaining liquidity to the current position, it could be called by everyone
     */
    function reAddLiquidity() external;

    /**
     * @notice Function to distribute rewards calling the factory contract
     * @param amountOutMin Minimum amount out for the swap
     * @dev Only the manager can call this function
     */
    function distributeRewards(uint256 amountOutMin) external;

    /**
     * @notice Function to get the percentage of the range
     * @param amount0 Amount of token0 (must be in token0 units)
     * @param amount1 Amount of token1 (must be in token1 units)
     * @return percentage Percentage of the range
     * @dev The percentage is calculated as the percentage of token0 in the pool
     */
    function getRangePercentage(uint256 amount0, uint256 amount1) external view returns (uint256);

    /**
     * @notice Function to get the current tick range of the position
     * @return tickLower Lower tick of the position
     * @return tickUpper Upper tick of the position
     * @dev The ticks are the same if the contract is not in position
     */
    function getTickRange() external view returns (int24, int24);

    /**
     * @notice Function to set the receiver address and fee percentage
     * @param receiverAddress_ Address of the receiver of the fees
     * @param receiverFeePercentage_ Percentage of the funds destined to the receiver
     */
    function setReceiverData(address receiverAddress_, uint256 receiverFeePercentage_) external;

    /**
     * @notice Function to set the slippage percentage
     * @param slippage New slippage value
     */
    function setSlippage(uint256 slippage) external;

    /**
     * @notice Function to set the minimum deposit amount
     * @param minimumDepositAmount New minimum deposit amount
     */
    function setMinDepositAmount(uint256 minimumDepositAmount) external;

    /**
     * @notice Function to set the fee percentage and the recipient address involved when a deposit fee is charged
     * @param depositFeePercentage New deposit fee percentage
     * @param feeReceiverAddress New fee receiver address
     */
    function setFee(uint256 depositFeePercentage, address feeReceiverAddress) external;
}
