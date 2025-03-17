// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface IPositionManagerDistributor {
    function distributeRewards(address fundsDistributor, uint256 fundsDistributorPercentage, uint256 amountOutMin) external;
}
