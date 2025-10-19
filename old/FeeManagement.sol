// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {FullMath} from "@aperture_finance/uni-v3-lib/src/FullMath.sol";

/**
 * @title FeeManagement
 * @dev Contract that charges a specific amount of fee (in USDT) on deposit
 * NOTE: If the deposit amount is too small, rounding errors may occur
 */
contract FeeManagement {
    using SafeERC20 for IERC20;

    /// @notice Maximum percentage value with 4 decimals
    uint256 public constant MAX_PERCENTAGE = 1_000_000; // 100%

    /// @notice Maximum fee percentage value with 4 decimals
    uint256 public constant MAX_FEE_PERCENTAGE = 100_000; // 10%

    /// @dev Error thrown when an invalid input is provided
    error InvalidEntry();

    /// @notice Event emitted when the fee is changed
    event FeeChanged(uint256 depositFee, address feeReceiver);

    /// @notice Event emitted when a fee is charged
    event FeeCharged(uint256 fee);

    /// @notice Address of the USDT token
    IERC20 public immutable usdt;

    /// @notice Fee to be charged on deposit in percentage with 4 decimals
    uint256 public depositFee;

    /// @notice Address to receive the fee
    address public feeReceiver;

    /// @dev Should be called by the derived contract with access control
    function _setFee(uint256 depositFeePercentage, address feeReceiverAddress) internal {
        if (depositFeePercentage > MAX_FEE_PERCENTAGE) revert InvalidEntry();

        depositFee = depositFeePercentage;
        feeReceiver = feeReceiverAddress;

        emit FeeChanged(depositFeePercentage, feeReceiverAddress);
    }

    function _chargeDepositFee(uint256 amount) internal returns (uint256) {
        uint256 fee = FullMath.mulDiv(amount, depositFee, MAX_PERCENTAGE);

        _chargeFee(fee);

        return amount - fee;
    }

    function _chargeFee(uint256 fee) private {
        if (fee > 0) {
            usdt.safeTransfer(feeReceiver, fee);

            emit FeeCharged(fee);
        }
    }
}
