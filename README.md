# 🧠 R2R-PositionManager

**R2R-PositionManager** is a suite of smart contracts designed to manage and optimize liquidity positions on the decentralized PancakeSwap exchange. This system introduces a modular and gas-efficient approach to liquidity management, enabling both automated and manual strategies while providing reward distribution and fee collection.

---

## ⚙️ Overview

The architecture is split into two core contracts:

### 🏧 PositionManagerDistributor (PMD)

The **entry point for users**, responsible for:
- Depositing and withdrawing user funds.
- Distributing rewards to users (via manager role).
- Collecting and forwarding generated pool fees.
- Performing **optimized reward distribution** using historical deposit/withdraw information.
- Optionally forwarding a percentage of distributed rewards to a configured **receiver address**.

### 🧪 PositionManager

The **backend logic** that:
- Handles the actual liquidity provision and removal on PancakeSwap.
- Maintaining internal accounting through a **share-based system** (inspired by Beefy vaults).
- Interacts with a **single liquidity pool per instance**.
- Is responsible for:
  - Executing user deposits and withdrawals.
  - Charging a **deposit fee** or enforcing a **minimum deposit amount**.
  - Letting managers adjust the position range and provide/remove liquidity.
  - **Harvesting fees** (PancakeSwap fees) on every interaction and forwarding them to the PMD.

---

## 🚀 Key Features

- ✅ **Role-based access control** (managers vs users).
- 💸 **Gas-efficient swaps and liquidity actions** – minimum token movement and swap logic.
- 📈 **Auto-fee harvesting** – all actions harvest PancakeSwap fees.
- 📊 **Share-based accounting** – robust handling of fractional ownership and rewards.
- 🪙 **Deposit fees & freeze mechanisms** – for protocol sustainability and strategy constraints.
- 📤 **Optional reward forwarding** – PMD can route a portion of rewards to a configured receiver.

---

## 🛠️ Installation

Clone the repo and install dependencies:

```bash
git clone https://github.com/your-org/R2R-PositionManager.git
cd R2R-PositionManager
yarn
```

Set up your environment:

```bash
cp .env.example .env
```

---

## 🥪 Testing

This project uses **Hardhat** for forked mainnet testing (e.g., PancakeSwap interactions):

```bash
yarn test
```

---

## 🧑‍💻 Usage

### ➕ User Deposit

```solidity
positionManagerDistributor.deposit(depositAmount);
```

### ➖ User Withdraw

```solidity
positionManagerDistributor.withdraw();
```

### 💰 Distribute Rewards (Manager Only)

```solidity
positionManager.distributeRewards(amountOutMin);
```

### 📉 Add Liquidity (Manager Only)

```solidity
positionManager.addLiquidity(tickLower, tickUpper);
```

### ↺ Adjust Range & Remove Liquidity

```solidity
positionManager.updatePosition(tickLower, tickUpper);
positionManager.removeLiquidity();
```

---

## 🛡 Security & Considerations

- All critical actions are gated behind role checks (`manager`).
- Harvesting and fee forwarding happen automatically with every action to avoid idle fee accumulation.

---

## 🧾 License

MIT © R2R

