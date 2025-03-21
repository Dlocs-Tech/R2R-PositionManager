// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IPancakeV3Pool} from "@pancakeswap/v3-core/contracts/interfaces/IPancakeV3Pool.sol";
import {IPancakeV3SwapCallback} from "@pancakeswap/v3-core/contracts/interfaces/callback/IPancakeV3SwapCallback.sol";
import {FullMath} from "@aperture_finance/uni-v3-lib/src/FullMath.sol";
import {TickMath} from "@aperture_finance/uni-v3-lib/src/TickMath.sol";

import {IPositionManagerDistributor} from "./interfaces/IPositionManagerDistributor.sol";
import {PositionManager} from "./PositionManager.sol";

/**
 * @title PositionManagerDistributor
 * @notice Distributes the rewards of the PositionManager contract
 * @dev The rewards are distributed to the users and the FundsDistributor
 */
contract PositionManagerDistributor is IPositionManagerDistributor, IPancakeV3SwapCallback, Ownable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Maximum percentage value with 4 decimals
    uint256 public constant MAX_PERCENTAGE = 1_000_000;

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
     * @dev Parameters to create the PositionManager contract
     * @param dataFeedAddress Address of the data feed used to get the token1 price in USD
     * @param poolAddress Address of the main PancakeSwap V3 pool
     * @param pool0Address Address of the pool to swap USDT to token0
     * @param pool1Address Address of the pool to swap USDT to token1
     * @param fundsDistributorAddress Address of the funds distributor contract
     * @param fundsDistributorFeePercentage Percentage of the funds destined to the funds distributor
     */
    struct CreatePositionManagerParams {
        address dataFeedAddress;
        address poolAddress;
        address pool0Address;
        address pool1Address;
        address fundsDistributorAddress;
        uint256 fundsDistributorFeePercentage;
    }

    /// @notice Pool of USDT/WNative
    IPancakeV3Pool public immutable pool;

    /// @notice PositionManager contract
    PositionManager public immutable sharesContract;

    /// @notice USDT address
    IERC20 public immutable usdt;

    /// @notice WNative address
    IERC20 public immutable wnative;

    /// @notice Total amount of USDT in the contract owned by the users
    uint256 public usersTotalBalances;

    /// @dev Set of users that have deposited USDT
    EnumerableSet.AddressSet private _usersSet;

    /// @dev Mapping of the balances of the users
    mapping(address => uint256) private _balances;

    /**
     * @notice Constructor
     * @param params Parameters to create the PositionManager contract
     * @param _pool Address of the PancakeSwap V3 pool of USDT/WNative
     */
    constructor(CreatePositionManagerParams memory params, address _pool) {
        if (_pool == address(0)) revert InvalidEntry();

        pool = IPancakeV3Pool(_pool);

        usdt = IERC20(pool.token0());
        wnative = IERC20(pool.token1());

        sharesContract = new PositionManager(
            params.dataFeedAddress,
            params.poolAddress,
            params.pool0Address,
            params.pool1Address,
            address(usdt),
            params.fundsDistributorAddress,
            params.fundsDistributorFeePercentage
        );

        sharesContract.grantRole(0x00, msg.sender);
        sharesContract.revokeRole(0x00, address(this));
    }

    /**
     * @notice Deposit USDT to the positionManager
     * @param depositAmount Amount of USDT to deposit
     */
    function deposit(uint256 depositAmount) external returns (uint256 shares) {
        _usersSet.add(msg.sender);

        return sharesContract.deposit(depositAmount, msg.sender);
    }

    /// @notice Withdraw Funds from the positionManager
    function withdraw() external {
        sharesContract.withdraw(msg.sender);

        _usersSet.remove(msg.sender);
    }

    /**
     * @notice Distribute the rewards accumulated by the PositionManager contract
     * @param fundsDistributor Address of the funds distributor
     * @param fundsDistributorPercentage Percentage of the funds destined to the funds distributor
     * @param amountOutMin Minimum amount of wnative to receive
     * @dev Only the PositionManager contract can call this function
     */
    function distributeRewards(address fundsDistributor, uint256 fundsDistributorPercentage, uint256 amountOutMin) external {
        if (msg.sender != address(sharesContract)) revert WrongCaller();

        uint256 contractBalance = usdt.balanceOf(address(this));

        if (contractBalance <= usersTotalBalances) revert InvalidEntry(); // To distribute the surplus

        uint256 amountToDistribute = contractBalance - usersTotalBalances;

        uint256 totalShares = sharesContract.totalSupply();

        if (totalShares == 0) {
            _swapUsdtAndTransfer(amountToDistribute, amountOutMin, fundsDistributor);

            emit RewardsDistributed(amountToDistribute);
            return;
        }

        // Send fundsDistributorPercentage of the tokens to fundsDistributor
        uint256 fundsDistributorAmount = FullMath.mulDiv(amountToDistribute, fundsDistributorPercentage, MAX_PERCENTAGE);

        _swapUsdtAndTransfer(fundsDistributorAmount, amountOutMin, fundsDistributor);

        amountToDistribute -= fundsDistributorAmount;

        uint256 usersLength = _usersSet.length();

        usersTotalBalances += amountToDistribute;

        for (uint256 i; i < usersLength; i++) {
            address user = _usersSet.at(i);

            // Calculate percentage of the shares over the total supply
            uint256 userPercentage = FullMath.mulDiv(sharesContract.balanceOf(user), MAX_PERCENTAGE, totalShares);

            // Calculate the amount of USDT of that user using the percentage
            uint256 userUsdt = FullMath.mulDiv(amountToDistribute, userPercentage, MAX_PERCENTAGE);

            if (userUsdt == 0) continue; // Should not happen

            _balances[user] += userUsdt;
        }

        emit RewardsDistributed(amountToDistribute + fundsDistributorAmount);
    }

    /// @notice Collect the rewards of the user
    function collectRewards() external {
        uint256 rewards = _balances[msg.sender];

        if (rewards == 0) revert InvalidEntry();

        _balances[msg.sender] = 0;

        usersTotalBalances -= rewards;

        usdt.safeTransfer(msg.sender, rewards);
    }

    /**
     * @notice Get the balance of a user
     * @param user Address of the user
     */
    function balanceOf(address user) external view returns (uint256) {
        return _balances[user];
    }

    /**
     * @notice Get the users set
     * @return Users set
     */
    function usersSet() external view returns (address[] memory) {
        return _usersSet.values();
    }

    function _swapUsdtAndTransfer(uint256 amountIn, uint256 amountOutMin, address recipient) internal {
        if (amountIn == 0) revert InvalidEntry();

        pool.swap(
            address(this),
            true, // token0 to token1
            int256(amountIn),
            uint160(TickMath.MIN_SQRT_RATIO) + 1,
            ""
        );

        uint256 wbnbBalance = wnative.balanceOf(address(this));

        if (wbnbBalance < amountOutMin) revert NotEnoughBalance();

        wnative.safeTransfer(recipient, wbnbBalance);
    }

    function pancakeV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata /*data*/) external {
        if (msg.sender != address(pool)) revert NotPool();

        if (amount0Delta > 0) usdt.safeTransfer(msg.sender, uint256(amount0Delta));
        else if (amount1Delta > 0) wnative.safeTransfer(msg.sender, uint256(amount1Delta));
    }
}
