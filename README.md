# R2R-PositionManager

A series of contracts to maintain and control a given liquidity position on the decentralised Pancakeswap exchange.

These expose position actions to users with the manager role (adding and removing liquidity manually or through a bot) and basic operations to users (depositing, withdrawing and claiming rewards).

The contract manages users' balances through shares as Beefy vaults, but adds new features such as deposit fees, freeze operations, optimisations, etc.
