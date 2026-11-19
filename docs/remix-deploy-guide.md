# Hướng dẫn triển khai TokenForgeV2 bằng Remix IDE lên Sepolia

Tài liệu này đáp ứng yêu cầu đề tài: *"Solidity, **Remix**, OpenZeppelin"* và *"hướng dẫn triển khai trên mạng testnet (Sepolia)"*.
Dự án dùng **Hardhat** làm công cụ chính (test tự động, deploy bằng script). **Remix** là cách thứ hai: deploy và thao tác trực quan trên trình duyệt, không cần cài đặt gì.

## 0. Chuẩn bị

| Thứ cần có | Ghi chú |
|---|---|
| Trình duyệt + **MetaMask** | Đã tạo ví |
| Mạng **Sepolia** trong MetaMask | Bật "Show test networks" → chọn *Sepolia* |
| **SepoliaETH** để trả gas | Lấy từ faucet (vd Google Cloud Web3 Faucet, Alchemy/Infura faucet) – khoảng 0.05 ETH là đủ |
| Mã nguồn | `contracts/contracts/TokenForgeV2.sol` |

## 1. Tạo file trong Remix

1. Mở <https://remix.ethereum.org>.
2. Ở tab **File Explorer**, tạo file `contracts/TokenForgeV2.sol` và dán toàn bộ nội dung `TokenForgeV2.sol`.
3. Remix tự tải thư viện cho các dòng `import "@openzeppelin/contracts/..."` từ npm.
   - Muốn khoá đúng phiên bản dự án dùng (5.6.1), sửa import **trong bản Remix** thành
     `@openzeppelin/contracts@5.6.1/token/ERC20/ERC20.sol` (tương tự cho các import khác).
     Không sửa như vậy trong repo Hardhat.

## 2. Biên dịch (tab *Solidity Compiler*)

| Thiết lập | Giá trị |
|---|---|
| Compiler | `0.8.34` (trùng với `hardhat.config.ts`) |
| Optimization | Tắt (giống profile `default` mà `hardhat run` dùng); nếu bật thì ghi lại để verify |
| EVM version | default |

Bấm **Compile TokenForgeV2.sol** → biểu tượng tick xanh là thành công. Có thể xem ABI/bytecode ở nút *Compilation Details*.

## 3. Thử trên Remix VM (không tốn gas thật)

1. Tab **Deploy & Run Transactions** → *Environment*: **Remix VM** (chọn bản hardfork mới nhất trong danh sách).
2. *Contract*: `TokenForgeV2`.
3. Điền tham số constructor (đơn vị nhỏ nhất, 18 chữ số thập phân):

| Tham số | Giá trị mẫu | Ý nghĩa |
|---|---|---|
| `initialOwner` | địa chỉ account đang chọn (nút copy cạnh *Account*) | Owner ban đầu |
| `maxSupply` | `10000000000000000000000000` | 10,000,000 TFG (cap) |
| `initialSupply` | `1000000000000000000000000` | 1,000,000 TFG mint cho owner |

4. Bấm **transact**, sau đó chạy kịch bản kiểm thử thủ công ở mục 5.

## 4. Deploy lên Sepolia

1. *Environment*: **Injected Provider – MetaMask**. MetaMask hỏi kết nối → chọn tài khoản → Connect.
   Kiểm tra dòng dưới *Environment* hiển thị **Sepolia (11155111)**.
2. Điền constructor như mục 3 (`initialOwner` = địa chỉ ví MetaMask của bạn).
3. Bấm **transact** → MetaMask hiện giao dịch → **Confirm**.
4. Khi giao dịch xác nhận, contract hiện ở *Deployed Contracts*. Copy địa chỉ và mở
   `https://sepolia.etherscan.io/address/<địa_chỉ>` để kiểm tra.
5. Lưu lại địa chỉ, block, tx hash vào báo cáo.

### Thêm token vào MetaMask
MetaMask → *Tokens* → *Import tokens* → dán địa chỉ contract → Symbol `TFG`, Decimals `18`.

## 5. Kịch bản thao tác & kết quả mong đợi

| # | Thao tác trong Remix | Tài khoản | Kết quả mong đợi |
|---|---|---|---|
| R1 | `cap()`, `totalSupply()`, `remainingMintable()` | bất kỳ | 1e25 / 1e24 / 9e24 |
| R2 | `mint(B, 1000000000000000000000)` (1000 TFG) | owner A | Thành công, `balanceOf(B)` = 1000 TFG |
| R3 | `mint(B, 1)` | B (không phải owner) | Revert `OwnableUnauthorizedAccount` |
| R4 | `mint(B, <remainingMintable()+1>)` | owner A | Revert `ERC20ExceededCap` |
| R5 | `burn(500000000000000000000)` (500 TFG) | B | `totalSupply` giảm 500 TFG |
| R6 | `approve(A, 100…)` bởi B, rồi `burnFrom(B, 100…)` bởi A | B, A | Đốt thành công, allowance giảm |
| R7 | `pause()` rồi `transfer(...)` | A | Transfer revert `EnforcedPause` |
| R8 | `unpause()` rồi `transfer(...)` | A | Thành công |
| R9 | `transferOwnership(B)` → `owner()` vẫn là A, `pendingOwner()` = B | A | Đúng như mô tả |
| R10 | `acceptOwnership()` | B | `owner()` = B |
| R11 | `renounceOwnership()` | owner | Revert `RenounceOwnershipDisabled` |

Trong Remix VM có sẵn nhiều account để đổi qua lại; trên Sepolia cần thêm tài khoản thứ hai trong MetaMask.
Chụp màn hình console Remix (giao dịch xanh/đỏ) cho từng bước để đưa vào báo cáo.

## 6. Verify mã nguồn trên Etherscan

**Cách 1 – Plugin Remix:** *Plugin Manager* → bật **Contract Verification**. Chọn Sepolia, nhập địa chỉ, constructor args, Etherscan API key → Verify.

**Cách 2 – Hardhat (dự án dùng cách này):**
```bash
cd contracts
npx hardhat verify --network sepolia <địa_chỉ> <initialOwner> 10000000000000000000000000 1000000000000000000000000
```
Lưu ý: bytecode chỉ khớp khi compiler version và cài đặt optimizer giống lúc deploy.

## 7. So sánh Remix và Hardhat

| Tiêu chí | Remix | Hardhat |
|---|---|---|
| Cài đặt | Không cần, chạy trên trình duyệt | Node.js + npm |
| Test tự động | Hạn chế (plugin Solidity Unit Testing) | Mocha/ethers + Solidity fuzz/invariant, coverage, gas stats |
| Deploy | Bấm nút, ký bằng MetaMask | Script tái lập được, lưu `deployments/*.json` |
| Phù hợp | Học, demo, thao tác nhanh | Phát triển thật, CI |
