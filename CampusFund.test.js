const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CampusFund", function () {
  const ONE_HOUR = 60 * 60;
  const ONE_DAY = 24 * ONE_HOUR;

  async function deployFixture() {
    const [creator, alice, bob] = await ethers.getSigners();
    const CampusFund = await ethers.getContractFactory("CampusFund");
    const campusFund = await CampusFund.deploy();
    await campusFund.waitForDeployment();
    return { campusFund, creator, alice, bob };
  }

  it("creates a campaign with correct fields", async function () {
    const { campusFund, creator } = await deployFixture();

    await expect(
      campusFund.connect(creator).createCampaign("Robotics Club", "desc", ethers.parseEther("1"), ONE_DAY)
    ).to.emit(campusFund, "CampaignCreated");

    const c = await campusFund.getCampaign(1);
    expect(c.creator).to.equal(creator.address);
    expect(c.goal).to.equal(ethers.parseEther("1"));
    expect(c.state).to.equal(0); // Active
  });

  it("rejects invalid campaign creation params", async function () {
    const { campusFund, creator } = await deployFixture();

    await expect(
      campusFund.connect(creator).createCampaign("", "desc", ethers.parseEther("1"), ONE_DAY)
    ).to.be.revertedWithCustomError(campusFund, "EmptyTitle");

    await expect(
      campusFund.connect(creator).createCampaign("Title", "desc", 0, ONE_DAY)
    ).to.be.revertedWithCustomError(campusFund, "InvalidAmount");

    await expect(
      campusFund.connect(creator).createCampaign("Title", "desc", ethers.parseEther("1"), 10)
    ).to.be.revertedWithCustomError(campusFund, "InvalidDuration");

    await expect(
      campusFund.connect(creator).createCampaign("Title", "desc", ethers.parseEther("1"), 31 * ONE_DAY)
    ).to.be.revertedWithCustomError(campusFund, "InvalidDuration");
  });

  it("accepts contributions and tracks totals", async function () {
    const { campusFund, creator, alice, bob } = await deployFixture();
    await campusFund.connect(creator).createCampaign("Title", "desc", ethers.parseEther("2"), ONE_DAY);

    await campusFund.connect(alice).contribute(1, { value: ethers.parseEther("1") });
    await campusFund.connect(bob).contribute(1, { value: ethers.parseEther("0.5") });

    const c = await campusFund.getCampaign(1);
    expect(c.totalPledged).to.equal(ethers.parseEther("1.5"));
    expect(await campusFund.getContribution(1, alice.address)).to.equal(ethers.parseEther("1"));
  });

  it("rejects zero-value contributions and contributions after deadline", async function () {
    const { campusFund, creator, alice } = await deployFixture();
    await campusFund.connect(creator).createCampaign("Title", "desc", ethers.parseEther("2"), ONE_HOUR);

    await expect(
      campusFund.connect(alice).contribute(1, { value: 0 })
    ).to.be.revertedWithCustomError(campusFund, "InvalidAmount");

    await time.increase(ONE_HOUR + 1);

    await expect(
      campusFund.connect(alice).contribute(1, { value: ethers.parseEther("1") })
    ).to.be.revertedWithCustomError(campusFund, "DeadlinePassed");
  });

  it("allows only the creator to cancel before the deadline", async function () {
    const { campusFund, creator, alice } = await deployFixture();
    await campusFund.connect(creator).createCampaign("Title", "desc", ethers.parseEther("2"), ONE_DAY);

    await expect(campusFund.connect(alice).cancelCampaign(1)).to.be.revertedWithCustomError(
      campusFund,
      "UnauthorizedCaller"
    );

    await expect(campusFund.connect(creator).cancelCampaign(1)).to.emit(campusFund, "CampaignCancelled");

    const c = await campusFund.getCampaign(1);
    expect(c.state).to.equal(3); // Cancelled
  });

  it("finalizes as Successful or Failed based on the goal", async function () {
    const { campusFund, creator, alice } = await deployFixture();
    await campusFund.connect(creator).createCampaign("Title", "desc", ethers.parseEther("1"), ONE_HOUR);
    await campusFund.connect(alice).contribute(1, { value: ethers.parseEther("1") });

    await expect(campusFund.finalizeCampaign(1)).to.be.revertedWithCustomError(
      campusFund,
      "DeadlineNotReached"
    );

    await time.increase(ONE_HOUR + 1);
    await expect(campusFund.finalizeCampaign(1)).to.emit(campusFund, "CampaignFinalized");

    const c = await campusFund.getCampaign(1);
    expect(c.state).to.equal(1); // Successful

    await expect(campusFund.finalizeCampaign(1)).to.be.revertedWithCustomError(campusFund, "InvalidState");
  });

  it("lets the creator withdraw once from a successful campaign", async function () {
    const { campusFund, creator, alice } = await deployFixture();
    await campusFund.connect(creator).createCampaign("Title", "desc", ethers.parseEther("1"), ONE_HOUR);
    await campusFund.connect(alice).contribute(1, { value: ethers.parseEther("1") });
    await time.increase(ONE_HOUR + 1);
    await campusFund.finalizeCampaign(1);

    await expect(campusFund.connect(creator).withdrawFunds(1)).to.emit(campusFund, "FundsWithdrawn");

    await expect(campusFund.connect(creator).withdrawFunds(1)).to.be.revertedWithCustomError(
      campusFund,
      "AlreadyWithdrawn"
    );
  });

  it("lets contributors claim refunds from a failed campaign, once each", async function () {
    const { campusFund, creator, alice, bob } = await deployFixture();
    await campusFund.connect(creator).createCampaign("Title", "desc", ethers.parseEther("5"), ONE_HOUR);
    await campusFund.connect(alice).contribute(1, { value: ethers.parseEther("1") });
    await time.increase(ONE_HOUR + 1);
    await campusFund.finalizeCampaign(1);

    await expect(campusFund.connect(alice).claimRefund(1)).to.emit(campusFund, "RefundClaimed");
    await expect(campusFund.connect(alice).claimRefund(1)).to.be.revertedWithCustomError(
      campusFund,
      "NoFundsAvailable"
    );
    await expect(campusFund.connect(bob).claimRefund(1)).to.be.revertedWithCustomError(
      campusFund,
      "NoFundsAvailable"
    );
  });

  it("lets contributors claim refunds after cancellation", async function () {
    const { campusFund, creator, alice } = await deployFixture();
    await campusFund.connect(creator).createCampaign("Title", "desc", ethers.parseEther("5"), ONE_DAY);
    await campusFund.connect(alice).contribute(1, { value: ethers.parseEther("1") });
    await campusFund.connect(creator).cancelCampaign(1);

    await expect(campusFund.connect(alice).claimRefund(1)).to.emit(campusFund, "RefundClaimed");
  });

  it("rejects direct Ether transfers", async function () {
    const { campusFund, alice } = await deployFixture();
    const address = await campusFund.getAddress();

    await expect(
      alice.sendTransaction({ to: address, value: ethers.parseEther("1") })
    ).to.be.reverted;
  });
});
