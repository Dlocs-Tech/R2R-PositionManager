// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title ILocker
 */
interface ILocker {
    event TokensDeposited(address indexed from, uint256 amount);

    event TokensWithdrawn(uint256 amount);

    error InsufficientBalance(address depositor);

    /// @notice The address of the ERC20 token that can be locked.
    function lockedToken() external view returns (address);

    /**
     * @notice Transfers tokens to the contract and records the deposit.
     * @param amount The amount of tokens to be transferred.
     */
    function deposit(uint256 amount) external;

    /**
     * @notice Withdraws tokens from the contract to the owner's address.
     * @param depositor The address of the depositor whose tokens are to be withdrawn.
     * @return The amount of tokens withdrawn.
     */
    function withdraw(address depositor) external returns (uint256);
}
