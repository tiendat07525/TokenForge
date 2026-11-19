# Phân tích bảo mật – TokenForgeV2

Phạm vi: `contracts/contracts/TokenForgeV2.sol` (Solidity ^0.8.24, biên dịch 0.8.34, OpenZeppelin Contracts 5.6.1).

## 1. Mô hình quyền & bề mặt tấn công

| Hàm | Ai được gọi | Ghi chú |
|---|---|---|
| `transfer`, `approve`, `transferFrom` | Mọi người | Chuẩn ERC-20; bị chặn khi pause (trừ `approve`) |
| `burn(amount)` | Mọi holder | Chỉ đốt token của chính mình |
| `burnFrom(account, amount)` | Người được `account` approve | Trừ allowance trước khi đốt |
| `mint(to, amount)` | **Chỉ owner** | Không vượt `cap()` |
| `pause()` / `unpause()` | **Chỉ owner** | Dừng khẩn cấp |
| `transferOwnership(new)` | **Chỉ owner** | Chỉ đặt `pendingOwner` |
| `acceptOwnership()` | **Chỉ pendingOwner** | Hoàn tất chuyển quyền |
| `renounceOwnership()` | – | Luôn revert |

Contract **không** nhận ETH, **không** gọi contract bên ngoài, **không** có vòng lặp, **không** dùng `tx.origin`, `block.timestamp`, `delegatecall` hay `selfdestruct`.

## 2. Đánh giá theo từng loại lỗ hổng

| # | Lỗ hổng (SWC) | Rủi ro với TokenForge | Biện pháp trong V2 | Bằng chứng kiểm thử |
|---|---|---|---|---|
| 1 | **Re-entrancy** (SWC-107) | Không có: ERC-20 của OZ 5 không có hook/callback, không chuyển ETH, không gọi ra ngoài. Mọi cập nhật số dư xảy ra trong `_update` trước khi emit event (Checks-Effects-Interactions). | Không dùng ERC-777/ERC-1363 callback; nếu sau này thêm thì phải dùng `ReentrancyGuard`. | Phân tích tĩnh (Slither: không có cảnh báo reentrancy). |
| 2 | **Overflow / Underflow** (SWC-101) | Solidity ≥ 0.8 tự revert (`Panic 0x11`) khi tràn số. OZ trả lỗi rõ ràng trước khi trừ (`ERC20InsufficientBalance`, `ERC20InsufficientAllowance`). | `pragma ^0.8.24`; không dùng `unchecked` tự viết. | TC-T02, TC-B03, TC-M06; fuzz `testFuzz_BurnMoreThanBalanceReverts`, `testFuzz_MintAboveCapReverts`. |
| 3 | **Access control** (SWC-105/106) | Ai cũng mint được → lạm phát vô hạn. | `onlyOwner` cho `mint`, `pause`, `unpause`, `transferOwnership`. | TC-M02, TC-P05, TC-O05; fuzz `testFuzz_NonOwnerCannotMint` (địa chỉ ngẫu nhiên). |
| 4 | **Mất quyền owner** do chuyển nhầm địa chỉ | V1 (`Ownable`) chuyển ngay lập tức → gõ sai là mất quyền mint vĩnh viễn. | **Ownable2Step**: người nhận phải `acceptOwnership()`; owner có thể đổi pendingOwner nếu nhập sai. | TC-O01 → TC-O04. |
| 5 | **Renounce ownership** ngoài ý muốn | V1: owner gọi `renounceOwnership` → không ai mint/pause được; nếu đang pause thì token bị đóng băng vĩnh viễn. | Override `renounceOwnership()` luôn revert `RenounceOwnershipDisabled`. | TC-O06. |
| 6 | **Lạm phát không giới hạn / tập trung quyền** | Owner mint vô hạn làm mất giá token, mâu thuẫn mục tiêu "burn để giảm cung". | **ERC20Capped**: `totalSupply ≤ cap` (bất biến). Khuyến nghị owner là ví **multisig (Safe)** trên mainnet. | TC-M04, TC-M05, TC-B07; invariant `invariant_TotalSupplyNeverExceedsCap`. |
| 7 | **Sự cố khẩn cấp** (lộ private key người dùng, bug ứng dụng phía trên) | Không có cách dừng giao dịch. | **ERC20Pausable** + `pause/unpause` chỉ owner. | TC-P01 → TC-P06; fuzz `testFuzz_PausedBlocksTransfer`. |
| 8 | **Approve race condition** (SWC-114, front-running) | Đặc tính chung của ERC-20: đổi allowance từ N sang M, spender có thể front-run tiêu N rồi tiêu thêm M. Áp dụng cả với `burnFrom`. | Hướng dẫn người dùng/FE: đặt allowance về 0 trước khi đặt giá trị mới; chỉ approve đúng lượng cần. | Ghi chú thiết kế (không sửa được ở tầng chuẩn ERC-20). |
| 9 | **Burn trái phép token người khác** | Owner/bên thứ ba đốt token của holder. | `burnFrom` bắt buộc có allowance; owner không có đặc quyền burn. | TC-B05, TC-B06; fuzz `testFuzz_BurnFromRespectsAllowance`. |
| 10 | **Gửi token vào address(0)** | Mất token ngoài cơ chế burn (không giảm `totalSupply` đúng cách). | OZ revert `ERC20InvalidReceiver`; burn chỉ qua `burn/burnFrom`. | TC-M03, V1 transfer tests. |
| 11 | **Floating pragma** (SWC-103) | Biên dịch bằng version khác với bản đã test. | Pragma `^0.8.24` cho thư viện; build cố định **0.8.34** trong `hardhat.config.ts` và hướng dẫn Remix. | – |
| 12 | **Phụ thuộc thư viện** | Lỗi trong thư viện bên thứ ba. | OpenZeppelin (đã audit), version khoá trong `package-lock.json`. | – |
| 13 | **DoS do vòng lặp / gas limit** (SWC-128) | Không có vòng lặp trên mảng không giới hạn. | – | – |

