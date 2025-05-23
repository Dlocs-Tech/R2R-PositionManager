// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {LiquidityAmounts} from "@aperture_finance/uni-v3-lib/src/LiquidityAmounts.sol";
import {TickMath} from "@aperture_finance/uni-v3-lib/src/TickMath.sol";
import {FullMath} from "@aperture_finance/uni-v3-lib/src/FullMath.sol";
import {IPancakeV3SwapCallback} from "@pancakeswap/v3-core/contracts/interfaces/callback/IPancakeV3SwapCallback.sol";
import {IPancakeV3Pool} from "@pancakeswap/v3-core/contracts/interfaces/IPancakeV3Pool.sol";

import {IPositionManager} from "./interfaces/IPositionManager.sol";
import {IPositionManagerDistributor} from "./interfaces/IPositionManagerDistributor.sol";
import {FeeManagement} from "./FeeManagement.sol";

/**
 * @title PositionManager
 * @dev Contract that allows users to deposit and withdraw from a position strategy in PancakeSwap managed by a manager
 *      NOTE: Users deposit USDT and receive shares in return
 *            Users withdraw shares and receive USDT or Token0 and Token1 in return
 *
 *            The operator can make the contract open, close and update a position with the funds deposited by the users
 *
 *            This contract involves two receivers, the deposit `feeReceiver` from the FeeManagement contract and the rewards `receiverAddress`
 */
