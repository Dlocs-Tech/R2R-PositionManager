// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface IPositionManagerDistributor {
    function distributeRewards(address receiverAddress, uint256 receiverPercentage, uint256 amountOutMin) external;
}