## 3. Bất biến (invariants) đã kiểm chứng tự động

Kiểm bằng invariant test của Hardhat (`test/TokenForgeV2.t.sol`): fuzzer gọi ngẫu nhiên chuỗi `mint/burn/transfer` và sau mỗi bước kiểm tra:

1. `totalSupply() ≤ cap()`
2. `totalSupply() == initialSupply + tổng đã mint − tổng đã burn`
3. Tổng `balanceOf` của mọi holder `== totalSupply()`
4. `remainingMintable() == cap() − totalSupply()`

## 4. Đánh đổi thiết kế (cần nêu trong báo cáo)

- **Pause là quyền tập trung:** owner có thể đóng băng mọi giao dịch của holder. Đổi lại có khả năng phản ứng sự cố. Giảm rủi ro bằng multisig/timelock cho owner.
- **Cap tính trên tổng cung hiện tại:** token đã burn sẽ "nhả" room, owner có thể mint lại phần đó (TC-B07). Nếu muốn cap theo *tổng đã từng mint* thì cần biến đếm riêng – không chọn vì làm lệch chuẩn ERC20Capped.
- **`approve` vẫn hoạt động khi pause:** không làm thay đổi số dư nên không nguy hiểm; giúp người dùng chuẩn bị trước khi unpause.

## 5. Công cụ phân tích tĩnh

```bash
cd contracts
# Solhint (lint + best practice)
npm i -D solhint
npm run lint:sol

# Slither (Trail of Bits) – cần Python
pipx install slither-analyzer      # hoặc: pip install --user slither-analyzer
pipx install solc-select && solc-select install 0.8.34 && solc-select use 0.8.34
npm run slither
```

Kết quả chạy: *(dán output / ảnh chụp vào đây khi chạy)*

| Công cụ | High | Medium | Low | Informational | Ghi chú |
|---|---|---|---|---|---|
| Slither | | | | | |
| Solhint | – | – | | | |

## 6. So sánh V1 và V2

| Tiêu chí | V1 – TokenForge | V2 – TokenForgeV2 |
|---|---|---|
| Kế thừa | ERC20, ERC20Burnable, Ownable | ERC20, ERC20Burnable, **ERC20Capped**, **ERC20Pausable**, **Ownable2Step** |
| Giới hạn tổng cung | Không | Có (`cap`) |
| Dừng khẩn cấp | Không | `pause/unpause` |
| Chuyển owner | 1 bước, chuyển ngay | 2 bước, phải accept |
| Renounce owner | Cho phép | Bị chặn |
| Test | 17 test Mocha | Mocha (34 TC) + 7 fuzz test + 4 invariant |
