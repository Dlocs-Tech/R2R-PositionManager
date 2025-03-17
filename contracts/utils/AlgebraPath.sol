// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.6.0;

import "./BytesLib.sol";

/// @title Functions for manipulating path data for multihop swaps
/// @dev Credit to Uniswap Labs under GPL-2.0-or-later license:
/// https://github.com/Uniswap/v3-periphery
library Path {
    using BytesLib for bytes;

    /// @dev The length of the bytes encoded address
    uint256 private constant ADDR_SIZE = 20;

    /// @dev The offset of a single token address and pool fee
    uint256 private constant NEXT_OFFSET = ADDR_SIZE;

    /// @notice Decodes the first pool in path
    /// @param path The bytes encoded swap path
    /// @return tokenA The first token of the given pool
    /// @return tokenB The second token of the given pool
    function decodeFirstPool(bytes memory path) internal pure returns (address tokenA, address tokenB) {
        tokenA = path.toAddress(0);
        tokenB = path.toAddress(NEXT_OFFSET);
    }
}
