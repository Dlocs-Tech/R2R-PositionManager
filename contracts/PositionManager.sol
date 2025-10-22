// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPancakeV3SwapCallback} from "@pancakeswap/v3-core/contracts/interfaces/callback/IPancakeV3SwapCallback.sol";
import {IPancakeV3Pool} from "@pancakeswap/v3-core/contracts/interfaces/IPancakeV3Pool.sol";
import {LiquidityAmounts} from "@aperture_finance/uni-v3-lib/src/LiquidityAmounts.sol";
import {TickMath} from "@aperture_finance/uni-v3-lib/src/TickMath.sol";

import {IProtocolManager, IAccessControl} from "./interfaces/IProtocolManager.sol";
import {IPositionManager} from "./interfaces/IPositionManager.sol";
import {IPoolLibrary} from "./interfaces/IPoolLibrary.sol";
import {FeeManagement} from "./FeeManagement.sol";

/**
 * @title PositionManager
 * @dev Contract that allows users to deposit and withdraw from a position strategy in PancakeSwap managed by a manager
 *      NOTE: Users deposit baseToken and receive shares in return
 *            Users withdraw shares and receive baseToken in return
 *            All the tokens are expected to have 18 decimals
 *
 *            The operator can make the contract open, close and update a position with the funds deposited by the users
 */
