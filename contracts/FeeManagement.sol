// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title FeeManagement
 * @dev Contract that charges a specific amount of fee (in base token) on deposit
 * NOTE: If the deposit amount is too small, rounding errors may occur
 */
abstract contract FeeManagement {
    using SafeERC20 for IERC20;

    /// @notice Maximum percentage value (1 ether = 100%)
    uint256 public constant MAX_PERCENTAGE = 1 ether;

    /// @notice Maximum fee percentage value (1 ether = 100%)
    uint256 public constant MAX_FEE_PERCENTAGE = 1e17; // 10%

    /// @dev Error thrown when an invalid input is provided
    error InvalidInput();

    /// @dev Error thrown when the fee receiver is not set
    error FeeReceiverNotSet();

    /// @notice Event emitted when the fee is changed
    event FeeChanged(uint256 depositFee, address feeReceiver);

    /// @notice Event emitted when a fee is charged
    event FeeCharged(uint256 fee);

    /// @notice Address of the base token
    IERC20 public immutable baseToken;

    /// @notice Fee to be charged on deposit in percentage (1 ether = 100%)
    uint256 public depositFee;

    /// @notice Address to receive the fee
    address public feeReceiver;

    /// @dev Should be called by the derived contract with access control
    function _setFee(uint256 depositFeePercentage, address feeReceiverAddress) internal {
        require(depositFeePercentage <= MAX_FEE_PERCENTAGE, InvalidInput());

        depositFee = depositFeePercentage;
        feeReceiver = feeReceiverAddress;

        emit FeeChanged(depositFeePercentage, feeReceiverAddress);
    }

    function _chargeDepositFee(uint256 amount) internal returns (uint256) {
        uint256 fee = Math.mulDiv(amount, depositFee, MAX_PERCENTAGE);

        _chargeFee(fee);

        return amount - fee;
    }

    function _chargeFee(uint256 fee) private {
        if (fee > 0) {
            require(feeReceiver != address(0), FeeReceiverNotSet());

            baseToken.safeTransfer(feeReceiver, fee);

            emit FeeCharged(fee);
        }
    }
}
