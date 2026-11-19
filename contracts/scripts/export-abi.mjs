// Xuất ABI từ artifacts sang shared/ để frontend/backend dùng chung.
// Chạy sau `npm run compile`:  npm run export-abi
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const contracts = ["TokenForge", "TokenForgeV2"];

mkdirSync("shared", { recursive: true });
for (const name of contracts) {
  const artifact = JSON.parse(
    readFileSync(`artifacts/contracts/${name}.sol/${name}.json`, "utf8")
  );
  writeFileSync(`shared/${name}.abi.json`, JSON.stringify(artifact.abi, null, 2) + "\n");
  console.log(`shared/${name}.abi.json – ${artifact.abi.length} entries`);
}
