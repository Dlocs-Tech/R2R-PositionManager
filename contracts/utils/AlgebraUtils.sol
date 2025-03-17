// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../interfaces/IV3SwapRouter.sol";

library AlgebraUtils {
    // Swap along an encoded path using known amountIn
    function swap(address _router, bytes memory _path, uint256 _amountIn, uint256 _amountOutMinimum) internal returns (uint256 amountOut) {
        IV3SwapRouter.ExactInputParams memory params = IV3SwapRouter.ExactInputParams({
            path: _path,
            recipient: address(this),
            amountIn: _amountIn,
            amountOutMinimum: _amountOutMinimum
        });
        return IV3SwapRouter(_router).exactInput(params);
    }
}
