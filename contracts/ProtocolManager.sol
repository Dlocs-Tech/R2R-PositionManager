// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import {ILocker} from "./interfaces/ILocker.sol";
import {IPoolLibrary} from "./interfaces/IPoolLibrary.sol";
import {IProtocolManager} from "./interfaces/IProtocolManager.sol";

/**
 * @title ProtocolManager
 * @notice Creates PositionManager contracts, track their users and distribute rewards: TODO:
 */
contract ProtocolManager is IProtocolManager, AccessControlUpgradeable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Maximum percentage value (1 ether = 100%)
    uint256 public constant MAX_PERCENTAGE = 1 ether;

    /// @notice Manager role - keccak256("Manager_Role");
    bytes32 public constant MANAGER_ROLE = 0x1eadf3185fed4caafe449eaa3bcb8ec2ba553a99cf86639f798bb21c84bf86e1;

    /// @notice Base token used for rewards distribution
    IERC20 public immutable baseToken;

    event RewardsDistributed(uint256 totalAmount);

    event RewardCollected(address indexed user, address indexed positionManager, uint256 amount);

    event ReceiverDataRegistered(address indexed positionManager, address receiverAddress, uint256 receiverPercentage);

    event LockerUpdated(address newLocker);

    event PoolLibraryUpdated(address newPoolLibrary);

    error InsufficientBalance(address depositor, address positionManager);

    error ZeroBalance();

    error ZeroAddress();

    struct PositionManagerData {
        /// @dev Set of users that have deposited in the PositionManager
        EnumerableSet.AddressSet _depositors;

        /// @dev Mapping of the claimeable balances of the users
        mapping(address user => uint256) _claimableBalances;

        /// @dev Receiver address for a percentage of the rewards
        address receiverAddress;

        /// @dev Percentage of the rewards to be sent to the receiver address (1 ether = 100%)
        uint256 receiverPercentage;
    }

    struct ProtocolManagerStorage {
        mapping (address positionManager => PositionManagerData) _positionManagersData;

        /// @dev Locker contract where non-distributed rewards are sent
        ILocker _locker;

        /// @dev Pool library contract where pool data is stored
        IPoolLibrary _poolLibrary;
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
        require(_locker != address(0) && _poolLibrary != address(0), ZeroAddress());

        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();
        $._locker = ILocker(_locker);
        $._poolLibrary = IPoolLibrary(_poolLibrary);
    }

    function registerDeposit(address depositor) external {
        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();

        $._positionManagersData[msg.sender]._depositors.add(depositor);

        // Event not needed since PositionManager emits Deposit event
    }

    function registerWithdraw(address depositor) external {
        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();

        $._positionManagersData[msg.sender]._depositors.remove(depositor);

        // Event not needed since PositionManager emits Withdraw event
    }

    function registerReceiverData(address receiverAddress, uint256 receiverPercentage) external {
        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();

        PositionManagerData storage pmData = $._positionManagersData[msg.sender];

        pmData.receiverAddress = receiverAddress;
        pmData.receiverPercentage = receiverPercentage;

        emit ReceiverDataRegistered(msg.sender, receiverAddress, receiverPercentage);
    }

    function distributeRewards(address positionManager) external {
        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();

        // Withdraw the tokens from the locker (fails if no balance)
        uint256 totalAmountToDistribute = $._locker.withdraw(positionManager);

        uint256 totalShares = IERC20(positionManager).totalSupply();

        PositionManagerData storage pmData = $._positionManagersData[positionManager];

        if (totalShares == 0) {
            baseToken.safeTransfer(pmData.receiverAddress, totalAmountToDistribute);
        } else {
            // Send receiverPercentage of the tokens to receiver
            uint256 receiverAmount = Math.mulDiv(totalAmountToDistribute, pmData.receiverPercentage, MAX_PERCENTAGE);

            baseToken.safeTransfer(pmData.receiverAddress, receiverAmount);

            uint256 amountToDistribute = totalAmountToDistribute - receiverAmount;

            EnumerableSet.AddressSet storage _depositors = pmData._depositors;

            uint256 usersLength = _depositors.length();

            for (uint256 i; i < usersLength; i++) {
                address user = _depositors.at(i);

                // Calculate percentage of the shares over the total supply
                uint256 userPercentage = Math.mulDiv(IERC20(positionManager).balanceOf(user), MAX_PERCENTAGE, totalShares);

                // Calculate the amount of baseToken of that user using the percentage
                uint256 userBaseToken = Math.mulDiv(amountToDistribute, userPercentage, MAX_PERCENTAGE);

                if (userBaseToken == 0) continue; // Should never happen

                pmData._claimableBalances[user] += userBaseToken;
            }
        }

        emit RewardsDistributed(totalAmountToDistribute);
    }

    function collectRewards(address positionManager) external {
        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();
        mapping (address => uint256) storage _userBalances = $._positionManagersData[positionManager]._claimableBalances;

        uint256 rewards = _userBalances[msg.sender];

        require (rewards != 0, InsufficientBalance(msg.sender, positionManager));

        _userBalances[msg.sender] = 0;

        baseToken.safeTransfer(msg.sender, rewards);

        emit RewardCollected(msg.sender, positionManager, rewards);
    }

    function claimableRewards(address positionManager, address user) external view returns (uint256) {
        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();
        return $._positionManagersData[positionManager]._claimableBalances[user];
    }

    function locker() external view returns (address) {
        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();
        return address($._locker);
    }

    function poolLibrary() external view returns (address) {
        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();
        return address($._poolLibrary);
    }

    function usersSet(address positionManager) external view returns (address[] memory) {
        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();
        return $._positionManagersData[positionManager]._depositors.values();
    }

    function getDefaultAdminRole() external pure returns (bytes32) {
        return DEFAULT_ADMIN_ROLE;
    }

    function setLocker(address newLocker) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newLocker != address(0), ZeroAddress());

        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();
        $._locker = ILocker(newLocker);

        emit LockerUpdated(newLocker);
    }

    function setPoolLibrary(address newPoolLibrary) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newPoolLibrary != address(0), ZeroAddress());

        ProtocolManagerStorage storage $ = _getProtocolManagerStorage();
        $._poolLibrary = IPoolLibrary(newPoolLibrary);

        emit PoolLibraryUpdated(newPoolLibrary);
    }
}