contract PositionManager is IPositionManager, IPancakeV3SwapCallback, FeeManagement, ReentrancyGuard, ERC20 {
    using SafeERC20 for IERC20;

    /// @notice Precision used in the contract
    uint256 public constant PRECISION = 1e36;

    /// @dev Precision used in Chainlink price
    uint256 private constant CHAINLINK_PRECISION = 1e8;

    /// @dev Maximum value for uint128
    uint128 private constant MAX_UINT128 = type(uint128).max;
    
    /// @dev Protocol manager address
    IProtocolManager private immutable _protocolManager;

    /// @dev Locker contract address that will receive non-distributed rewards
    address private immutable _locker;
    
    /// @dev Pool related data
    IPoolLibrary.PoolData public poolData;

    /// @dev Boolean to indicate if the pool is token0/baseToken (true) or baseToken/token0 (false)
    bool private _pool0Direction;

    /// @dev Boolean to indicate if the pool is token1/baseToken (true) or baseToken/token1 (false)
    bool private _pool1Direction;

    /// @dev Token0 of the pool
    IERC20 private _token0;

    /// @dev Token1 of the pool
    IERC20 private _token1;

    /// @dev Max slippage percentage allowed in swaps (1 ether = 100%)
    uint256 private _slippage = 1e17; // 10%

    /// @notice Minimum baseToken deposit amount
    uint256 public minDepositAmount = 10 ether; // 10 baseToken

    /// @dev Lower tick of the position
    int24 private _tickLower;

    /// @dev Upper tick of the position
    int24 private _tickUpper;

    /// @dev Bool switch to prevent reentrancy on the mint callback
    bool private _minting;

    /**
     * @notice Modifier that checks if the caller has the specified role
     * @param role Role to check
     */
    modifier onlyRole(bytes32 role) {
        require(_protocolManager.hasRole(role, msg.sender), IAccessControl.AccessControlUnauthorizedAccount(msg.sender, role));
        _;
    }

    /**
     * @notice Constructor
     * @param poolId ID of the initial pool to set
     */
    constructor(
        uint256 poolId,
        address protocolManager,
        address receiverAddress,
        uint256 receiverPercentage
    ) ERC20("PositionManager", "PM") {
        require(
            receiverAddress != address(0) &&
            receiverPercentage <= MAX_PERCENTAGE &&
            receiverPercentage != 0
            , InvalidInput()
        );

        changePoolData(poolId);
        
        _protocolManager = IProtocolManager(protocolManager);

        baseToken = IERC20(_protocolManager.baseToken());

        _locker = _protocolManager.locker();

        _protocolManager.registerReceiverData(receiverAddress, receiverPercentage);
    }

    /// @inheritdoc IPositionManager
    function deposit(uint256 depositAmount) external nonReentrant returns (uint256 shares) {
        require(depositAmount >= minDepositAmount, InvalidInput());

        _protocolManager.registerDeposit(msg.sender);

        // Transfer baseToken from user to contract
        baseToken.safeTransferFrom(msg.sender, address(this), depositAmount);

        depositAmount = _chargeDepositFee(depositAmount);

        uint256 token1Price = _getChainlinkPrice() * PRECISION;

        // Invest the baseToken in the current position
        if (_tickLower != _tickUpper) {
            // Harvest to collect fees
            _harvest();

            // Burn liquidity from the position
            _burnLiquidity(_tickLower, _tickUpper, _liquidityForShares(_tickLower, _tickUpper, totalSupply()));

            (uint256 amountToken0, uint256 amountToken1) = _getTotalAmounts();

            uint256 poolPrice = _getPoolTokensPrice();

            // If token0 or token1 is baseToken, we need to adjust the amountToken0 or amountToken1
            if (poolData.token0Pool == address(0)) amountToken0 -= depositAmount;
            else if (poolData.token1Pool == address(0)) amountToken1 -= depositAmount;

            uint256 contractLiqInToken1 = Math.mulDiv(amountToken0, poolPrice, PRECISION) + amountToken1;

            uint256 userLiqInToken1 = Math.mulDiv(depositAmount, (PRECISION) * CHAINLINK_PRECISION, token1Price);

            // Calculate shares to mint (totalSupply cannot be 0 if the contract is in position)
            shares = Math.mulDiv(userLiqInToken1, totalSupply(), contractLiqInToken1);

            // Swap token0 or token1 to balance the contract
            _balanceContractTokens(amountToken0, amountToken1, poolPrice);

            poolPrice = _getPoolTokensPrice();

            (amountToken0, amountToken1) = _getTotalAmounts();

            contractLiqInToken1 = Math.mulDiv(amountToken0, poolPrice, PRECISION) + amountToken1;

            uint256 contractLiqInToken0 = Math.mulDiv(contractLiqInToken1, PRECISION, poolPrice);

            uint256 token0Percentage = getRangePercentage(contractLiqInToken0, contractLiqInToken1, poolPrice);

            // Swap baseToken to token0 and token1 maintaining the balance percentage
            _balanceSpecifiedBaseTokenAmount(depositAmount, token1Price, poolPrice, token0Percentage);

            _addLiquidity();
        } else {
            // Case when the contract is not in position
            // Calculate the amount of shares to mint
            shares = Math.mulDiv(depositAmount, token1Price, PRECISION);

            if (totalSupply() > 0) {
                uint256 contractAmount = baseToken.balanceOf(address(this)) - depositAmount;

                uint256 token1ContractAmount = Math.mulDiv(contractAmount, token1Price, PRECISION);

                shares = Math.mulDiv(shares, totalSupply(), token1ContractAmount);
            }
        }

        _mint(msg.sender, shares);

        emit Deposit(msg.sender, shares, depositAmount);
    }

    /// @inheritdoc IPositionManager
    function withdraw() external nonReentrant {
        uint256 shares = balanceOf(msg.sender);

        require(shares > 0, InsufficientBalance());

        _protocolManager.registerWithdraw(msg.sender);

        // Contract is in position
        if (_tickLower != _tickUpper) {
            // Harvest to collect fees
            _harvest();

            // Burn liquidity from the position
            _burnLiquidity(_tickLower, _tickUpper, _liquidityForShares(_tickLower, _tickUpper, totalSupply()));

            (uint256 amountToken0, uint256 amountToken1) = _getTotalAmounts();

            uint256 userAmount0 = Math.mulDiv(amountToken0, shares, totalSupply());
            uint256 userAmount1 = Math.mulDiv(amountToken1, shares, totalSupply());

            if (userAmount0 > 0) _token0.safeTransfer(msg.sender, userAmount0);
            if (userAmount1 > 0) _token1.safeTransfer(msg.sender, userAmount1);

            if (totalSupply() == shares)
                _tickLower = _tickUpper = 0; // Set the contract to not in position
            else {
                // Swap token0 or token1 to balance the contract
                _balanceContractTokens(amountToken0 - userAmount0, amountToken1 - userAmount1, _getPoolTokensPrice());

                _addLiquidity();
            }
        } else {
            // Contract is not in position
            // Calculate the contract balance in baseToken
            uint256 contractAmount = baseToken.balanceOf(address(this));

            // Calculate the amount of baseToken to send to the user
            uint256 userBaseTokenAmount = Math.mulDiv(contractAmount, shares, totalSupply());

            baseToken.safeTransfer(msg.sender, userBaseTokenAmount);
        }

        _burn(msg.sender, shares);

        emit Withdraw(msg.sender, shares);
    }

    /// @inheritdoc IPositionManager
    function addLiquidity(int24 tickLower, int24 tickUpper) external onlyRole(_protocolManager.MANAGER_ROLE()) {
        // Only add liquidity if the contract is not in position
        require(_tickLower == _tickUpper, InvalidInput());

        require(tickLower <= tickUpper, InvalidInput());

        _tickLower = tickLower;
        _tickUpper = tickUpper;

        // Harvest to collect fees
        _harvest();

        uint256 baseTokenAmount = baseToken.balanceOf(address(this));

        require(baseTokenAmount > 0, InvalidInput());

        uint256 token1Price = _getChainlinkPrice() * PRECISION;

        uint256 poolPrice = _getPoolTokensPrice();

        uint256 contractLiqInToken1 = Math.mulDiv(baseTokenAmount, (PRECISION) * CHAINLINK_PRECISION, token1Price);
        uint256 contractLiqInToken0 = Math.mulDiv(contractLiqInToken1, PRECISION, poolPrice);

        // Calculate the percentage of token0 in the pool to know how much to swap
        uint256 token0Percentage = getRangePercentage(contractLiqInToken0, contractLiqInToken1, poolPrice);

        _balanceSpecifiedBaseTokenAmount(baseTokenAmount, token1Price, poolPrice, token0Percentage);

        _addLiquidity();

        emit LiquidityAdded(_tickLower, _tickUpper);
    }

    /// @inheritdoc IPositionManager
    function removeLiquidity() external onlyRole(_protocolManager.MANAGER_ROLE()) {
        // Only remove liquidity if the contract is in position
        require(_tickLower != _tickUpper, InvalidInput());

        // Harvest to collect fees
        _harvest();

        // Burn liquidity from the position
        _burnLiquidity(_tickLower, _tickUpper, _liquidityForShares(_tickLower, _tickUpper, totalSupply()));

        // Swap token0 and token1 to baseToken
        (uint256 amountToken0, uint256 amountToken1) = _getTotalAmounts();

        uint256 token1Price = _getChainlinkPrice() * PRECISION;

        _swapUsingPool(
            IPancakeV3Pool(poolData.token1Pool),
            amountToken1,
            _getAmountMin(amountToken1, token1Price, true),
            _pool1Direction, // token1 to baseToken
            !_pool1Direction
        );

        uint256 poolPrice = _getPoolTokensPrice();

        uint256 amountOutMin = Math.mulDiv(amountToken0, poolPrice, PRECISION); // amountOutMin in token0 to token1

        _swapUsingPool(
            IPancakeV3Pool(poolData.token0Pool),
            amountToken0,
            _getAmountMin(amountOutMin, token1Price, true),
            _pool0Direction, // token0 to baseToken
            !_pool0Direction
        );

        // Set the contract to not in position
        _tickLower = _tickUpper = 0;

        emit LiquidityRemoved(_tickLower, _tickUpper);
    }

    /// @inheritdoc IPositionManager
    function updatePosition(int24 tickLower, int24 tickUpper) external onlyRole(_protocolManager.MANAGER_ROLE()) {
        // Only update position if the contract is in position and new ticks are okay
        require(_tickLower != _tickUpper, InvalidInput());
        require(tickLower <= tickUpper, InvalidInput());

        // Harvest to collect fees
        _harvest();

        // Burn liquidity from the position
        _burnLiquidity(_tickLower, _tickUpper, _liquidityForShares(_tickLower, _tickUpper, totalSupply()));

        _tickLower = tickLower;
        _tickUpper = tickUpper;

        (uint256 amountToken0, uint256 amountToken1) = _getTotalAmounts();

        uint256 poolPrice = _getPoolTokensPrice();

        _balanceContractTokens(amountToken0, amountToken1, poolPrice);

        _addLiquidity();

        emit PositionUpdated(_tickLower, _tickUpper);
    }

    /// @inheritdoc IPositionManager
    function reAddLiquidity() external {
        // Only re add liquidity if the contract is in position
        require(_tickLower != _tickUpper, InvalidInput());

        // Harvest to collect fees
        _harvest();

        (uint256 amountToken0, uint256 amountToken1) = _getTotalAmounts();

        uint256 poolPrice = _getPoolTokensPrice();

        _balanceContractTokens(amountToken0, amountToken1, poolPrice);

        _addLiquidity();

        emit LiquidityAdded(_tickLower, _tickUpper);
    }

    function changePoolData(uint256 poolId) public onlyRole(_protocolManager.MANAGER_ROLE()) {
        // Only change pool data if the contract is not in position
        require(_tickLower == _tickUpper, InvalidInput());

        IPoolLibrary poolLibrary = IPoolLibrary(_protocolManager.poolLibrary());

        poolData = poolLibrary.getPoolData(poolId);

        require(
            poolData.chainlinkDataFeed != address(0) &&
            poolData.chainlinkTimeInterval != 0 &&
            poolData.mainPool != address(0) &&
            (poolData.token0Pool != address(0) || poolData.token1Pool != address(0)),
            InvalidInput()
        ); // Shouldn't happen

        // Determine pool0 direction
        if (poolData.token0Pool != address(0) && IPancakeV3Pool(poolData.token0Pool).token1() == address(baseToken)) _pool0Direction = true;

        // Determine pool1 direction
        if (poolData.token1Pool != address(0) && IPancakeV3Pool(poolData.token1Pool).token1() == address(baseToken)) _pool1Direction = true;

        _token0 = IERC20(IPancakeV3Pool(poolData.mainPool).token0());
        _token1 = IERC20(IPancakeV3Pool(poolData.mainPool).token1());

        emit PoolDataChanged(poolId);
    }

    /// @inheritdoc IPositionManager
    function getRangePercentage(uint256 amount0, uint256 amount1, uint256 poolPrice) public view returns (uint256) {
        (uint160 sqrtPrice, int24 tick) = _priceAndTick();

        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
        uint160 sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(_tickLower);
        uint160 sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(_tickUpper);

        uint128 liquidity0 = LiquidityAmounts.getLiquidityForAmount0Sorted(sqrtPrice, sqrtRatioBX96, amount0);
        uint128 liquidity1 = LiquidityAmounts.getLiquidityForAmount1Sorted(sqrtRatioAX96, sqrtPrice, amount1);

        (amount0, amount1) = LiquidityAmounts.getAmountsForLiquidity(sqrtRatioX96, sqrtRatioAX96, sqrtRatioBX96, liquidity0 + liquidity1);

        uint256 contractLiqInToken0 = Math.mulDiv(amount1, PRECISION, poolPrice);

        return Math.mulDiv(amount0, uint128(PRECISION), amount0 + contractLiqInToken0);
    }

    /// @inheritdoc IPositionManager
    function getTickRange() public view returns (int24, int24) {
        return (_tickLower, _tickUpper);
    }

    /// @inheritdoc IPositionManager
    function setSlippage(uint256 slippage) external onlyRole(_protocolManager.DEFAULT_ADMIN_ROLE()) {
        require(slippage <= MAX_PERCENTAGE, InvalidInput());

        _slippage = slippage;

        emit SlippageUpdated(slippage);
    }

    /// @inheritdoc IPositionManager
    function setMinDepositAmount(uint256 minimumDepositAmount) external onlyRole(_protocolManager.DEFAULT_ADMIN_ROLE()) {
        minDepositAmount = minimumDepositAmount;

        emit MinDepositAmountUpdated(minimumDepositAmount);
    }

    /// @inheritdoc IPositionManager
    function setFee(uint256 depositFeePercentage, address feeReceiverAddress) external onlyRole(_protocolManager.DEFAULT_ADMIN_ROLE()) {
        _setFee(depositFeePercentage, feeReceiverAddress);
    }

    /// @dev Collects the fees from the position, swaps them to baseToken and sends them to the factory
    function _harvest() private {
        (uint256 amountToken0Before, uint256 amountToken1Before) = _getTotalAmounts();

        // Collect fees
        _collect();

        (uint256 amountToken0After, uint256 amountToken1After) = _getTotalAmounts();

        uint256 amountToken0 = amountToken0After - amountToken0Before;
        uint256 amountToken1 = amountToken1After - amountToken1Before;

        uint256 token1Price = _getChainlinkPrice() * PRECISION;

        amountToken1 = _swapUsingPool(
            IPancakeV3Pool(poolData.token1Pool),
            amountToken1,
            _getAmountMin(amountToken1, token1Price, true),
            _pool1Direction, // token1 to baseToken
            !_pool1Direction
        );

        uint256 poolPrice = _getPoolTokensPrice();

        uint256 amountOutMin = Math.mulDiv(amountToken0, poolPrice, PRECISION); // amountOutMin in token0 to token1

        amountToken0 = _swapUsingPool(
            IPancakeV3Pool(poolData.token0Pool),
            amountToken0,
            _getAmountMin(amountOutMin, token1Price, true),
            _pool0Direction, // token0 to baseToken
            !_pool0Direction
        );

        if (amountToken0 + amountToken1 > 0) baseToken.safeTransfer(_locker, amountToken0 + amountToken1);
    }

    /// @dev Balances the contract tokens to maintain the proportion of token0 and token1 in the pool
    function _balanceContractTokens(uint256 amountToken0, uint256 amountToken1, uint256 poolPrice) private {
        uint256 contractLiqInToken0 = Math.mulDiv(amountToken1, PRECISION, poolPrice) + amountToken0;
        uint256 contractLiqInToken1 = Math.mulDiv(amountToken0, poolPrice, PRECISION) + amountToken1;

        // Calculate the percentage of token0 in the pool to know how much to swap
        uint256 token0Percentage = getRangePercentage(contractLiqInToken0, contractLiqInToken1, poolPrice);

        // Calculate the percentage of token0 in the contract
        uint256 currentToken0Percentage = PRECISION - Math.mulDiv(amountToken1, PRECISION, contractLiqInToken1);

        // If the current percentage is higher than the target percentage, we need to swap token0 to token1
        if (currentToken0Percentage > token0Percentage) {
            uint256 amount0ToSwap = amountToken0 - Math.mulDiv(contractLiqInToken0, token0Percentage, PRECISION);

            _swapUsingPool(
                IPancakeV3Pool(poolData.mainPool),
                amount0ToSwap,
                _getAmountMin(amount0ToSwap, poolPrice * CHAINLINK_PRECISION, true), // poolPrice is adjusted to have same precision as chainlink price
                true, // token0 to token1
                false
            );
        } else {
            uint256 token1Percentage = PRECISION - token0Percentage;
            uint256 amount1ToSwap = amountToken1 - Math.mulDiv(contractLiqInToken1, token1Percentage, PRECISION);

            _swapUsingPool(
                IPancakeV3Pool(poolData.mainPool),
                amount1ToSwap,
                _getAmountMin(amount1ToSwap, poolPrice * CHAINLINK_PRECISION, false), // poolPrice is adjusted to have same precision as chainlink price
                false, // token1 to token0
                true
            );
        }
    }

    /// @dev Balances the baseToken amount to maintain the proportion of token0 and token1 in the pool
    function _balanceSpecifiedBaseTokenAmount(uint256 baseTokenAmount, uint256 token1Price, uint256 poolPrice, uint256 token0Percentage) private {
        uint256 amountToSwapToToken0 = Math.mulDiv(baseTokenAmount, token0Percentage, PRECISION);

        uint256 token0Price = Math.mulDiv(token1Price, poolPrice, PRECISION);

        // Swap baseToken to token0
        _swapUsingPool(
            IPancakeV3Pool(poolData.token0Pool),
            amountToSwapToToken0,
            _getAmountMin(amountToSwapToToken0, token0Price, false),
            !_pool0Direction, // baseToken to token0
            _pool0Direction
        );

        uint256 amountToSwapToToken1 = baseTokenAmount - amountToSwapToToken0;

        // Swap baseToken to token1
        _swapUsingPool(
            IPancakeV3Pool(poolData.token1Pool),
            amountToSwapToToken1,
            _getAmountMin(amountToSwapToToken1, token1Price, false),
            !_pool1Direction, // baseToken to token1
            _pool1Direction
        );
    }

    /// @dev Adds liquidity to the position
    function _addLiquidity() private {
        (uint256 amountToken0, uint256 amountToken1) = _getTotalAmounts();

        // Then we fetch how much liquidity we get for adding at the main position ticks with our token balances
        (uint160 sqrtPrice, ) = _priceAndTick();

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPrice,
            TickMath.getSqrtRatioAtTick(_tickLower),
            TickMath.getSqrtRatioAtTick(_tickUpper),
            amountToken0,
            amountToken1
        );

        // Flip minting to true and call the pool to mint the liquidity
        _minting = true;

        IPancakeV3Pool(poolData.mainPool).mint(address(this), _tickLower, _tickUpper, liquidity, "");
    }

    /// @notice Burns liquidity from the position
    function _burnLiquidity(int24 tickLower, int24 tickUpper, uint128 liquidity) private {
        if (liquidity > 0) {
            // Burn liquidity
            IPancakeV3Pool(poolData.mainPool).burn(tickLower, tickUpper, liquidity);

            // Collect amount owed
            _collect();
        }
    }

    function _collect() private {
        uint128 liquidity = _liquidity(_tickLower, _tickUpper);

        // trigger an update of the position fees owed and fee growth snapshots if it has any liquidity
        if (liquidity > 0) IPancakeV3Pool(poolData.mainPool).burn(_tickLower, _tickUpper, 0);

        // the actual amounts collected are returned
        IPancakeV3Pool(poolData.mainPool).collect(address(this), _tickLower, _tickUpper, MAX_UINT128, MAX_UINT128);
    }

    function _getPoolTokensPrice() private view returns (uint256) {
        (, int24 tick) = _priceAndTick();

        uint160 sqrtPriceByTick = TickMath.getSqrtRatioAtTick(tick);

        // Price of token0 over token1
        return Math.mulDiv(uint256(sqrtPriceByTick) * uint256(sqrtPriceByTick), PRECISION, 2 ** (96 * 2));
    }

    function _priceAndTick() private view returns (uint160 sqrtPriceX96, int24 tick) {
        (sqrtPriceX96, tick, , , , , ) = IPancakeV3Pool(poolData.mainPool).slot0();
    }

    function _getTotalAmounts() private view returns (uint256 total0, uint256 total1) {
        total0 = _token0.balanceOf(address(this));
        total1 = _token1.balanceOf(address(this));
    }

    function _getAmountMin(uint256 amount, uint256 price, bool fromToken) private view returns (uint256) {
        uint256 amountOutMin;

        if (fromToken) amountOutMin = Math.mulDiv(amount, price, PRECISION) / CHAINLINK_PRECISION;
        else amountOutMin = Math.mulDiv(amount, (PRECISION) * CHAINLINK_PRECISION, price);

        // amountOutMin with slippage applied
        return Math.mulDiv(amountOutMin, MAX_PERCENTAGE - _slippage, MAX_PERCENTAGE);
    }

    function _getChainlinkPrice() private view returns (uint256) {
        (, int256 price, , uint256 updatedAt, ) = AggregatorV3Interface(poolData.chainlinkDataFeed).latestRoundData();

        require(price > 0 && block.timestamp - poolData.chainlinkTimeInterval <= updatedAt, InvalidInput());

        return uint256(price);
    }

    function _swapUsingPool(
        IPancakeV3Pool pool,
        uint256 amountIn,
        uint256 amountOutMin,
        bool zeroForOne,
        bool sqrtPriceLimitX96Case // false = min, true = max
    ) private returns (uint256) {
        uint256 balanceBefore;

        if (address(pool) == address(0) || amountIn == 0) return amountIn;

        if (zeroForOne) balanceBefore = IERC20(pool.token1()).balanceOf(address(this));
        else balanceBefore = IERC20(pool.token0()).balanceOf(address(this));

        pool.swap(
            address(this),
            zeroForOne,
            int256(amountIn),
            sqrtPriceLimitX96Case ? uint160(TickMath.MAX_SQRT_RATIO) - 1 : uint160(TickMath.MIN_SQRT_RATIO + 1),
            ""
        );

        uint256 amountOut;

        if (zeroForOne) amountOut = IERC20(pool.token1()).balanceOf(address(this)) - balanceBefore;
        else amountOut = IERC20(pool.token0()).balanceOf(address(this)) - balanceBefore;

        require(amountOut >= amountOutMin, NotEnoughBalance());

        return amountOut;
    }

    function _liquidityForShares(int24 tickLower, int24 tickUpper, uint256 shares) private view returns (uint128) {
        uint128 liquidity = _liquidity(tickLower, tickUpper);
        return _uint128Safe(Math.mulDiv(uint256(liquidity), shares, totalSupply()));
    }

    function _liquidity(int24 tickLower, int24 tickUpper) private view returns (uint128 liquidity) {
        bytes32 positionKey = keccak256(abi.encodePacked(address(this), tickLower, tickUpper));
        (liquidity, , , , ) = IPancakeV3Pool(poolData.mainPool).positions(positionKey);
    }

    function _uint128Safe(uint256 x) private pure returns (uint128) {
        assert(x <= MAX_UINT128);
        return uint128(x);
    }

    /// Callback functions

    function pancakeswapV3MintCallback(uint256 amount0, uint256 amount1, bytes memory /*data*/) external {
        require(msg.sender == poolData.mainPool, NotPool());
        require(_minting, InvalidInput());

        if (amount0 > 0) _token0.safeTransfer(poolData.mainPool, amount0);
        if (amount1 > 0) _token1.safeTransfer(poolData.mainPool, amount1);

        _minting = false;
    }

    function pancakeV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata /*data*/) external {
        require(
            msg.sender == poolData.mainPool || msg.sender == poolData.token0Pool || msg.sender == poolData.token1Pool,
            NotPool()
        );

        if (amount0Delta > 0) IERC20(IPancakeV3Pool(msg.sender).token0()).safeTransfer(msg.sender, uint256(amount0Delta));
        else if (amount1Delta > 0) IERC20(IPancakeV3Pool(msg.sender).token1()).safeTransfer(msg.sender, uint256(amount1Delta));
    }

    function pancakeV3MintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata /*data*/) external {
        require(msg.sender == poolData.mainPool, NotPool());

        if (amount0Owed > 0) _token0.safeTransfer(msg.sender, uint256(amount0Owed));
        if (amount1Owed > 0) _token1.safeTransfer(msg.sender, uint256(amount1Owed));
    }
}
