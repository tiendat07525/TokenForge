// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {TokenForgeV2} from "../contracts/TokenForgeV2.sol";

/// @notice Fuzz test: Hardhat sinh ngẫu nhiên hàng trăm bộ input cho mỗi hàm `testFuzz_*`.
contract TokenForgeV2FuzzTest is Test {
    uint256 internal constant CAP = 10_000_000e18;
    uint256 internal constant INITIAL = 1_000_000e18;

    TokenForgeV2 internal token;
    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");

    function setUp() public {
        token = new TokenForgeV2(owner, CAP, INITIAL);
    }

    // ---------------- Mint ----------------

    function testFuzz_OwnerMintWithinCap(address to, uint256 amount) public {
        vm.assume(to != address(0));
        amount = bound(amount, 0, CAP - INITIAL);

        uint256 balBefore = token.balanceOf(to);
        vm.prank(owner);
        token.mint(to, amount);

        assertEq(token.totalSupply(), INITIAL + amount);
        assertEq(token.balanceOf(to), balBefore + amount);
        assertLe(token.totalSupply(), token.cap());
    }

    function testFuzz_MintAboveCapReverts(uint256 amount) public {
        // Giới hạn trên để totalSupply + amount không tràn uint256
        amount = bound(amount, CAP - INITIAL + 1, type(uint256).max - INITIAL);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ERC20Capped.ERC20ExceededCap.selector, INITIAL + amount, CAP));
        token.mint(alice, amount);
    }

    function testFuzz_NonOwnerCannotMint(address caller, uint256 amount) public {
        vm.assume(caller != owner);

        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        token.mint(caller, amount);
    }

    // ---------------- Burn ----------------

    function testFuzz_BurnReducesSupply(uint256 amount) public {
        amount = bound(amount, 0, INITIAL);

        vm.prank(owner);
        token.burn(amount);

        assertEq(token.totalSupply(), INITIAL - amount);
        assertEq(token.balanceOf(owner), INITIAL - amount);
        assertEq(token.remainingMintable(), CAP - INITIAL + amount);
    }

    function testFuzz_BurnMoreThanBalanceReverts(uint256 given, uint256 extra) public {
        given = bound(given, 0, INITIAL);
        extra = bound(extra, 1, type(uint256).max - given);

        vm.prank(owner);
        token.transfer(alice, given);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, given, given + extra)
        );
        token.burn(given + extra);
    }

    function testFuzz_BurnFromRespectsAllowance(uint256 allowance, uint256 amount) public {
        allowance = bound(allowance, 0, INITIAL);
        amount = bound(amount, 0, INITIAL);

        vm.prank(owner);
        token.approve(alice, allowance);

        vm.prank(alice);
        if (amount > allowance) {
            vm.expectRevert(
                abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, alice, allowance, amount)
            );
            token.burnFrom(owner, amount);
        } else {
            token.burnFrom(owner, amount);
            assertEq(token.totalSupply(), INITIAL - amount);
            assertEq(token.allowance(owner, alice), allowance - amount);
        }
    }

    // ---------------- Pause ----------------

    function testFuzz_PausedBlocksTransfer(address to, uint256 amount) public {
        vm.assume(to != address(0));
        amount = bound(amount, 0, INITIAL);

        vm.prank(owner);
        token.pause();

        vm.prank(owner);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.transfer(to, amount);
    }
}

/// @notice Handler cho invariant test: fuzzer gọi ngẫu nhiên mint/burn/transfer
///         theo chuỗi dài, handler ghi lại tổng đã mint/burn ("ghost variables").
contract TokenForgeV2Handler is Test {
    TokenForgeV2 internal immutable token;
    address[] internal actors;

    uint256 public ghostMinted;
    uint256 public ghostBurned;

    constructor(TokenForgeV2 token_) {
        token = token_;
        actors.push(address(this));
        actors.push(makeAddr("alice"));
        actors.push(makeAddr("bob"));
        actors.push(makeAddr("carol"));
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function actorAt(uint256 i) external view returns (address) {
        return actors[i];
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    /// Handler là owner của token nên được mint.
    function mint(uint256 toSeed, uint256 amount) external {
        amount = bound(amount, 0, token.remainingMintable());
        token.mint(_actor(toSeed), amount);
        ghostMinted += amount;
    }

    function burn(uint256 fromSeed, uint256 amount) external {
        address from = _actor(fromSeed);
        amount = bound(amount, 0, token.balanceOf(from));
        vm.prank(from);
        token.burn(amount);
        ghostBurned += amount;
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = _actor(fromSeed);
        amount = bound(amount, 0, token.balanceOf(from));
        vm.prank(from);
        token.transfer(_actor(toSeed), amount);
    }
}

/// @notice Invariant test: các tính chất phải LUÔN đúng sau mọi chuỗi thao tác.
contract TokenForgeV2InvariantTest is Test {
    uint256 internal constant CAP = 10_000_000e18;
    uint256 internal constant INITIAL = 1_000_000e18;

    TokenForgeV2 internal token;
    TokenForgeV2Handler internal handler;

    function setUp() public {
        token = new TokenForgeV2(address(this), CAP, INITIAL);
        handler = new TokenForgeV2Handler(token);

        // Chuyển quyền owner sang handler (2 bước) và chuyển toàn bộ supply cho handler
        token.transferOwnership(address(handler));
        vm.prank(address(handler));
        token.acceptOwnership();
        token.transfer(address(handler), INITIAL);

        // Fuzzer chỉ gọi 3 hàm thao tác token của handler
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = TokenForgeV2Handler.mint.selector;
        selectors[1] = TokenForgeV2Handler.burn.selector;
        selectors[2] = TokenForgeV2Handler.transfer.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// Tổng cung không bao giờ vượt cap.
    function invariant_TotalSupplyNeverExceedsCap() public view {
        assertLe(token.totalSupply(), token.cap());
    }

    /// Tổng cung = initial + tổng đã mint - tổng đã burn.
    function invariant_SupplyAccounting() public view {
        assertEq(token.totalSupply(), INITIAL + handler.ghostMinted() - handler.ghostBurned());
    }

    /// Tổng số dư của mọi holder = tổng cung (không tạo/mất token ngoài mint/burn).
    function invariant_BalancesSumToTotalSupply() public view {
        uint256 sum;
        uint256 n = handler.actorCount();
        for (uint256 i = 0; i < n; i++) {
            sum += token.balanceOf(handler.actorAt(i));
        }
        assertEq(sum, token.totalSupply());
    }

    /// remainingMintable luôn nhất quán với cap và totalSupply.
    function invariant_RemainingMintableConsistent() public view {
        assertEq(token.remainingMintable(), token.cap() - token.totalSupply());
    }
}
