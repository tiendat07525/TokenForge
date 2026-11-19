# TokenForge – Contracts

## TokenForge V1

ERC-20 **TokenForge (TFG)**, 18 decimals, dùng OpenZeppelin 5:
- `ERC20` + `ERC20Burnable` (holder tự burn, `burnFrom` qua allowance)
- `Ownable` – chỉ owner được `mint(to, amount)`
- Constructor: `(initialOwner, initialSupply)` – mint toàn bộ initial supply cho owner

## Lệnh

```bash
npm install
npm run compile
npm test                 # 17 test (Deployment, Transfer, Approve/TransferFrom, Mint, Burn, Ownership)
npm run coverage         # 100% line/statement
npm run deploy:local     # deploy thử trên mạng mô phỏng
npm run deploy:sepolia   # cần SEPOLIA_RPC_URL, SEPOLIA_PRIVATE_KEY (hardhat keystore)
npm run verify:sepolia   # cần ETHERSCAN_API_KEY
```

Biến bí mật được quản lý bằng `npx hardhat keystore set <TÊN>` hoặc biến môi trường – **không** commit vào git.

## TokenForgeV2 (bản theo đề tài Burn & Mint)

`contracts/TokenForgeV2.sol` – kế thừa OpenZeppelin 5:
- `ERC20Burnable` – holder tự `burn`, `burnFrom` qua allowance → **giảm cung**
- `mint(to, amount)` **chỉ owner**, giới hạn bởi `ERC20Capped` (`cap()`, `remainingMintable()`)
- `ERC20Pausable` – owner `pause()/unpause()` khi khẩn cấp
- `Ownable2Step` – chuyển owner 2 bước (`transferOwnership` → `acceptOwnership`); `renounceOwnership` bị chặn
- Constructor: `(initialOwner, maxSupply, initialSupply)` – mặc định 10,000,000 TFG cap, 1,000,000 TFG ban đầu

```bash
npm test                   # chạy toàn bộ: Mocha (V1 + V2) + Solidity fuzz/invariant
npm run test:ts            # chỉ Mocha
npm run test:sol           # chỉ Solidity (test/TokenForgeV2.t.sol)
npm run coverage
npm run gas                # bảng gas theo hàm
npm run deploy:v2:local
npm run deploy:v2:sepolia  # ghi deployments/sepolia-v2.json + in lệnh verify
npm run export-abi         # ghi shared/TokenForge*.abi.json cho frontend/backend
npm run lint:sol           # cần: npm i -D solhint
npm run slither            # cần: slither-analyzer + solc-select 0.8.34
```

Tài liệu: `../docs/security-analysis.md`, `../docs/remix-deploy-guide.md`.

## Deployment V1 (Sepolia)

| | |
|---|---|
| Address | `0x4D7b251399E5B8Db210Ad2C722B48c6c3A07f795` |
| Deploy block | 11956531 |
| Owner | `0x2631b6C3e0FCcc7CD952F4a12Fd8de27b33E1f2a` |
| Initial supply | 1,000,000 TFG |
| Etherscan | https://sepolia.etherscan.io/address/0x4D7b251399E5B8Db210Ad2C722B48c6c3A07f795#code (verified) |

Chi tiết trong `deployments/sepolia.json`; ABI dùng chung ở `shared/TokenForge.abi.json`.
