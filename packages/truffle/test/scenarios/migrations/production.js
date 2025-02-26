const MemoryLogger = require("../MemoryLogger");
const CommandRunner = require("../commandRunner");
const path = require("path");
const assert = require("assert");
const sandbox = require("../sandbox");
const { Web3 } = require("web3");

describe("production", function () {
  describe("{ production: true, confirmations: 2 } [ @geth ]", function () {
    if (!process.env.GETH) return;

    let config, cleanupSandboxDir, web3, networkId;
    const project = path.join(__dirname, "../../sources/migrations/production");
    const logger = new MemoryLogger();

    before(async function () {
      this.timeout(10000);
      ({ config, cleanupSandboxDir } = await sandbox.create(project));
      config.network = "ropsten";
      config.logger = logger;
      web3 = new Web3("http://localhost:8545");
      networkId = await web3.eth.net.getId();
    });

    after(function () {
      cleanupSandboxDir();
    });

    it("auto dry-runs and honors confirmations option", async function () {
      this.timeout(70000);

      await CommandRunner.run("migrate --network ropsten", config);
      const output = logger.contents();

      assert(output.includes("dry-run"));

      assert(output.includes("2_migrations_conf.js"));
      assert(output.includes("Deploying 'Example'"));

      const location = path.join(
        config.contracts_build_directory,
        "Example.json"
      );
      const artifact = require(location);
      const network = artifact.networks[networkId];

      assert(output.includes(network.transactionHash));
      assert(output.includes(network.address));

      // Geth automines too quickly for the 4 sec resolution we set
      // to trigger the output.
      if (!process.env.GETH) {
        assert(output.includes("2 confirmations"));
        assert(output.includes("confirmation number: 1"));
        assert(output.includes("confirmation number: 2"));
      }

      console.log(output);
    });
  });

  describe("{ production: true, skipDryRun: true } [ @geth ]", function () {
    if (!process.env.GETH) return;

    let config, cleanupSandboxDir, web3, networkId;
    const project = path.join(__dirname, "../../sources/migrations/production");
    const logger = new MemoryLogger();

    before(async function () {
      this.timeout(10000);
      ({ config, cleanupSandboxDir } = await sandbox.create(project));
      config.network = "fakeRopsten";
      config.logger = logger;
      web3 = new Web3("http://localhost:8545");
      networkId = await web3.eth.net.getId();
    });

    after(function () {
      cleanupSandboxDir();
    });

    it("migrates without dry-run", async function () {
      this.timeout(70000);

      await CommandRunner.run("migrate --network fakeRopsten", config);
      const output = logger.contents();

      assert(!output.includes("dry-run"));

      assert(output.includes("2_migrations_conf.js"));
      assert(output.includes("Deploying 'Example'"));

      const location = path.join(
        config.contracts_build_directory,
        "Example.json"
      );
      const artifact = require(location);
      const network = artifact.networks[networkId];

      assert(output.includes(network.transactionHash));
      assert(output.includes(network.address));

      console.log(output);
    });
  });
});
