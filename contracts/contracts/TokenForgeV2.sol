// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title TokenForge V2 (TFG)
/// @author TokenForge team
/// @notice Token ERC-20 có cơ chế phát hành (mint) và đốt (burn):
///         - Chỉ owner được mint, và tổng cung không bao giờ vượt quá `cap()`.
///         - Mọi holder có thể tự đốt token của mình (`burn`) hoặc đốt token
///           của người khác trong phạm vi allowance (`burnFrom`) để giảm cung.
///         - Owner có thể tạm dừng (pause) toàn bộ chuyển/mint/burn khi có sự cố.
///         - Chuyển quyền owner theo 2 bước (Ownable2Step) và không cho phép
///           từ bỏ quyền owner, tránh mất quyền quản trị ngoài ý muốn.
/// @dev Kế thừa hoàn toàn từ OpenZeppelin Contracts 5.x, không có lời gọi ra
///      contract bên ngoài (không có hook) nên không có bề mặt re-entrancy.
///      Solidity >= 0.8 tự kiểm tra tràn số (overflow/underflow).
contract TokenForgeV2 is ERC20, ERC20Burnable, ERC20Capped, ERC20Pausable, Ownable2Step {
    /// @notice Gọi `renounceOwnership` sẽ luôn bị từ chối.
    error RenounceOwnershipDisabled();

    /// @param initialOwner  Địa chỉ owner ban đầu (nhận initial supply, có quyền mint/pause).
    /// @param maxSupply     Tổng cung tối đa (đơn vị nhỏ nhất, 18 decimals). Phải > 0.
    /// @param initialSupply Lượng token mint cho owner khi deploy. Phải <= maxSupply.
    constructor(address initialOwner, uint256 maxSupply, uint256 initialSupply)
        ERC20("TokenForge", "TFG")
        ERC20Capped(maxSupply)
        Ownable(initialOwner)
    {
        if (initialSupply > 0) {
            _mint(initialOwner, initialSupply);
        }
    }

    // ------------------------------------------------------------------
    // Mint (chỉ owner)
    // ------------------------------------------------------------------

    /// @notice Phát hành `amount` token mới cho `to`. Chỉ owner.
    /// @dev Revert `ERC20ExceededCap` nếu vượt cap, `EnforcedPause` nếu đang pause,
    ///      `ERC20InvalidReceiver` nếu `to` là address(0).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Số token còn có thể mint trước khi chạm cap.
    function remainingMintable() external view returns (uint256) {
        return cap() - totalSupply();
    }

    // ------------------------------------------------------------------
    // Pause (chỉ owner)
    // ------------------------------------------------------------------

    /// @notice Tạm dừng mọi chuyển token, mint và burn. Chỉ owner.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Mở lại hoạt động sau khi pause. Chỉ owner.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ------------------------------------------------------------------
    // Ownership
    // ------------------------------------------------------------------

    /// @notice Vô hiệu hoá việc từ bỏ quyền owner.
    /// @dev Nếu owner renounce, sẽ không ai mint/pause/unpause được nữa
    ///      (token có thể bị kẹt ở trạng thái pause vĩnh viễn).
    function renounceOwnership() public pure override {
        revert RenounceOwnershipDisabled();
    }

    // ------------------------------------------------------------------
    // Overrides bắt buộc do đa kế thừa
    // ------------------------------------------------------------------

    /// @dev Thứ tự thực thi: ERC20Pausable (whenNotPaused)
    ///      -> ERC20Capped (kiểm tra cap khi mint) -> ERC20 (cập nhật số dư).
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Capped, ERC20Pausable)
    {
        super._update(from, to, value);
    }
}
