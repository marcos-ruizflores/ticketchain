// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EuroToken} from "../src/EuroToken.sol";

contract EuroTokenTest is Test {
    EuroToken euro;
    address alice = makeAddr("alice");

    function setUp() public {
        vm.warp(1_700_000_000);
        euro = new EuroToken(address(this));
    }

    function test_UsesSixDecimals() public view {
        assertEq(euro.decimals(), 6);
    }

    function test_Claim_GivesFaucetAmount() public {
        vm.prank(alice);
        euro.claim();
        assertEq(euro.balanceOf(alice), euro.FAUCET_AMOUNT());
    }

    function test_Claim_HasCooldown() public {
        vm.startPrank(alice);
        euro.claim();
        uint256 next = block.timestamp + 1 days;
        vm.expectRevert(abi.encodeWithSelector(EuroToken.FaucetCooldown.selector, next));
        euro.claim();

        vm.warp(next);
        euro.claim();
        vm.stopPrank();
        assertEq(euro.balanceOf(alice), 2 * euro.FAUCET_AMOUNT());
    }

    function test_Mint_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        euro.mint(alice, 1e6);
    }
}
