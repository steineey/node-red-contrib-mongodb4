var should = require("should");
var helper = require("node-red-node-test-helper");
var mongodbNode = require("../src/mongodb4.js");
var uid = require("uuid").v4();
var testConfig = require("./config.json");
const { ObjectId } = require("mongodb");

helper.init(require.resolve("node-red"));

function getHelperNode() {
  return { id: "helper-node", type: "helper" };
}

function getConfigNode() {
  return {
    id: "config-node",
    type: "mongodb4-client",
    ...testConfig.configNode,
  };
}

function getOperationNode() {
  return {
    id: "operation-node",
    type: "mongodb4",
    clientNode: "config-node",
    collection: testConfig.collection,
    wires: [["helper-node"]],
  };
}

var testFlow = [getHelperNode(), getConfigNode(), getOperationNode()];

describe("testing mongodb4 nodes", function () {
  beforeEach(function (done) {
    helper.startServer(done);
  });

  afterEach(function (done) {
    helper.unload().then(function () {
      helper.stopServer(done);
    });
  });

  it("connection test", function (done) {
    helper.load(
      mongodbNode,
      testFlow,
      { "config-node": testConfig.credentials },
      function () {
        var operationNode = helper.getNode("operation-node");
        var configNode = helper.getNode("config-node");

        should(operationNode).not.be.null();
        should(configNode).not.be.null();
        should(operationNode.n.client).not.be.null();

        var c = 0;
        var states = ["connecting", "connected"];

        operationNode.on("call:status", (call) => {
          should(call.firstArg.text).be.equal(states[c]);
          c++;
          if (call.firstArg.text === "connected") {
            done();
          }
        });
      }
    );
  });

  it("connection advanced", function (done) {
    helper.load(
      mongodbNode,
      [
        getHelperNode(),
        { ...getConfigNode(), advanced: '{"authSource": "nodered"}' },
        getOperationNode(),
      ],
      { "config-node": testConfig.credentials },
      function () {
        var operationNode = helper.getNode("operation-node");

        var c = 0;
        var states = ["connecting", "connected"];

        operationNode.on("call:status", (call) => {
          should(call.firstArg.text).be.equal(states[c]);
          c++;
          if (call.firstArg.text === "connected") {
            done();
          }
        });
      }
    );
  });

  it("insert test", function (done) {
    helper.load(
      mongodbNode,
      testFlow,
      { "config-node": testConfig.credentials },
      function () {
        var helperNode = helper.getNode("helper-node");
        var operationNode = helper.getNode("operation-node");

        helperNode.on("input", function (msg) {
          try {
            msg.should.have.property("payload");
            msg.payload.should.have.property("acknowledged", true);
            done();
          } catch (err) {
            done(err);
          }
        });

        operationNode.on("call:status", (call) => {
          if (call.firstArg && call.firstArg.text === "connected") {
            operationNode.receive({
              payload: [{ uid: uid }],
              collection: testConfig.collection,
              operation: "insertOne",
            });
          }
        });

        operationNode.on("call:error", (call) => {
          done(new Error(call.firstArg));
        });
      }
    );
  });

  it("operations before connected", function (done) {
    helper.load(
      mongodbNode,
      testFlow,
      { "config-node": testConfig.credentials },
      function () {
        var helperNode = helper.getNode("helper-node");
        var operationNode = helper.getNode("operation-node");

        operationNode.receive({
          payload: [{ uid: uid }],
          collection: testConfig.collection,
          operation: "insertOne",
        });

        operationNode.receive({
          payload: [{ uid: uid }],
          collection: testConfig.collection,
          operation: "insertOne",
        });

        var counter = 0;

        helperNode.on("input", function (msg) {
          counter++;
          try {
            msg.should.have.property("payload");
            msg.payload.should.have.property("acknowledged", true);
            if (counter === 2) {
              done();
            }
          } catch (err) {
            done(err);
          }
        });

        operationNode.on("call:error", (call) => {
          done(new Error(call.firstArg));
        });
      }
    );
  });

  it("implicit ObjectId", function (done) {
    helper.load(
      mongodbNode,
      testFlow,
      { "config-node": testConfig.credentials },
      function () {
        var helperNode = helper.getNode("helper-node");
        var operationNode = helper.getNode("operation-node");

        // step 1
        operationNode.receive({
          payload: [{ _id: "624b3c625a145193099962d1" }],
          collection: testConfig.collection,
          operation: "deleteMany",
        });

        helperNode.on("input", function (msg) {
          if (msg.operation === "deleteMany") {
            // after delete many
            operationNode.receive({
              payload: [
                { _id: ObjectId("624b3c625a145193099962d1"), success: true },
              ],
              collection: testConfig.collection,
              operation: "insertOne",
            });
            return;
          } else if (msg.operation === "insertOne") {
            // after insertOne
            operationNode.receive({
              payload: [{ _id: "624b3c625a145193099962d1" }],
              collection: testConfig.collection,
              operation: "findOne",
            });
            return;
          } else if (msg.operation === "findOne") {
            msg.should.have.property("payload");
            msg.payload.should.have.property("success");
            done();
          }
        });

        operationNode.on("call:error", (call) => {
          done(new Error(call.firstArg));
        });
      }
    );
  });

  it("find to array test", function (done) {
    helper.load(
      mongodbNode,
      testFlow,
      { "config-node": testConfig.credentials },
      function () {
        var helperNode = helper.getNode("helper-node");
        var operationNode = helper.getNode("operation-node");

        helperNode.on("input", function (msg) {
          try {
            msg.should.have.property("payload");
            msg.payload.should.have.property("uid", uid);
            done();
          } catch (err) {
            done(err);
          }
        });

        operationNode.on("call:status", (call) => {
          if (call.firstArg && call.firstArg.text === "connected") {
            operationNode.receive({
              payload: [{ uid: uid }],
              collection: testConfig.collection,
              operation: "findOne",
            });
          }
        });

        operationNode.on("call:error", (call) => {
          done(new Error(call.firstArg));
        });
      }
    );
  });

  it("find for each", function (done) {
    helper.load(
      mongodbNode,
      [
        getHelperNode(),
        getConfigNode(),
        { ...getOperationNode(), output: "forEach" },
      ],
      { "config-node": testConfig.credentials },
      function () {
        var helperNode = helper.getNode("helper-node");
        var operationNode = helper.getNode("operation-node");

        helperNode.on("input", function (msg) {
          try {
            msg.should.have.property("payload");
            done();
          } catch (err) {
            done(err);
          }
        });

        operationNode.on("call:status", (call) => {
          if (call.firstArg && call.firstArg.text === "connected") {
            operationNode.receive({
              payload: [[{ $limit: 1 }]],
              operation: "aggregate",
            });
          }
        });

        operationNode.on("call:error", (call) => {
          done(new Error(call.firstArg));
        });
      }
    );
  });

  it("test invalid payload", function (done) {
    helper.load(
      mongodbNode,
      testFlow,
      { "config-node": testConfig.credentials },
      function () {
        var operationNode = helper.getNode("operation-node");

        operationNode.on("call:status", (call) => {
          if (call.firstArg && call.firstArg.text === "connected") {
            operationNode.receive({
              payload: { uid: uid },
              collection: testConfig.collection,
              operation: "findOne",
            });
          }
        });

        operationNode.on("call:error", (call) => {
          should(call).have.property(
            "firstArg",
            "Payload is missing or not array type."
          );
          done();
        });
      }
    );
  });

  it("invalid query param", function (done) {
    helper.load(
      mongodbNode,
      testFlow,
      { "config-node": testConfig.credentials },
      function () {
        var operationNode = helper.getNode("operation-node");

        operationNode.on("call:status", (call) => {
          if (call.firstArg && call.firstArg.text === "connected") {
            operationNode.receive({
              payload: [{ $fail: uid }],
              collection: testConfig.collection,
              operation: "findOne",
            });
          }
        });

        operationNode.on("call:error", (call) => {
          done();
        });
      }
    );
  });

  it("collection operation undefined", function (done) {
    helper.load(
      mongodbNode,
      testFlow,
      { "config-node": testConfig.credentials },
      function () {
        var operationNode = helper.getNode("operation-node");

        operationNode.on("call:status", (call) => {
          if (call.firstArg && call.firstArg.text === "connected") {
            operationNode.receive({
              payload: [{ $fail: uid }],
              collection: testConfig.collection,
            });
          }
        });

        operationNode.on("call:error", (call) => {
          should(call).have.property(
            "firstArg",
            "Collection operation undefined."
          );
          done();
        });
      }
    );
  });

  it("collection operation not supported", function (done) {
    helper.load(
      mongodbNode,
      testFlow,
      { "config-node": testConfig.credentials },
      function () {
        var operationNode = helper.getNode("operation-node");

        operationNode.on("call:status", (call) => {
          if (call.firstArg && call.firstArg.text === "connected") {
            operationNode.receive({
              payload: [{ uid: uid }],
              collection: testConfig.collection,
              operation: "willFail",
            });
          }
        });

        operationNode.on("call:error", (call) => {
          should(call).have.property(
            "firstArg",
            'Unsupported collection operation: "willFail"'
          );
          done();
        });
      }
    );
  });
});
