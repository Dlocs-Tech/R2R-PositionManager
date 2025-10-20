// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import {ILocker} from "./interfaces/ILocker.sol";
import {IPoolLibrary} from "./interfaces/IPoolLibrary.sol";

/**
 * @title ProtocolManager
 * @notice Creates PositionManager contracts, track their users and distribute rewards
 */
contract ProtocolManager is AccessControlUpgradeable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Maximum percentage value (1 ether = 100%)
    uint256 public constant MAX_PERCENTAGE = 1 ether;

    /// @notice Manager role - keccak256("Manager_Role");
    bytes32 public constant MANAGER_ROLE = 0x1eadf3185fed4caafe449eaa3bcb8ec2ba553a99cf86639f798bb21c84bf86e1;

    /// @notice Base token used for rewards distribution
    IERC20 public immutable baseToken;

    event RewardCollected(address indexed user, address indexed positionManager, uint256 amount);

    error InsufficientBalance(address depositor, address positionManager);

    error ZeroAddress();

    struct ProtocolManagerStorage {
        /// @dev Set of users that have deposited per PositionManager
        mapping (address positionManager => EnumerableSet.AddressSet) _depositors;

        /// @dev Mapping of the claimeable balances of the users per PositionManager
        mapping (address positionManager => mapping(address user => uint256)) _claimableBalances;

        /// @dev Locker contract where non-distributed rewards are sent
        ILocker locker;

        /// @dev Pool library contract where pool data is stored
        IPoolLibrary poolLibrary;
    }

    // keccak256(abi.encode(uint256(keccak256("ProtocolManager")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant ProtocolManagerStorageLocation = 0x8b27ba22233c01dfe411c4c00887b900ebd9262f85ebdd7d13909f8157ab1f00;

    function _getProtocolManagerStorage() private pure returns (ProtocolManagerStorage storage $) {
        assembly {
            $.slot := ProtocolManagerStorageLocation
        }
    }

    /**
     * @notice Constructor
     * @param _baseToken Base token address
     */
    constructor(address _baseToken) {
        require(_baseToken != address(0), ZeroAddress());

        baseToken = IERC20(_baseToken);

        _disableInitializers();
    }

    function initialize(address _locker, address _poolLibrary) external initializer {
        require(_locker != address(0) || _poolLibrary != address(0), ZeroAddress());

        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();
        $.locker = ILocker(_locker);
        $.poolLibrary = IPoolLibrary(_poolLibrary);
    }

    function registerDeposit(address depositor) external {
        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();

        $._depositors[msg.sender].add(depositor);

        // Event not needed since PositionManager emits Deposit event
    }

    function registerWithdraw(address depositor) external {
        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();

        $._depositors[msg.sender].remove(depositor);

        // Event not needed since PositionManager emits Withdraw event
    }

    // function distributeRewards(address positionManager, address receiverAddress, uint256 receiverPercentage, uint256 amountOutMin) external onlyRole(MANAGER_ROLE) {
    //     uint256 contractBalance = baseToken.balanceOf(address(this));

    //     if (contractBalance <= usersTotalBalances) revert InvalidEntry(); // To distribute the surplus

    //     uint256 amountToDistribute = contractBalance - usersTotalBalances;

    //     uint256 totalShares = sharesContract.totalSupply();

    //     if (totalShares == 0) {
    //         _swapUsdtAndTransfer(amountToDistribute, amountOutMin, receiverAddress);

    //         emit RewardsDistributed(amountToDistribute);
    //         return;
    //     }

    //     // Send receiverPercentage of the tokens to receiver
    //     uint256 receiverAmount = Math.mulDiv(amountToDistribute, receiverPercentage, MAX_PERCENTAGE);

    //     _swapUsdtAndTransfer(receiverAmount, amountOutMin, receiverAddress);

    //     amountToDistribute -= receiverAmount;

    //     uint256 usersLength = _usersSet.length();

    //     usersTotalBalances += amountToDistribute;

    //     for (uint256 i; i < usersLength; i++) {
    //         address user = _usersSet.at(i);

    //         // Calculate percentage of the shares over the total supply
    //         uint256 userPercentage = Math.mulDiv(sharesContract.balanceOf(user), MAX_PERCENTAGE, totalShares);

    //         // Calculate the amount of USDT of that user using the percentage
    //         uint256 userUsdt = Math.mulDiv(amountToDistribute, userPercentage, MAX_PERCENTAGE);

    //         if (userUsdt == 0) continue; // Should not happen

    //         _balances[user] += userUsdt;
    //     }

    //     emit RewardsDistributed(amountToDistribute + receiverAmount);
    // }

    function collectRewards(address positionManager) external {
        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();
        mapping (address => uint256) storage _userBalances = $._claimableBalances[positionManager];

        uint256 rewards = _userBalances[msg.sender];

        if (rewards == 0) revert InsufficientBalance(msg.sender, positionManager);

        _userBalances[msg.sender] = 0;

        baseToken.safeTransfer(msg.sender, rewards);

        emit RewardCollected(msg.sender, positionManager, rewards);
    }

    function claimableRewards(address positionManager, address user) external view returns (uint256) {
        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();
        return $._claimableBalances[positionManager][user];
    }

    function locker() external view returns (address) {
        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();
        return address($.locker);
    }

    function poolLibrary() external view returns (address) {
        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();
        return address($.poolLibrary);
    }

    function usersSet(address positionManager) external view returns (address[] memory) {
        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();
        return $._depositors[positionManager].values();
    }
}
