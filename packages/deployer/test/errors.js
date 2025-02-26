const ganache = require("ganache");
const { Web3 } = require("web3");
const assert = require("assert");
const Deployer = require("../index");
const utils = require("./helpers/utils");
const Config = require("@truffle/config");
const { Environment } = require("@truffle/environment");

describe("Error cases", function () {
  let owner;
  let accounts;
  let options;
  let networkId;
  let deployer;
  let Abstract;
  let Loops;
  let Example;
  let ExampleRevert;
  let ExampleAssert;
  let UsesExample;
  let IsLibrary;
  let UsesLibrary;

  const provider = ganache.provider({
    gasLimit: "0x6691b7",
    hardfork: "istanbul",
    miner: {
      instamine: "strict"
    },
    logging: { quiet: true }
  });

  const web3 = new Web3(provider);

  beforeEach(async function () {
    networkId = await web3.eth.net.getId();
    accounts = await web3.eth.getAccounts();

    owner = accounts[0];
    await utils.compile();

    Example = utils.getContract("Example", provider, networkId, owner);
    ExampleRevert = utils.getContract(
      "ExampleRevert",
      provider,
      networkId,
      owner
    );
    ExampleAssert = utils.getContract(
      "ExampleAssert",
      provider,
      networkId,
      owner
    );
    UsesExample = utils.getContract("UsesExample", provider, networkId, owner);
    UsesLibrary = utils.getContract("UsesLibrary", provider, networkId, owner);
    IsLibrary = utils.getContract("IsLibrary", provider, networkId, owner);
    Abstract = utils.getContract("Abstract", provider, networkId, owner);
    Loops = utils.getContract("Loops", provider, networkId, owner);

    options = Config.default().merge({
      contracts: [
        Example,
        ExampleRevert,
        ExampleAssert,
        UsesExample,
        IsLibrary,
        UsesLibrary,
        Abstract,
        Loops
      ],
      networks: {
        test: {
          network_id: networkId,
          provider
        }
      },
      network: "test",
      quiet: true //want to test that errors still work when quiet turned on
    });
    await Environment.detect(options);
    deployer = new Deployer(options);
  });

  afterEach(() => {
    utils.cleanUp();
    deployer.finish();
  });

  it("library not deployed", async function () {
    const migrate = function () {
      deployer.link(IsLibrary, UsesLibrary);
    };

    migrate();

    try {
      await deployer.start();
      assert.fail();
    } catch (err) {
      assert(err.message.includes("Deployment Failed"));
      assert(err.message.includes("IsLibrary"));
      assert(err.message.includes("has no address"));
    }
  });

  it("unlinked library", async function () {
    const migrate = function () {
      deployer.deploy(UsesLibrary);
    };

    migrate();

    try {
      await deployer.start();
      assert.fail();
    } catch (err) {
      assert(err.message.includes("Deployment Failed"));
      assert(err.message.includes("UsesLibrary"));
    }
  });

  it("contract has no bytecode", async function () {
    const migrate = function () {
      deployer.deploy(Abstract);
    };

    migrate();

    try {
      await deployer.start();
      assert.fail();
    } catch (err) {
      assert(err.message.includes("Deployment Failed"));
      assert(err.message.includes("Abstract"));
      assert(err.message.includes("interface"));
      assert(err.message.includes("cannot be deployed"));
    }
  });

  it("OOG (no constructor args)", async function () {
    const migrate = function () {
      deployer.deploy(Example, { gas: 10 });
    };

    migrate();

    try {
      await deployer.start();
      assert.fail();
    } catch (err) {
      assert(err.message.includes("Example"));
      assert(err.message.includes("value you set"));
      assert(err.message.includes("Block limit"));
      assert(err.message.includes("Gas sent"));
      assert(err.message.includes("10"));
    }
  });

  it("OOG (w/ constructor args)", async function () {
    const migrate = function () {
      deployer.deploy(UsesExample, utils.zeroAddress, { gas: 10 });
    };

    migrate();

    try {
      await deployer.start();
      assert.fail();
    } catch (err) {
      assert(err.message.includes("UsesExample"));
      assert(err.message.includes("out of gas"));
      assert(err.message.includes("value you set"));
      assert(err.message.includes("Block limit"));
      assert(err.message.includes("Gas sent"));
      assert(err.message.includes("10"));
    }
  });

  it("OOG (w/ estimate, hits block limit)", async function () {
    this.timeout(100000);

    const migrate = function () {
      deployer.deploy(Loops);
    };

    migrate();

    try {
      await deployer.start();
      assert.fail();
    } catch (err) {
      assert(err.message.includes("Loops"));
      assert(
        err.message.includes("Making your contract constructor more efficient")
      );
      assert(err.message.includes("caused gas estimation to fail"));
    }
  });

  it("OOG (w/ param, hits block limit)", async function () {
    this.timeout(20000);

    const migrate = function () {
      deployer.deploy(Loops, { gas: 100000 });
    };

    migrate();

    try {
      await deployer.start();
      assert.fail();
    } catch (err) {
      assert(err.message.includes("Loops"));
      assert(err.message.includes("out of gas"));
      assert(err.message.includes("Gas sent"));
      assert(err.message.includes("Block limit"));
    }
  });

  it("revert", async function () {
    const migrate = function () {
      deployer.deploy(ExampleRevert);
    };

    migrate();

    try {
      await deployer.start();
      assert.fail();
    } catch (err) {
      assert(err.message.includes("Revert"));
    }
  });

  it("assert", async function () {
    const migrate = function () {
      deployer.deploy(ExampleAssert);
    };

    migrate();

    try {
      await deployer.start();
      assert.fail();
    } catch (err) {
      assert(err.message.includes("invalid opcode"));
    }
  });

  it("exceeds block limit", async function () {
    const block = await web3.eth.getBlock("latest");
    const gas = block.gasLimit + BigInt(1000);

    const migrate = function () {
      deployer.deploy(Example, { gas: gas });
    };

    migrate();

    try {
      await deployer.start();
      assert.fail();
    } catch (err) {
      assert(err.message.includes("Example"));
      assert(err.message.includes("Block limit"));
      assert(err.message.includes("Gas sent"));
      assert(err.message.includes("less gas"));
    }
  });

  it("insufficient funds", async function () {
    const emptyAccount = accounts[7];
    let balance = await web3.eth.getBalance(emptyAccount);
    await web3.eth.sendTransaction({
      to: accounts[0],
      from: emptyAccount,
      value: balance,
      gasPrice: 0
    });

    balance = await web3.eth.getBalance(emptyAccount);
    assert(parseInt(balance) === 0);

    const migrate = function () {
      deployer.deploy(Example, { from: emptyAccount });
    };

    migrate();

    try {
      await deployer.start();
      assert.fail();
    } catch (err) {
      assert(err.message.includes("insufficient funds"));
    }
  });
});
