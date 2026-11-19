# TokenForge – Frontend

Giao diện DApp cho token **TokenForge (TFG)** trên Sepolia: kết nối MetaMask, xem thông tin token/số dư, Transfer, Approve, TransferFrom, Mint (owner), Burn và lịch sử giao dịch (qua backend).

**Công nghệ:** React 19, Vite, TypeScript, Tailwind CSS 4, ethers.js 6, MetaMask.

## Chạy

```bash
cp .env.example .env     # điền địa chỉ contract, block deploy, URL backend
npm install
npm run dev              # http://localhost:5173
npm run build            # build production vào dist/
npm run lint
```

## Biến môi trường

| Biến | Ý nghĩa |
|---|---|
| `VITE_TOKEN_ADDRESS` | Địa chỉ contract trên Sepolia (`contracts/deployments/*.json`) |
| `VITE_DEPLOY_BLOCK` | Block deploy contract |
| `VITE_API_URL` | URL backend (để trống nếu chưa chạy backend) |

## Cấu trúc

```
src/
├── App.tsx            Bố cục trang
├── abi.ts, config.ts  ABI contract và cấu hình từ .env
├── hooks/             useWallet (MetaMask, mạng), useToken (đọc/ghi contract)
├── components/        ConnectButton, TokenInfo, Transfer/Approve/TransferFrom/Mint/Burn form, HistoryPanel, TxToast
└── lib/               errors (giải mã lỗi contract), format (định dạng số/địa chỉ)
```

Test case thủ công: `../docs/phase4-frontend-testcases.md`.
