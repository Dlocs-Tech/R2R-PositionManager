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

import {IPositionManagerDistributor} from "./interfaces/IPositionManagerDistributor.sol";
import {FeeManagement} from "./FeeManagement.sol";

/**
 * @title PositionManager
 * @dev Contract that let users join or leave a position strategy in PancakeSwap managed by a manager
 *      NOTE: Users deposit USDT and receive shares in return
 *            Users withdraw shares and receive USDT or Token0 and Token1 in return
 *
 *            The operator can make the contract open or close a position with the funds deposited by the users
 */
contract PositionManager is FeeManagement, IPancakeV3SwapCallback, AccessControl, ReentrancyGuard, ERC20 {
    using SafeERC20 for IERC20;

    /// @notice Precision used in the contract
    uint256 public constant PRECISION = 1e36;

    /// @notice Manager role
    bytes32 public constant MANAGER_ROLE = keccak256("Position_Manager_Role");

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
     * @param liquidity Amount of liquidity added
     */
    event LiquidityAdded(int24 tickLower, int24 tickUpper, uint256 liquidity);

    /**
     * @notice Event emitted when liquidity is removed from the position
     * @param tickLower Lower tick of the position
     * @param tickUpper Upper tick of the position
     * @param liquidity Amount of liquidity removed
     */
    event LiquidityRemoved(int24 tickLower, int24 tickUpper, uint256 liquidity);

    /// @dev Address of the data feed used to get the token1 price in USD
    AggregatorV3Interface internal immutable _dataFeed;

    /// @dev Address of the main PancakeSwap V3 pool (where the position is)
    IPancakeV3Pool internal immutable _pool;

    /// @dev Address of the pool to swap USDT to token0 and vice versa (zero if not necessary)
    IPancakeV3Pool internal immutable _pool0;

    /// @dev Boolean to indicate if the pool is token0/USDT (true) or USDT/token0 (false)
    bool internal immutable _pool0Direction;

    /// @dev Address of the pool to swap USDT to token1 and vice versa (zero if not necessary)
    IPancakeV3Pool internal immutable _pool1;

    /// @dev Boolean to indicate if the pool is token1/USDT (true) or USDT/token1 (false)
    bool internal immutable _pool1Direction;

    /// @dev Factory address
    address internal immutable _factory;

    /// @dev Token0 of the pool
    IERC20 internal immutable _token0;

    /// @dev Token1 of the pool
    IERC20 internal immutable _token1;

    /// @notice Address of the funds distributor contract
    address public fundsDistributor;

    /// @notice Percentage of the funds destined to the funds distributor
    uint256 public fundsDistributorPercentage;

    /// @dev Max slippage percentage allowed in swaps with 4 decimals
    uint256 internal _slippage = 10_000; // 1%

    /// @notice Minimum USDT deposit amount
    uint256 public minDepositAmount = 10e18; // 10 USDT

    /// @dev Lower tick of the position
    int24 internal _tickLower;

    /// @dev Upper tick of the position
    int24 internal _tickUpper;

    /// @dev Bool switch to prevent reentrancy on the mint callback
    bool internal _minting;

    /// @dev Modifier to check if the caller is the factory
    modifier onlyFactory() {
        if (msg.sender != _factory) revert InvalidEntry();
        _;
    }

    /**
     * @notice Constructor
     * @param dataFeedAddress Address of the data feed used to get the token1 price in USD
     * @param poolAddress Address of the main PancakeSwap V3 pool
     * @param pool0Address Address of the pool to swap USDT to token0 (zero if not necessary)
     * @param pool1Address Address of the pool to swap USDT to token1 (zero if not necessary)
     * @param usdtAddress Address of the USDT token
     * @param fundsDistributorAddress Address of the funds distributor contract
     * @param fundsDistributorFeePercentage Percentage of the funds destined to the funds distributor
     */
    constructor(
        address dataFeedAddress,
        address poolAddress,
        address pool0Address,
        address pool1Address,
        address usdtAddress,
        address fundsDistributorAddress,
        uint256 fundsDistributorFeePercentage
    ) ERC20("PositionManager", "PM") {
        if (
            dataFeedAddress == address(0) ||
            poolAddress == address(0) ||
            usdtAddress == address(0) ||
            fundsDistributorAddress == address(0) ||
            fundsDistributorFeePercentage > MAX_PERCENTAGE ||
            fundsDistributorFeePercentage == 0
        ) revert InvalidInput();

        _dataFeed = AggregatorV3Interface(dataFeedAddress);

        _pool = IPancakeV3Pool(poolAddress);

        _pool0 = IPancakeV3Pool(pool0Address);

        _pool1 = IPancakeV3Pool(pool1Address);

        _token0 = IERC20(_pool.token0());
        _token1 = IERC20(_pool.token1());

        usdt = IERC20(usdtAddress);

        fundsDistributor = fundsDistributorAddress;

        fundsDistributorPercentage = fundsDistributorFeePercentage;

        _factory = msg.sender;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

        if (address(_pool0) != address(0) && _pool0.token1() == usdtAddress) _pool0Direction = true;

        if (address(_pool1) != address(0) && _pool1.token1() == usdtAddress) _pool1Direction = true;
    }

    function _getPoolTokensPrice() internal view returns (uint256) {
        (, int24 tick) = _priceAndTick();

        uint160 sqrtPriceByTick = TickMath.getSqrtRatioAtTick(tick);

        // Price of token0 over token1
        return FullMath.mulDiv(uint256(sqrtPriceByTick) * uint256(sqrtPriceByTick), PRECISION, 2 ** (96 * 2));
    }

    /**
     * @notice Function to deposit USDT and receive shares in return
     * @param depositAmount Amount of USDT to deposit
     * @return shares Amount of shares received
     * @dev The user must approve the contract to spend the USDT before calling this function
     */
    function deposit(uint256 depositAmount, address sender) external onlyFactory returns (uint256 shares) {
        if (depositAmount < minDepositAmount) revert InvalidInput();

        // Transfer USDT from user to contract
        usdt.safeTransferFrom(sender, address(this), depositAmount);

        depositAmount = _chargeDepositFee(depositAmount);

        uint256 token1Price = _getChainlinkPrice() * PRECISION;

        // Invest the USDT in the current position if the contract is in position
        if (_tickLower != _tickUpper) {
            _harvest();

            // Burn liquidity from the position
            _burnLiquidity(_tickLower, _tickUpper, _liquidityForShares(_tickLower, _tickUpper, totalSupply()));

            (uint256 bal0, uint256 bal1) = getTotalAmounts();

            uint256 price = _getPoolTokensPrice();

            uint256 userLiq = FullMath.mulDiv(depositAmount, (PRECISION) * 10 ** 8, token1Price);

            if (address(_pool0) == address(0)) bal0 -= depositAmount;
            else if (address(_pool1) == address(0)) bal1 -= depositAmount;

            uint256 totalLiq = FullMath.mulDiv(bal0, price, PRECISION) + bal1;

            // Calculate shares to mint (totalSupply cannot be 0 if the contract is in position)
            shares = FullMath.mulDiv(userLiq, totalSupply(), totalLiq);

            // Calculate the percentage of the pool
            uint256 percentage0 = getRangePercentage(FullMath.mulDiv(totalLiq, PRECISION, price), totalLiq);

            // Fix the amounts of the contract (bal0 and bal1) to comply with the percentage
            uint256 currentPercentage0 = PRECISION - FullMath.mulDiv(bal1, PRECISION, totalLiq);

            if (currentPercentage0 > percentage0) {
                uint256 totalLiq0 = bal0 + FullMath.mulDiv(bal1, PRECISION, price);
                uint256 amount0ToSwap = bal0 - FullMath.mulDiv(totalLiq0, percentage0, PRECISION);

                _swapUsingPool(
                    _pool,
                    amount0ToSwap,
                    _getAmountMin(amount0ToSwap, token1Price, false),
                    true, // token0 to token1
                    false
                );
            } else {
                uint256 percentage1 = PRECISION - percentage0;
                uint256 amount1ToSwap = bal1 - FullMath.mulDiv(totalLiq, percentage1, PRECISION);

                _swapUsingPool(
                    _pool,
                    amount1ToSwap,
                    _getAmountMin(amount1ToSwap, price, true),
                    false, // token1 to token0
                    true
                );
            }

            // Get new percentage0
            price = _getPoolTokensPrice();

            (bal0, bal1) = getTotalAmounts();
            totalLiq = FullMath.mulDiv(bal0, price, PRECISION) + bal1;
            percentage0 = getRangePercentage(FullMath.mulDiv(totalLiq, PRECISION, price), totalLiq);

            uint256 amountToSwapToToken0 = FullMath.mulDiv(depositAmount, percentage0, PRECISION);

            uint256 token0Price = FullMath.mulDiv(token1Price, price, PRECISION);

            // Swap USDT to token0
            _swapUsingPool(
                _pool0,
                amountToSwapToToken0,
                _getAmountMin(amountToSwapToToken0, token0Price, false),
                !_pool0Direction, // USDT to token0
                _pool0Direction
            );

            uint256 amountToSwapToToken1 = depositAmount - amountToSwapToToken0;

            // Swap USDT to token1
            _swapUsingPool(
                _pool1,
                amountToSwapToToken1,
                _getAmountMin(amountToSwapToToken1, token1Price, false),
                !_pool1Direction, // USDT to token1
                _pool1Direction
            );

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

    /**
     * @notice Function to withdraw shares and receive funds in return
     * @dev The user must have shares to withdraw
     *      NOTE: If the contract is in position, the user will receive token0 and token1
     *            If the contract is not in position, the user will receive USDT
     */
    function withdraw(address sender) external onlyFactory nonReentrant {
        uint256 shares = balanceOf(sender);

        if (shares == 0) revert InsufficientBalance();

        // Contract is in position
        if (_tickLower != _tickUpper) {
            _harvest();

            // Burn liquidity from the position
            _burnLiquidity(_tickLower, _tickUpper, _liquidityForShares(_tickLower, _tickUpper, totalSupply()));

            uint256 userAmount0 = FullMath.mulDiv(_token0.balanceOf(address(this)), shares, totalSupply());
            uint256 userAmount1 = FullMath.mulDiv(_token1.balanceOf(address(this)), shares, totalSupply());

            if (userAmount0 > 0) _token0.safeTransfer(sender, userAmount0);
            if (userAmount1 > 0) _token1.safeTransfer(sender, userAmount1);

            if (totalSupply() == shares)
                _tickLower = _tickUpper = 0; // Set the contract to not in position
            else _addLiquidity();
        } else {
            // Contract is not in position
            // Calculate the contract balance in token1
            uint256 contractAmount = usdt.balanceOf(address(this));

            // Calculate the amount of usdt to send to the user
            uint256 userUsdtAmount = FullMath.mulDiv(contractAmount, shares, totalSupply());

            usdt.safeTransfer(sender, userUsdtAmount);
        }

        _burn(sender, shares);

        emit Withdraw(sender, shares);
    }

    /**
     * @notice Function to add liquidity to the position
     * @param tickLower Lower tick of the position
     * @param tickUpper Upper tick of the position
     * @dev Only the manager can call this function
     */
    function addLiquidity(int24 tickLower, int24 tickUpper) external onlyRole(MANAGER_ROLE) {
        // Only add liquidity if the contract is not in position and there are funds in the contract
        if (_tickLower != _tickUpper) revert InvalidEntry();
        if (totalSupply() == 0) revert InvalidInput(); // Shouldn't happen

        if (tickLower > tickUpper) revert InvalidInput();

        _tickLower = tickLower;
        _tickUpper = tickUpper;

        _harvest();

        // Calculate the amount of USDT to swap
        uint256 usdtAmount = usdt.balanceOf(address(this));

        if (usdtAmount == 0) revert InvalidEntry();

        uint256 token1Price = _getChainlinkPrice() * PRECISION;

        // Price of token0 over token1
        uint256 price = _getPoolTokensPrice();

        uint256 token0Price = FullMath.mulDiv(token1Price, price, PRECISION);

        uint256 contractLiq = FullMath.mulDiv(usdtAmount, (PRECISION) * 10 ** 8, token1Price);

        // Calculate the amount of usdt to swap to token0 and token1
        uint256 percentage0 = getRangePercentage(FullMath.mulDiv(contractLiq, PRECISION, price), contractLiq);

        uint256 amountToSwapToToken0 = FullMath.mulDiv(usdtAmount, percentage0, PRECISION);
        uint256 amountToSwapToToken1 = usdtAmount - amountToSwapToToken0;

        // Swap USDT to token0
        _swapUsingPool(
            _pool0,
            amountToSwapToToken0,
            _getAmountMin(amountToSwapToToken0, token0Price, false),
            !_pool0Direction, // USDT to token0
            _pool0Direction
        );

        // Swap USDT to token1
        _swapUsingPool(
            _pool1,
            amountToSwapToToken1,
            _getAmountMin(amountToSwapToToken1, token1Price, false),
            !_pool1Direction, // USDT to token1
            _pool1Direction
        );

        _addLiquidity();
    }

    /**
     * @notice Function to remove liquidity from the position
     * @dev Only the manager can call this function
     */
    function removeLiquidity() external onlyRole(MANAGER_ROLE) {
        // Only remove liquidity if the contract is in position
        if (_tickLower == _tickUpper) revert InvalidInput();
        if (totalSupply() == 0) revert InvalidInput(); // Shouldn't happen

        _harvest();

        _burnLiquidity(_tickLower, _tickUpper, _liquidityForShares(_tickLower, _tickUpper, totalSupply()));

        // Swap token0 and token1 to USDT
        (uint256 token0Amount, uint256 token1Amount) = getTotalAmounts();

        uint256 token1Price = _getChainlinkPrice() * PRECISION;

        _swapUsingPool(
            _pool1,
            token1Amount,
            _getAmountMin(token1Amount, token1Price, true),
            _pool1Direction, // token1 to USDT
            !_pool1Direction
        );

        uint256 price = _getPoolTokensPrice();

        uint256 amountOutMin = FullMath.mulDiv(token0Amount, price, PRECISION); // amountOutMin in token0 to token1

        _swapUsingPool(
            _pool0,
            token0Amount,
            _getAmountMin(amountOutMin, token1Price, true),
            _pool0Direction, // token0 to USDT
            !_pool0Direction
        );

        // Set the contract to not in position
        _tickLower = _tickUpper = 0;
    }

    function updatePosition(int24 tickLower, int24 tickUpper) external onlyRole(MANAGER_ROLE) {
        // Only update position if the contract is in position and new ticks are okay
        if (_tickLower == _tickUpper) revert InvalidEntry();
        if (tickLower > tickUpper) revert InvalidInput();

        _tickLower = tickLower;
        _tickUpper = tickUpper;

        _harvest();

        // Burn liquidity from the position
        _burnLiquidity(_tickLower, _tickUpper, _liquidityForShares(_tickLower, _tickUpper, totalSupply()));

        (uint256 bal0, uint256 bal1) = getTotalAmounts();

        uint256 price = _getPoolTokensPrice();

        uint256 totalLiq = FullMath.mulDiv(bal0, price, PRECISION) + bal1;

        // Calculate the percentage of the pool
        uint256 percentage0 = getRangePercentage(FullMath.mulDiv(totalLiq, PRECISION, price), totalLiq);

        // Fix the amounts of the contract (bal0 and bal1) to comply with the percentage
        uint256 currentPercentage0 = PRECISION - FullMath.mulDiv(bal1, PRECISION, totalLiq);

        if (currentPercentage0 > percentage0) {
            uint256 token1Price = _getChainlinkPrice() * PRECISION;

            uint256 totalLiq0 = bal0 + FullMath.mulDiv(bal1, PRECISION, price);
            uint256 amount0ToSwap = bal0 - FullMath.mulDiv(totalLiq0, percentage0, PRECISION);

            _swapUsingPool(
                _pool,
                amount0ToSwap,
                _getAmountMin(amount0ToSwap, token1Price, false),
                true, // token0 to token1
                false
            );
        } else {
            uint256 percentage1 = PRECISION - percentage0;
            uint256 amount1ToSwap = bal1 - FullMath.mulDiv(totalLiq, percentage1, PRECISION);

            _swapUsingPool(
                _pool,
                amount1ToSwap,
                _getAmountMin(amount1ToSwap, price, true),
                false, // token1 to token0
                true
            );
        }

        _addLiquidity();
    }

    /// @notice Function to distribute the rewards
    function distributeRewards(uint256 amountOutMin) external onlyRole(MANAGER_ROLE) {
        IPositionManagerDistributor(_factory).distributeRewards(fundsDistributor, fundsDistributorPercentage, amountOutMin);
    }

    /// @dev This percentage is of amount0
    function getRangePercentage(uint256 amount0, uint256 amount1) public view returns (uint256) {
        (uint160 sqrtPriceX96, , , , , , ) = _pool.slot0();

        uint160 sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(_tickLower);
        uint160 sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(_tickUpper);

        uint128 liquidity0 = LiquidityAmounts.getLiquidityForAmount0Sorted(sqrtPriceX96, sqrtRatioBX96, amount0);
        uint128 liquidity1 = LiquidityAmounts.getLiquidityForAmount1Sorted(sqrtRatioAX96, sqrtPriceX96, amount1);

        return FullMath.mulDiv(liquidity0, uint128(PRECISION), liquidity0 + liquidity1);
    }

    /// @notice Function to get the current tick range of the position
    /// @dev The ticks are the same if the contract is not in position
    function getTickRange() public view returns (int24, int24) {
        return (_tickLower, _tickUpper);
    }

    function getTotalAmounts() public view returns (uint256 total0, uint256 total1) {
        total0 = _token0.balanceOf(address(this));
        total1 = _token1.balanceOf(address(this));
    }

    function setFundsDistributor(address fundsDistributorAddress, uint256 fundsDistributorFeePercentage) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (fundsDistributorFeePercentage > MAX_PERCENTAGE || fundsDistributorFeePercentage == 0 || fundsDistributorAddress == address(0))
            revert InvalidInput();

        fundsDistributor = fundsDistributorAddress;
        fundsDistributorPercentage = fundsDistributorFeePercentage;
    }

    function setSlippage(uint256 slippage) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (slippage > MAX_PERCENTAGE) revert InvalidInput();
        _slippage = slippage;
    }

    function setMinDepositAmount(uint256 minimumDepositAmount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minDepositAmount = minimumDepositAmount;
    }

    function setFee(uint256 depositFeePercentage, address feeReceiverAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setFee(depositFeePercentage, feeReceiverAddress);
    }

    function _harvest() internal {
        (uint256 pool0Before, uint256 pool1Before) = getTotalAmounts();

        // Collect fees
        _collect();

        (uint256 pool0After, uint256 pool1After) = getTotalAmounts();

        uint256 amount0 = pool0After - pool0Before;
        uint256 amount1 = pool1After - pool1Before;

        uint256 token1Price = _getChainlinkPrice() * PRECISION;

        // Swap token1 to USDT
        amount1 = _swapUsingPool(
            _pool1,
            amount1,
            _getAmountMin(amount1, token1Price, true),
            _pool1Direction, // token1 to USDT
            !_pool1Direction
        );

        uint256 price = _getPoolTokensPrice();

        uint256 amountOutMin = FullMath.mulDiv(amount0, PRECISION, price); // amountOutMin in token0 to token1

        // Swap token0 to USDT
        amount0 = _swapUsingPool(
            _pool0,
            amount0,
            _getAmountMin(amountOutMin, token1Price, true),
            _pool0Direction, // token0 to USDT
            !_pool0Direction
        );

        if (amount0 + amount1 > 0) usdt.safeTransfer(_factory, amount0 + amount1);
    }

    /**
     * @notice The sqrt price and the current tick of the pool
     * @return sqrtPriceX96 The sqrt price of the pool
     * @return tick The current tick of the pool
     */
    function _priceAndTick() internal view returns (uint160 sqrtPriceX96, int24 tick) {
        (sqrtPriceX96, tick, , , , , ) = _pool.slot0();
    }

    function _getAmountMin(uint256 amount, uint256 price, bool fromToken) internal view returns (uint256) {
        uint256 amountOutMin;

        if (fromToken)
            amountOutMin = FullMath.mulDiv(amount, price, PRECISION) / 10 ** 8; // 10**8 is the precision of the token1Price
        else amountOutMin = FullMath.mulDiv(amount, (PRECISION) * 10 ** 8, price); // 10**8 is the precision of the token1Price

        // amountOutMin with slippage applied
        return FullMath.mulDiv(amountOutMin, MAX_PERCENTAGE - _slippage, MAX_PERCENTAGE);
    }

    function _getChainlinkPrice() internal view returns (uint256) {
        (, int256 price, , uint256 updatedAt, ) = _dataFeed.latestRoundData();

        if (price <= 0 || block.timestamp - 15 minutes > updatedAt) revert InvalidInput();

        return uint256(price);
    }

    function _swapUsingPool(
        IPancakeV3Pool pool,
        uint256 amountIn,
        uint256 amountOutMin,
        bool zeroForOne,
        bool sqrtPriceLimitX96Case // false = min, true = max
    ) internal returns (uint256) {
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

    function _liquidityForShares(int24 tickLower, int24 tickUpper, uint256 shares) internal view returns (uint128) {
        uint128 liquidity = _liquidity(tickLower, tickUpper);
        return _uint128Safe(FullMath.mulDiv(uint256(liquidity), shares, totalSupply()));
    }

    function _liquidity(int24 tickLower, int24 tickUpper) internal view returns (uint128 liquidity) {
        bytes32 positionKey = keccak256(abi.encodePacked(address(this), tickLower, tickUpper));
        (liquidity, , , , ) = _pool.positions(positionKey);
    }

    function _uint128Safe(uint256 x) internal pure returns (uint128) {
        assert(x <= type(uint128).max);
        return uint128(x);
    }

    /// @notice Adds liquidity to the position
    function _addLiquidity() private {
        (uint256 bal0, uint256 bal1) = getTotalAmounts();

        // Then we fetch how much liquidity we get for adding at the main position ticks with our token balances
        (uint160 sqrtPrice, ) = _priceAndTick();

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPrice,
            TickMath.getSqrtRatioAtTick(_tickLower),
            TickMath.getSqrtRatioAtTick(_tickUpper),
            bal0,
            bal1
        );

        // Flip minting to true and call the pool to mint the liquidity
        _minting = true;
        _pool.mint(address(this), _tickLower, _tickUpper, liquidity, "");

        emit LiquidityAdded(_tickLower, _tickUpper, liquidity);
    }

    /// @notice Burns liquidity from the position
    function _burnLiquidity(int24 tickLower, int24 tickUpper, uint128 liquidity) internal {
        if (liquidity > 0) {
            // Burn liquidity
            _pool.burn(tickLower, tickUpper, liquidity);

            // Collect amount owed
            _collect();

            emit LiquidityRemoved(tickLower, tickUpper, liquidity);
        }
    }

    function _collect() internal {
        /// get liquidity from _liquidity()
        uint128 liquidity = _liquidity(_tickLower, _tickUpper);

        // trigger an update of the position fees owed and fee growth snapshots if it has any liquidity
        if (liquidity > 0) _pool.burn(_tickLower, _tickUpper, 0);

        // the actual amounts collected are returned
        _pool.collect(address(this), _tickLower, _tickUpper, type(uint128).max, type(uint128).max);
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
