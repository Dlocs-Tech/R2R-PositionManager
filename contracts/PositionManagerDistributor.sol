// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {FullMath} from "@aperture_finance/uni-v3-lib/src/FullMath.sol";

import {IPositionManagerDistributor} from "./interfaces/IPositionManagerDistributor.sol";
import {IFundsDistributor} from "./interfaces/IFundsDistributor.sol";
import {IV3SwapRouter} from "./interfaces/IV3SwapRouter.sol";
import {PositionManager} from "./PositionManager.sol";

/**
 * @title PositionManagerDistributor
 * @notice Distributes the rewards of the PositionManager contract
 * @dev The rewards are distributed to the users and the FundsDistributor
 */
contract PositionManagerDistributor is IPositionManagerDistributor, Ownable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @dev Maximum percentage value with 4 decimals
    uint256 public constant MAX_PERCENTAGE = 1_000_000;

    /// @dev Fee used in swaps from USDT to wnative
    uint24 public constant FEE = 100;

    /// @dev Error thrown when the caller is not the PositionManager contract
    error WrongCaller();

    /// @dev Error thrown when the input is invalid
    error InvalidEntry();

    /**
     * @notice Event emitted when the rewards are distributed
     * @param amount Amount of USDT distributed
     */
    event RewardsDistributed(uint256 amount);

    /**
     * @dev Parameters to create the PositionManager contract
     * @param swapRouter Address of the swap router
     * @param usdtToToken0Path Path used to swap USDT to token0
     * @param usdtToToken1Path Path used to swap USDT to token1
     * @param token0ToUsdtPath Path used to swap token0 to USDT
     * @param token1ToUsdtPath Path used to swap token1 to USDT
     * @param dataFeed Address of the data feed used to get the token1 price in USD
     * @param pool Address of the PancakeSwap V3 pool
     * @param fundsDistributor Address of the funds distributor contract
     * @param fundsDistributorPercentage Percentage of the funds destined to the funds distributor
     */
    struct CreatePositionManagerParams {
        address swapRouter;
        bytes usdtToToken0Path;
        bytes usdtToToken1Path;
        bytes token0ToUsdtPath;
        bytes token1ToUsdtPath;
        address dataFeed;
        address pool;
        address fundsDistributor;
        uint256 fundsDistributorPercentage;
    }

    /// @notice PositionManager contract
    PositionManager public immutable sharesContract;

    /// @notice USDT address
    IERC20 public immutable usdt;

    /// @notice WNative address
    IERC20 public immutable wnative;

    /// @notice SwapRouter address
    IV3SwapRouter public immutable swapRouter;

    /// @notice Total amount of USDT in the contract owned by the users
    uint256 public usersTotalBalances;

    /// @notice Set of users that have deposited USDT
    EnumerableSet.AddressSet private _usersSet;

    /// @notice Mapping of the balances of the users
    mapping(address => uint256) private _balances;

    /**
     * @notice Constructor
     * @param params Parameters to create the PositionManager contract
     */
    constructor(CreatePositionManagerParams memory params) {
        address _swapRouter = IFundsDistributor(params.fundsDistributor).swapRouter();
        address _wnative = IFundsDistributor(params.fundsDistributor).wnative();
        address _usdt = IFundsDistributor(params.fundsDistributor).usdt();

        if (_usdt == address(0) || _wnative == address(0) || _swapRouter == address(0)) revert InvalidEntry();

        usdt = IERC20(_usdt);
        wnative = IERC20(_wnative);
        swapRouter = IV3SwapRouter(_swapRouter);

        sharesContract = new PositionManager(
            params.swapRouter,
            params.usdtToToken0Path,
            params.usdtToToken1Path,
            params.token0ToUsdtPath,
            params.token1ToUsdtPath,
            _usdt,
            params.dataFeed,
            params.pool,
            params.fundsDistributor,
            params.fundsDistributorPercentage
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

    /**
     * @notice Withdraw Funds from the positionManager
     */
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
            _approveToken(usdt, address(swapRouter), amountToDistribute);

            uint256 wbnbTotalBalance = swapRouter.exactInputSingle(
                IV3SwapRouter.ExactInputSingleParams({
                    tokenIn: address(usdt),
                    tokenOut: address(wnative),
                    fee: FEE,
                    recipient: address(this),
                    amountIn: amountToDistribute,
                    amountOutMinimum: amountOutMin,
                    sqrtPriceLimitX96: 0
                })
            );

            wnative.safeTransfer(fundsDistributor, wbnbTotalBalance);

            emit RewardsDistributed(amountToDistribute);
            return;
        }

        // Send fundsDistributorPercentage of the tokens to fundsDistributor
        uint256 fundsDistributorAmount = FullMath.mulDiv(amountToDistribute, fundsDistributorPercentage, MAX_PERCENTAGE);

        _approveToken(usdt, address(swapRouter), fundsDistributorAmount);

        uint256 wbnbBalance = swapRouter.exactInputSingle(
            IV3SwapRouter.ExactInputSingleParams({
                tokenIn: address(usdt),
                tokenOut: address(wnative),
                fee: FEE,
                recipient: address(this),
                amountIn: fundsDistributorAmount,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            })
        );

        wnative.safeTransfer(fundsDistributor, wbnbBalance);

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

        sharesContract.usdt().safeTransfer(msg.sender, rewards);
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

    function _approveToken(IERC20 token, address spender, uint256 amount) internal {
        if (token.allowance(address(this), spender) > 0) token.safeApprove(spender, 0);

        token.safeApprove(spender, amount);
    }
}
