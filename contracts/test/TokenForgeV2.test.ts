import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

describe("TokenForgeV2", function () {
  const CAP = ethers.parseUnits("10000000", 18); // 10,000,000 TFG
  const INITIAL_SUPPLY = ethers.parseUnits("1000000", 18); // 1,000,000 TFG

  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const token = await ethers.deployContract("TokenForgeV2", [
      owner.address,
      CAP,
      INITIAL_SUPPLY,
    ]);
    return { token, owner, alice, bob };
  }

  // ------------------------------------------------------------------
  describe("1. Deployment", function () {
    it("TC-D01: name, symbol, decimals đúng", async function () {
      const { token } = await networkHelpers.loadFixture(deployFixture);

      expect(await token.name()).to.equal("TokenForge");
      expect(await token.symbol()).to.equal("TFG");
      expect(await token.decimals()).to.equal(18n);
    });

    it("TC-D02: owner, cap, initial supply, remainingMintable đúng", async function () {
      const { token, owner } = await networkHelpers.loadFixture(deployFixture);

      expect(await token.owner()).to.equal(owner.address);
      expect(await token.cap()).to.equal(CAP);
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
      expect(await token.remainingMintable()).to.equal(CAP - INITIAL_SUPPLY);
      expect(await token.paused()).to.equal(false);
      expect(await token.pendingOwner()).to.equal(ethers.ZeroAddress);
    });

    it("TC-D03: deploy với initialSupply = 0 thì tổng cung = 0", async function () {
      const [owner] = await ethers.getSigners();
      const token = await ethers.deployContract("TokenForgeV2", [owner.address, CAP, 0n]);

      expect(await token.totalSupply()).to.equal(0n);
    });

    it("TC-D04: revert khi cap = 0", async function () {
      const [owner] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("TokenForgeV2");

      await expect(factory.deploy(owner.address, 0n, 0n))
        .to.be.revertedWithCustomError(factory, "ERC20InvalidCap")
        .withArgs(0n);
    });

    it("TC-D05: revert khi initialSupply > cap", async function () {
      const [owner] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("TokenForgeV2");

      await expect(factory.deploy(owner.address, CAP, CAP + 1n))
        .to.be.revertedWithCustomError(factory, "ERC20ExceededCap")
        .withArgs(CAP + 1n, CAP);
    });

    it("TC-D06: revert khi initialOwner = address(0)", async function () {
      const factory = await ethers.getContractFactory("TokenForgeV2");

      await expect(factory.deploy(ethers.ZeroAddress, CAP, 0n))
        .to.be.revertedWithCustomError(factory, "OwnableInvalidOwner")
        .withArgs(ethers.ZeroAddress);
    });
  });

  // ------------------------------------------------------------------
  describe("2. Transfer / Approve", function () {
    it("TC-T01: transfer chuyển token và emit Transfer", async function () {
      const { token, owner, alice } = await networkHelpers.loadFixture(deployFixture);
      const amount = ethers.parseUnits("100", 18);

      await expect(token.transfer(alice.address, amount))
        .to.emit(token, "Transfer")
        .withArgs(owner.address, alice.address, amount);
      expect(await token.balanceOf(alice.address)).to.equal(amount);
    });

    it("TC-T02: transfer vượt số dư bị revert (không underflow)", async function () {
      const { token, alice, bob } = await networkHelpers.loadFixture(deployFixture);

      await expect(token.connect(alice).transfer(bob.address, 1n))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
        .withArgs(alice.address, 0n, 1n);
    });

    it("TC-T03: transferFrom trừ allowance; vượt allowance bị revert", async function () {
      const { token, owner, alice, bob } = await networkHelpers.loadFixture(deployFixture);

      await token.approve(alice.address, 50n);
      await token.connect(alice).transferFrom(owner.address, bob.address, 30n);
      expect(await token.allowance(owner.address, alice.address)).to.equal(20n);

      await expect(token.connect(alice).transferFrom(owner.address, bob.address, 21n))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance")
        .withArgs(alice.address, 20n, 21n);
    });
  });

  // ------------------------------------------------------------------
  describe("3. Mint (owner-only, có cap)", function () {
    it("TC-M01: owner mint được, emit Transfer từ address(0), tăng totalSupply", async function () {
      const { token, alice } = await networkHelpers.loadFixture(deployFixture);
      const amount = ethers.parseUnits("500", 18);

      await expect(token.mint(alice.address, amount))
        .to.emit(token, "Transfer")
        .withArgs(ethers.ZeroAddress, alice.address, amount);
      expect(await token.balanceOf(alice.address)).to.equal(amount);
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY + amount);
      expect(await token.remainingMintable()).to.equal(CAP - INITIAL_SUPPLY - amount);
    });

    it("TC-M02: non-owner mint bị revert OwnableUnauthorizedAccount", async function () {
      const { token, alice } = await networkHelpers.loadFixture(deployFixture);

      await expect(token.connect(alice).mint(alice.address, 1n))
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);
    });

    it("TC-M03: mint tới address(0) bị revert", async function () {
      const { token } = await networkHelpers.loadFixture(deployFixture);

      await expect(token.mint(ethers.ZeroAddress, 1n))
        .to.be.revertedWithCustomError(token, "ERC20InvalidReceiver")
        .withArgs(ethers.ZeroAddress);
    });

    it("TC-M04: mint vừa đủ chạm cap thì thành công, remainingMintable = 0", async function () {
      const { token, alice } = await networkHelpers.loadFixture(deployFixture);

      await token.mint(alice.address, CAP - INITIAL_SUPPLY);
      expect(await token.totalSupply()).to.equal(CAP);
      expect(await token.remainingMintable()).to.equal(0n);
    });

    it("TC-M05: mint vượt cap bị revert ERC20ExceededCap", async function () {
      const { token, alice } = await networkHelpers.loadFixture(deployFixture);
      const tooMuch = CAP - INITIAL_SUPPLY + 1n;

      await expect(token.mint(alice.address, tooMuch))
        .to.be.revertedWithCustomError(token, "ERC20ExceededCap")
        .withArgs(CAP + 1n, CAP);
    });

    it("TC-M06: số cực lớn (gần 2^256) không gây overflow mà bị chặn", async function () {
      const { token, alice } = await networkHelpers.loadFixture(deployFixture);

      // totalSupply mới = 2^256 - 1: không tràn số, nhưng vượt cap -> revert ERC20ExceededCap
      await expect(token.mint(alice.address, ethers.MaxUint256 - INITIAL_SUPPLY))
        .to.be.revertedWithCustomError(token, "ERC20ExceededCap")
        .withArgs(ethers.MaxUint256, CAP);
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
    });
  });

  // ------------------------------------------------------------------
  describe("4. Burn (giảm cung)", function () {
    it("TC-B01: holder burn token của mình, totalSupply giảm, emit Transfer tới address(0)", async function () {
      const { token, owner } = await networkHelpers.loadFixture(deployFixture);
      const amount = ethers.parseUnits("100", 18);

      await expect(token.burn(amount))
        .to.emit(token, "Transfer")
        .withArgs(owner.address, ethers.ZeroAddress, amount);
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY - amount);
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY - amount);
    });

    it("TC-B02: holder không phải owner cũng burn được token của chính họ", async function () {
      const { token, alice } = await networkHelpers.loadFixture(deployFixture);

      await token.transfer(alice.address, 100n);
      await token.connect(alice).burn(40n);
      expect(await token.balanceOf(alice.address)).to.equal(60n);
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY - 40n);
    });

    it("TC-B03: burn vượt số dư bị revert", async function () {
      const { token, alice } = await networkHelpers.loadFixture(deployFixture);

      await expect(token.connect(alice).burn(1n))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
        .withArgs(alice.address, 0n, 1n);
    });

    it("TC-B04: burnFrom đốt trong phạm vi allowance và trừ allowance", async function () {
      const { token, owner, alice } = await networkHelpers.loadFixture(deployFixture);

      await token.approve(alice.address, 100n);
      await expect(token.connect(alice).burnFrom(owner.address, 60n))
        .to.emit(token, "Transfer")
        .withArgs(owner.address, ethers.ZeroAddress, 60n);
      expect(await token.allowance(owner.address, alice.address)).to.equal(40n);
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY - 60n);
    });

    it("TC-B05: burnFrom không có allowance bị revert", async function () {
      const { token, owner, alice } = await networkHelpers.loadFixture(deployFixture);

      await expect(token.connect(alice).burnFrom(owner.address, 1n))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance")
        .withArgs(alice.address, 0n, 1n);
    });

    it("TC-B06: owner KHÔNG thể đốt token của người khác khi không có allowance", async function () {
      const { token, alice } = await networkHelpers.loadFixture(deployFixture);

      await token.transfer(alice.address, 100n);
      await expect(token.burnFrom(alice.address, 1n)).to.be.revertedWithCustomError(
        token,
        "ERC20InsufficientAllowance"
      );
      expect(await token.balanceOf(alice.address)).to.equal(100n);
    });

    it("TC-B07: burn giải phóng room dưới cap, owner có thể mint lại phần đó", async function () {
      const { token, owner, alice } = await networkHelpers.loadFixture(deployFixture);

      await token.mint(alice.address, CAP - INITIAL_SUPPLY); // chạm cap
      await token.connect(owner).burn(1000n);
      expect(await token.remainingMintable()).to.equal(1000n);
      await token.mint(alice.address, 1000n);
      expect(await token.totalSupply()).to.equal(CAP);
    });
  });

  // ------------------------------------------------------------------
  describe("5. Pause (dừng khẩn cấp)", function () {
    it("TC-P01: owner pause, emit Paused", async function () {
      const { token, owner } = await networkHelpers.loadFixture(deployFixture);

      await expect(token.pause()).to.emit(token, "Paused").withArgs(owner.address);
      expect(await token.paused()).to.equal(true);
    });

    it("TC-P02: khi pause, transfer/mint/burn/burnFrom/transferFrom đều bị chặn", async function () {
      const { token, owner, alice } = await networkHelpers.loadFixture(deployFixture);

      await token.approve(alice.address, 100n);
      await token.pause();

      await expect(token.transfer(alice.address, 1n)).to.be.revertedWithCustomError(token, "EnforcedPause");
      await expect(token.mint(alice.address, 1n)).to.be.revertedWithCustomError(token, "EnforcedPause");
      await expect(token.burn(1n)).to.be.revertedWithCustomError(token, "EnforcedPause");
      await expect(token.connect(alice).burnFrom(owner.address, 1n)).to.be.revertedWithCustomError(
        token,
        "EnforcedPause"
      );
      await expect(
        token.connect(alice).transferFrom(owner.address, alice.address, 1n)
      ).to.be.revertedWithCustomError(token, "EnforcedPause");
    });

    it("TC-P03: approve vẫn hoạt động khi pause (không làm thay đổi số dư)", async function () {
      const { token, owner, alice } = await networkHelpers.loadFixture(deployFixture);

      await token.pause();
      await token.approve(alice.address, 10n);
      expect(await token.allowance(owner.address, alice.address)).to.equal(10n);
    });

    it("TC-P04: unpause khôi phục hoạt động, emit Unpaused", async function () {
      const { token, owner, alice } = await networkHelpers.loadFixture(deployFixture);

      await token.pause();
      await expect(token.unpause()).to.emit(token, "Unpaused").withArgs(owner.address);
      await token.transfer(alice.address, 1n);
      expect(await token.balanceOf(alice.address)).to.equal(1n);
    });

    it("TC-P05: non-owner không pause/unpause được", async function () {
      const { token, alice } = await networkHelpers.loadFixture(deployFixture);

      await expect(token.connect(alice).pause())
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);
      await token.pause();
      await expect(token.connect(alice).unpause())
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);
    });

    it("TC-P06: pause 2 lần hoặc unpause khi chưa pause bị revert", async function () {
      const { token } = await networkHelpers.loadFixture(deployFixture);

      await expect(token.unpause()).to.be.revertedWithCustomError(token, "ExpectedPause");
      await token.pause();
      await expect(token.pause()).to.be.revertedWithCustomError(token, "EnforcedPause");
    });
  });

  // ------------------------------------------------------------------
  describe("6. Ownership 2 bước", function () {
    it("TC-O01: transferOwnership chỉ đặt pendingOwner, owner chưa đổi", async function () {
      const { token, owner, alice } = await networkHelpers.loadFixture(deployFixture);

      await expect(token.transferOwnership(alice.address))
        .to.emit(token, "OwnershipTransferStarted")
        .withArgs(owner.address, alice.address);
      expect(await token.owner()).to.equal(owner.address);
      expect(await token.pendingOwner()).to.equal(alice.address);
      // pendingOwner chưa accept thì chưa mint được
      await expect(token.connect(alice).mint(alice.address, 1n)).to.be.revertedWithCustomError(
        token,
        "OwnableUnauthorizedAccount"
      );
    });

    it("TC-O02: pendingOwner accept → thành owner; owner cũ mất quyền mint", async function () {
      const { token, owner, alice } = await networkHelpers.loadFixture(deployFixture);

      await token.transferOwnership(alice.address);
      await expect(token.connect(alice).acceptOwnership())
        .to.emit(token, "OwnershipTransferred")
        .withArgs(owner.address, alice.address);

      expect(await token.owner()).to.equal(alice.address);
      expect(await token.pendingOwner()).to.equal(ethers.ZeroAddress);
      await expect(token.connect(owner).mint(owner.address, 1n)).to.be.revertedWithCustomError(
        token,
        "OwnableUnauthorizedAccount"
      );
      await token.connect(alice).mint(alice.address, 1n);
      expect(await token.balanceOf(alice.address)).to.equal(1n);
    });

    it("TC-O03: người không phải pendingOwner không accept được", async function () {
      const { token, alice, bob } = await networkHelpers.loadFixture(deployFixture);

      await token.transferOwnership(alice.address);
      await expect(token.connect(bob).acceptOwnership())
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(bob.address);
    });

    it("TC-O04: owner có thể huỷ chuyển nhượng bằng cách đặt pendingOwner mới", async function () {
      const { token, alice, bob } = await networkHelpers.loadFixture(deployFixture);

      await token.transferOwnership(alice.address); // nhập nhầm
      await token.transferOwnership(bob.address); // sửa lại
      await expect(token.connect(alice).acceptOwnership()).to.be.revertedWithCustomError(
        token,
        "OwnableUnauthorizedAccount"
      );
      await token.connect(bob).acceptOwnership();
      expect(await token.owner()).to.equal(bob.address);
    });

    it("TC-O05: non-owner không thể transferOwnership", async function () {
      const { token, alice, bob } = await networkHelpers.loadFixture(deployFixture);

      await expect(token.connect(alice).transferOwnership(bob.address))
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);
    });

    it("TC-O06: renounceOwnership bị vô hiệu hoá, owner giữ nguyên", async function () {
      const { token, owner, alice } = await networkHelpers.loadFixture(deployFixture);

      await expect(token.renounceOwnership()).to.be.revertedWithCustomError(
        token,
        "RenounceOwnershipDisabled"
      );
      await expect(token.connect(alice).renounceOwnership()).to.be.revertedWithCustomError(
        token,
        "RenounceOwnershipDisabled"
      );
      expect(await token.owner()).to.equal(owner.address);
    });
  });
});
