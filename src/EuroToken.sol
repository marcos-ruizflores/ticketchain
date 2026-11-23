// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title EuroToken (EURT)
/// @notice Test euro stablecoin used to pay for tickets. Not backed by anything,
/// anyone can grab a few euros from the faucet to try the app.
contract EuroToken is ERC20, Ownable {
    uint256 public constant FAUCET_AMOUNT = 500e6; // 500 EURT
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    mapping(address => uint256) public lastClaim;

    error FaucetCooldown(uint256 availableAt);

    constructor(address initialOwner) ERC20("Test Euro", "EURT") Ownable(initialOwner) {}

    /// @dev Same as EURC and USDC, so 1 EURT = 1_000_000 units.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function claim() external {
        uint256 last = lastClaim[msg.sender];
        if (last != 0 && block.timestamp < last + FAUCET_COOLDOWN) {
            revert FaucetCooldown(last + FAUCET_COOLDOWN);
        }
        lastClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