contract PositionManager is IPositionManager, FeeManagement, IPancakeV3SwapCallback, AccessControl, ReentrancyGuard, ERC20 {
    using SafeERC20 for IERC20;

    /// @notice Precision used in the contract
    uint256 public constant PRECISION = 1e36;

    /// @dev Precision used in Chainlink price
    uint256 private constant CHAINLINK_PRECISION = 1e8;

    /// @dev Maximum value for uint128
    uint128 private constant MAX_UINT128 = type(uint128).max;

    /// @dev Time interval to check the Chainlink price
    uint256 private constant TWENTY_MINUTES = 20 minutes;

    /// @notice Manager role
    bytes32 public constant MANAGER_ROLE = keccak256("Position_Manager_Role");

    /// @dev Address of the data feed used to get the token1 price in USD
    AggregatorV3Interface private immutable _dataFeed;

    /// @dev Address of the main PancakeSwap V3 pool (where the position is)
    IPancakeV3Pool private immutable _pool;

    /// @dev Address of the pool to swap USDT to token0 and vice versa (zero if not necessary)
    IPancakeV3Pool private immutable _pool0;

    /// @dev Boolean to indicate if the pool is token0/USDT (true) or USDT/token0 (false)
    bool private immutable _pool0Direction;

    /// @dev Address of the pool to swap USDT to token1 and vice versa (zero if not necessary)
    IPancakeV3Pool private immutable _pool1;

    /// @dev Boolean to indicate if the pool is token1/USDT (true) or USDT/token1 (false)
    bool private immutable _pool1Direction;

    /// @dev Factory address
    address private immutable _factory;

    /// @dev Token0 of the pool
    IERC20 private immutable _token0;

    /// @dev Token1 of the pool
    IERC20 private immutable _token1;

    /// @notice Address of the receiver of the fees
    address public receiverAddress;

    /// @notice Percentage of the funds destined to the receiver
    uint256 public receiverPercentage;

    /// @dev Max slippage percentage allowed in swaps with 4 decimals
    uint256 private _slippage = 10_000; // 1%

    /// @notice Minimum USDT deposit amount
    uint256 public minDepositAmount = 10e18; // 10 USDT

    /// @dev Lower tick of the position
    int24 private _tickLower;

    /// @dev Upper tick of the position
    int24 private _tickUpper;

    /// @dev Bool switch to prevent reentrancy on the mint callback
    bool private _minting;

    /// @dev Modifier to check if the caller is the factory
    modifier onlyFactory() {
        if (msg.sender != _factory) revert InvalidEntry();
        _;
    }

    /**
     * @notice Constructor
     * @param dataFeedAddress Address of the data feed used to get the token1 price in USD
     * @param poolAddress Address of the main PancakeSwap V3 pool
     * @param pool0Address Address of the pool to swap USDT to token0 (zero if token0 is already USDT)
     * @param pool1Address Address of the pool to swap USDT to token1 (zero if token1 is already USDT)
     * @param usdtAddress Address of the USDT token
     * @param receiverAddress_ Address of the receiver of the fees
     * @param receiverFeePercentage_ Percentage of the funds destined to the receiver
     */
    constructor(
        address dataFeedAddress,
        address poolAddress,
        address pool0Address,
        address pool1Address,
        address usdtAddress,
        address receiverAddress_,
        uint256 receiverFeePercentage_
    ) ERC20("PositionManager", "PM") {
        if (
            dataFeedAddress == address(0) ||
            poolAddress == address(0) ||
            usdtAddress == address(0) ||
            receiverAddress_ == address(0) ||
            receiverFeePercentage_ > MAX_PERCENTAGE ||
            receiverFeePercentage_ == 0 ||
            (pool0Address == address(0) && pool1Address == address(0))
        ) revert InvalidInput();

        _dataFeed = AggregatorV3Interface(dataFeedAddress);

        _pool = IPancakeV3Pool(poolAddress);

        _pool0 = IPancakeV3Pool(pool0Address);
        _pool1 = IPancakeV3Pool(pool1Address);

        _token0 = IERC20(_pool.token0());
        _token1 = IERC20(_pool.token1());

        usdt = IERC20(usdtAddress);

        receiverAddress = receiverAddress_;

        receiverPercentage = receiverFeePercentage_;

        _factory = msg.sender;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

        if (address(_pool0) != address(0) && _pool0.token1() == usdtAddress) _pool0Direction = true;
        else if (address(_pool1) != address(0) && _pool1.token1() == usdtAddress) _pool1Direction = true;
    }

    /// @inheritdoc IPositionManager
    function deposit(uint256 depositAmount, address sender) external onlyFactory returns (uint256 shares) {
        if (depositAmount < minDepositAmount) revert InvalidInput();

        // Transfer USDT from user to contract
        usdt.safeTransferFrom(sender, address(this), depositAmount);

        depositAmount = _chargeDepositFee(depositAmount);

        uint256 token1Price = _getChainlinkPrice() * PRECISION;

        // Invest the USDT in the current position
        if (_tickLower != _tickUpper) {
            // Harvest to collect fees
            _harvest();

            // Burn liquidity from the position
            _burnLiquidity(_tickLower, _tickUpper, _liquidityForShares(_tickLower, _tickUpper, totalSupply()));

            (uint256 amountToken0, uint256 amountToken1) = _getTotalAmounts();

            uint256 poolPrice = _getPoolTokensPrice();

            // If token0 or token1 is USDT, we need to adjust the amountToken0 or amountToken1
            if (address(_pool0) == address(0)) amountToken0 -= depositAmount;
            else if (address(_pool1) == address(0)) amountToken1 -= depositAmount;

            uint256 contractLiqInToken1 = FullMath.mulDiv(amountToken0, poolPrice, PRECISION) + amountToken1;

            uint256 userLiqInToken1 = FullMath.mulDiv(depositAmount, (PRECISION) * CHAINLINK_PRECISION, token1Price);

            // Calculate shares to mint (totalSupply cannot be 0 if the contract is in position)
            shares = FullMath.mulDiv(userLiqInToken1, totalSupply(), contractLiqInToken1);

            // Swap token0 or token1 to balance the contract
            _balanceContractTokens(amountToken0, amountToken1, poolPrice);

            poolPrice = _getPoolTokensPrice();

            (amountToken0, amountToken1) = _getTotalAmounts();

            contractLiqInToken1 = FullMath.mulDiv(amountToken0, poolPrice, PRECISION) + amountToken1;

            uint256 contractLiqInToken0 = FullMath.mulDiv(contractLiqInToken1, PRECISION, poolPrice);

            uint256 token0Percentage = getRangePercentage(contractLiqInToken0, contractLiqInToken1, poolPrice);

            // Swap USDT to token0 and token1 maintaining the balance percentage
            _balanceSpecifiedUsdtAmount(depositAmount, token1Price, poolPrice, token0Percentage);

            _addLiquidity();
        } else {
            // Case when the contract is not in position
            // Calculate the amount of shares to mint
            shares = FullMath.mulDiv(depositAmount, token1Price, PRECISION);

            if (totalSupply() > 0) {
                uint256 contractAmount = usdt.balanceOf(address(this)) - depositAmount;

                uint256 token1ContractAmount = FullMath.mulDiv(contractAmount, token1Price, PRECISION);

                shares = FullMath.mulDiv(shares, totalSupply(), token1ContractAmount);
            }
        }

        _mint(sender, shares);

        emit Deposit(sender, shares, depositAmount);
    }

    /// @inheritdoc IPositionManager
    function withdraw(address sender) external onlyFactory nonReentrant {
        uint256 shares = balanceOf(sender);

        if (shares == 0) revert InsufficientBalance();

        // Contract is in position
        if (_tickLower != _tickUpper) {
            // Harvest to collect fees
            _harvest();

            // Burn liquidity from the position
            _burnLiquidity(_tickLower, _tickUpper, _liquidityForShares(_tickLower, _tickUpper, totalSupply()));

            (uint256 amountToken0, uint256 amountToken1) = _getTotalAmounts();

            uint256 userAmount0 = FullMath.mulDiv(amountToken0, shares, totalSupply());
            uint256 userAmount1 = FullMath.mulDiv(amountToken1, shares, totalSupply());

            if (userAmount0 > 0) _token0.safeTransfer(sender, userAmount0);
            if (userAmount1 > 0) _token1.safeTransfer(sender, userAmount1);

            if (totalSupply() == shares)
                _tickLower = _tickUpper = 0; // Set the contract to not in position
            else {
                // Swap token0 or token1 to balance the contract
                _balanceContractTokens(amountToken0 - userAmount0, amountToken1 - userAmount1, _getPoolTokensPrice());

                _addLiquidity();
            }
        } else {
            // Contract is not in position
            // Calculate the contract balance in token1
            uint256 contractAmount = usdt.balanceOf(address(this));

            // Calculate the amount of USDT to send to the user
            uint256 userUsdtAmount = FullMath.mulDiv(contractAmount, shares, totalSupply());

            usdt.safeTransfer(sender, userUsdtAmount);
        }

        _burn(sender, shares);

        emit Withdraw(sender, shares);
    }

    /// @inheritdoc IPositionManager
    function addLiquidity(int24 tickLower, int24 tickUpper) external onlyRole(MANAGER_ROLE) {
        // Only add liquidity if the contract is not in position
        if (_tickLower != _tickUpper) revert InvalidEntry();

        if (tickLower > tickUpper) revert InvalidInput();

        _tickLower = tickLower;
        _tickUpper = tickUpper;

        // Harvest to collect fees
        _harvest();

        uint256 usdtAmount = usdt.balanceOf(address(this));

        if (usdtAmount == 0) revert InvalidEntry();

        uint256 token1Price = _getChainlinkPrice() * PRECISION;

        uint256 poolPrice = _getPoolTokensPrice();

        uint256 contractLiqInToken1 = FullMath.mulDiv(usdtAmount, (PRECISION) * CHAINLINK_PRECISION, token1Price);
        uint256 contractLiqInToken0 = FullMath.mulDiv(contractLiqInToken1, PRECISION, poolPrice);

        // Calculate the percentage of token0 in the pool to know how much to swap
        uint256 token0Percentage = getRangePercentage(contractLiqInToken0, contractLiqInToken1, poolPrice);

        _balanceSpecifiedUsdtAmount(usdtAmount, token1Price, poolPrice, token0Percentage);

        _addLiquidity();

        emit LiquidityAdded(_tickLower, _tickUpper);
    }

    /// @inheritdoc IPositionManager
    function removeLiquidity() external onlyRole(MANAGER_ROLE) {
        // Only remove liquidity if the contract is in position
        if (_tickLower == _tickUpper) revert InvalidInput();

        // Harvest to collect fees
        _harvest();

        // Burn liquidity from the position
        _burnLiquidity(_tickLower, _tickUpper, _liquidityForShares(_tickLower, _tickUpper, totalSupply()));

        // Swap token0 and token1 to USDT
        (uint256 amountToken0, uint256 amountToken1) = _getTotalAmounts();

        uint256 token1Price = _getChainlinkPrice() * PRECISION;

        _swapUsingPool(
            _pool1,
            amountToken1,
            _getAmountMin(amountToken1, token1Price, true),
            _pool1Direction, // token1 to USDT
            !_pool1Direction
        );

        uint256 poolPrice = _getPoolTokensPrice();

        uint256 amountOutMin = FullMath.mulDiv(amountToken0, poolPrice, PRECISION); // amountOutMin in token0 to token1

        _swapUsingPool(
            _pool0,
            amountToken0,
            _getAmountMin(amountOutMin, token1Price, true),
            _pool0Direction, // token0 to USDT
            !_pool0Direction
        );

        // Set the contract to not in position
        _tickLower = _tickUpper = 0;

        emit LiquidityRemoved(_tickLower, _tickUpper);
    }

    /// @inheritdoc IPositionManager
    function updatePosition(int24 tickLower, int24 tickUpper) external onlyRole(MANAGER_ROLE) {
        // Only update position if the contract is in position and new ticks are okay
        if (_tickLower == _tickUpper) revert InvalidEntry();
        if (tickLower > tickUpper) revert InvalidInput();

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
        if (_tickLower == _tickUpper) revert InvalidEntry();

        // Harvest to collect fees
        _harvest();

        (uint256 amountToken0, uint256 amountToken1) = _getTotalAmounts();

        uint256 poolPrice = _getPoolTokensPrice();

        _balanceContractTokens(amountToken0, amountToken1, poolPrice);

        _addLiquidity();

        emit LiquidityAdded(_tickLower, _tickUpper);
    }

    /// @inheritdoc IPositionManager
    function distributeRewards(uint256 amountOutMin) external onlyRole(MANAGER_ROLE) {
        IPositionManagerDistributor(_factory).distributeRewards(receiverAddress, receiverPercentage, amountOutMin);
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

        uint256 contractLiqInToken0 = FullMath.mulDiv(amount1, PRECISION, poolPrice);

        return FullMath.mulDiv(amount0, uint128(PRECISION), amount0 + contractLiqInToken0);
    }

    /// @inheritdoc IPositionManager
    function getTickRange() public view returns (int24, int24) {
        return (_tickLower, _tickUpper);
    }

    /// @inheritdoc IPositionManager
    function setReceiverData(address receiverAddress_, uint256 receiverFeePercentage_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (receiverFeePercentage_ > MAX_PERCENTAGE || receiverFeePercentage_ == 0 || receiverAddress_ == address(0)) revert InvalidInput();

        receiverAddress = receiverAddress_;
        receiverPercentage = receiverFeePercentage_;

        emit ReceiverDataUpdated(receiverAddress_, receiverFeePercentage_);
    }

    /// @inheritdoc IPositionManager
    function setSlippage(uint256 slippage) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (slippage > MAX_PERCENTAGE) revert InvalidInput();

        _slippage = slippage;

        emit SlippageUpdated(slippage);
    }

    /// @inheritdoc IPositionManager
    function setMinDepositAmount(uint256 minimumDepositAmount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minDepositAmount = minimumDepositAmount;

        emit MinDepositAmountUpdated(minimumDepositAmount);
    }

    /// @inheritdoc IPositionManager
    function setFee(uint256 depositFeePercentage, address feeReceiverAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setFee(depositFeePercentage, feeReceiverAddress);
    }

    /// @dev Collects the fees from the position, swaps them to USDT and sends them to the factory
    function _harvest() private {
        (uint256 amountToken0Before, uint256 amountToken1Before) = _getTotalAmounts();

        // Collect fees
        _collect();

        (uint256 amountToken0After, uint256 amountToken1After) = _getTotalAmounts();

        uint256 amountToken0 = amountToken0After - amountToken0Before;
        uint256 amountToken1 = amountToken1After - amountToken1Before;

        uint256 token1Price = _getChainlinkPrice() * PRECISION;

        amountToken1 = _swapUsingPool(
            _pool1,
            amountToken1,
            _getAmountMin(amountToken1, token1Price, true),
            _pool1Direction, // token1 to USDT
            !_pool1Direction
        );

        uint256 poolPrice = _getPoolTokensPrice();

        uint256 amountOutMin = FullMath.mulDiv(amountToken0, poolPrice, PRECISION); // amountOutMin in token0 to token1

        amountToken0 = _swapUsingPool(
            _pool0,
            amountToken0,
            _getAmountMin(amountOutMin, token1Price, true),
            _pool0Direction, // token0 to USDT
            !_pool0Direction
        );

        if (amountToken0 + amountToken1 > 0) usdt.safeTransfer(_factory, amountToken0 + amountToken1);
    }

    /// @dev Balances the contract tokens to maintain the proportion of token0 and token1 in the pool
    function _balanceContractTokens(uint256 amountToken0, uint256 amountToken1, uint256 poolPrice) private {
        uint256 contractLiqInToken0 = FullMath.mulDiv(amountToken1, PRECISION, poolPrice) + amountToken0;
        uint256 contractLiqInToken1 = FullMath.mulDiv(amountToken0, poolPrice, PRECISION) + amountToken1;

        // Calculate the percentage of token0 in the pool to know how much to swap
        uint256 token0Percentage = getRangePercentage(contractLiqInToken0, contractLiqInToken1, poolPrice);

        // Calculate the percentage of token0 in the contract
        uint256 currentToken0Percentage = PRECISION - FullMath.mulDiv(amountToken1, PRECISION, contractLiqInToken1);

        // If the current percentage is higher than the target percentage, we need to swap token0 to token1
        if (currentToken0Percentage > token0Percentage) {
            uint256 amount0ToSwap = amountToken0 - FullMath.mulDiv(contractLiqInToken0, token0Percentage, PRECISION);

            _swapUsingPool(
                _pool,
                amount0ToSwap,
                _getAmountMin(amount0ToSwap, poolPrice * CHAINLINK_PRECISION, true), // poolPrice is adjusted to have same precision as chainlink price
                true, // token0 to token1
                false
            );
        } else {
            uint256 token1Percentage = PRECISION - token0Percentage;
            uint256 amount1ToSwap = amountToken1 - FullMath.mulDiv(contractLiqInToken1, token1Percentage, PRECISION);

            _swapUsingPool(
                _pool,
                amount1ToSwap,
                _getAmountMin(amount1ToSwap, poolPrice * CHAINLINK_PRECISION, false), // poolPrice is adjusted to have same precision as chainlink price
                false, // token1 to token0
                true
            );
        }
    }

    /// @dev Balances the USDT amount to maintain the proportion of token0 and token1 in the pool
    function _balanceSpecifiedUsdtAmount(uint256 usdtAmount, uint256 token1Price, uint256 poolPrice, uint256 token0Percentage) private {
        uint256 amountToSwapToToken0 = FullMath.mulDiv(usdtAmount, token0Percentage, PRECISION);

        uint256 token0Price = FullMath.mulDiv(token1Price, poolPrice, PRECISION);

        // Swap USDT to token0
        _swapUsingPool(
            _pool0,
            amountToSwapToToken0,
            _getAmountMin(amountToSwapToToken0, token0Price, false),
            !_pool0Direction, // USDT to token0
            _pool0Direction
        );

        uint256 amountToSwapToToken1 = usdtAmount - amountToSwapToToken0;

        // Swap USDT to token1
        _swapUsingPool(
            _pool1,
            amountToSwapToToken1,
            _getAmountMin(amountToSwapToToken1, token1Price, false),
            !_pool1Direction, // USDT to token1
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

        _pool.mint(address(this), _tickLower, _tickUpper, liquidity, "");
    }

    /// @notice Burns liquidity from the position
    function _burnLiquidity(int24 tickLower, int24 tickUpper, uint128 liquidity) private {
        if (liquidity > 0) {
            // Burn liquidity
            _pool.burn(tickLower, tickUpper, liquidity);

            // Collect amount owed
            _collect();
        }
    }

    function _collect() private {
        uint128 liquidity = _liquidity(_tickLower, _tickUpper);

        // trigger an update of the position fees owed and fee growth snapshots if it has any liquidity
        if (liquidity > 0) _pool.burn(_tickLower, _tickUpper, 0);

        // the actual amounts collected are returned
        _pool.collect(address(this), _tickLower, _tickUpper, MAX_UINT128, MAX_UINT128);
    }

    function _getPoolTokensPrice() private view returns (uint256) {
        (, int24 tick) = _priceAndTick();

        uint160 sqrtPriceByTick = TickMath.getSqrtRatioAtTick(tick);

        // Price of token0 over token1
        return FullMath.mulDiv(uint256(sqrtPriceByTick) * uint256(sqrtPriceByTick), PRECISION, 2 ** (96 * 2));
    }

    function _priceAndTick() private view returns (uint160 sqrtPriceX96, int24 tick) {
        (sqrtPriceX96, tick, , , , , ) = _pool.slot0();
    }

    function _getTotalAmounts() private view returns (uint256 total0, uint256 total1) {
        total0 = _token0.balanceOf(address(this));
        total1 = _token1.balanceOf(address(this));
    }

    function _getAmountMin(uint256 amount, uint256 price, bool fromToken) private view returns (uint256) {
        uint256 amountOutMin;

        if (fromToken) amountOutMin = FullMath.mulDiv(amount, price, PRECISION) / CHAINLINK_PRECISION;
        else amountOutMin = FullMath.mulDiv(amount, (PRECISION) * CHAINLINK_PRECISION, price);

        // amountOutMin with slippage applied
        return FullMath.mulDiv(amountOutMin, MAX_PERCENTAGE - _slippage, MAX_PERCENTAGE);
    }

    function _getChainlinkPrice() private view returns (uint256) {
        (, int256 price, , uint256 updatedAt, ) = _dataFeed.latestRoundData();

        if (price <= 0 || block.timestamp - TWENTY_MINUTES > updatedAt) revert InvalidInput();

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

        if (amountOut < amountOutMin) revert NotEnoughBalance();

        return amountOut;
    }

    function _liquidityForShares(int24 tickLower, int24 tickUpper, uint256 shares) private view returns (uint128) {
        uint128 liquidity = _liquidity(tickLower, tickUpper);
        return _uint128Safe(FullMath.mulDiv(uint256(liquidity), shares, totalSupply()));
    }

    function _liquidity(int24 tickLower, int24 tickUpper) private view returns (uint128 liquidity) {
        bytes32 positionKey = keccak256(abi.encodePacked(address(this), tickLower, tickUpper));
        (liquidity, , , , ) = _pool.positions(positionKey);
    }

    function _uint128Safe(uint256 x) private pure returns (uint128) {
        assert(x <= MAX_UINT128);
        return uint128(x);
    }

    /// Callback functions

    function pancakeswapV3MintCallback(uint256 amount0, uint256 amount1, bytes memory /*data*/) external {
        if (msg.sender != address(_pool)) revert NotPool();
        if (!_minting) revert InvalidEntry();

        if (amount0 > 0) _token0.safeTransfer(address(_pool), amount0);
        if (amount1 > 0) _token1.safeTransfer(address(_pool), amount1);

        _minting = false;
    }

    function pancakeV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata /*data*/) external {
        if (msg.sender != address(_pool) && msg.sender != address(_pool0) && msg.sender != address(_pool1)) revert NotPool();

        if (amount0Delta > 0) IERC20(IPancakeV3Pool(msg.sender).token0()).safeTransfer(msg.sender, uint256(amount0Delta));
        else if (amount1Delta > 0) IERC20(IPancakeV3Pool(msg.sender).token1()).safeTransfer(msg.sender, uint256(amount1Delta));
    }

    function pancakeV3MintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata /*data*/) external {
        if (msg.sender != address(_pool)) revert NotPool();

        if (amount0Owed > 0) _token0.safeTransfer(msg.sender, uint256(amount0Owed));
        if (amount1Owed > 0) _token1.safeTransfer(msg.sender, uint256(amount1Owed));
    }
}
