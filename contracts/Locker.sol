// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Locker
 * @notice A contract that allows everyone to transfer a specified ERC20 token and only the owner to withdraw them.
 */
contract Locker is OwnableUpgradeable {
    using SafeERC20 for IERC20;

    event TokensDeposited(address indexed from, uint256 amount);

    event TokensWithdrawn(uint256 amount);

    error InsufficientBalance(address depositor);

    /// @notice The address of the ERC20 token that can be locked.
    address public immutable lockedToken;

    /// @notice Mapping of user addresses to their locked token balances.
    mapping(address => uint256) public balancesLocked;

    constructor(address _lockedToken) {
        lockedToken = _lockedToken;

        _disableInitializers();
    }

    /// @notice Initializes the Locker contract.
    function initialize() external initializer {
        __Ownable_init(msg.sender);
    }

    /**
     * @notice Transfers tokens to the contract and records the deposit.
     * @param amount The amount of tokens to be transferred.
     */
    function deposit(uint256 amount) external {
        require(amount > 0, InsufficientBalance(msg.sender));

        balancesLocked[msg.sender] += amount;
        IERC20(lockedToken).safeTransferFrom(msg.sender, address(this), amount);

        emit TokensDeposited(msg.sender, amount);
    }

    /**
     * @notice Withdraws tokens from the contract to the owner's address.
     * @param depositor The address of the depositor whose tokens are to be withdrawn.
     */
    function withdraw(address depositor) external onlyOwner returns (uint256) {
        require(balancesLocked[depositor] > 0, InsufficientBalance(depositor));

        uint256 amount = balancesLocked[depositor];
        balancesLocked[depositor] = 0;

        IERC20(lockedToken).safeTransfer(msg.sender, amount);

        emit TokensWithdrawn(amount);

        return amount;
    }
}
