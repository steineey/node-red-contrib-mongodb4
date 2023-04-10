var should = require("should");
var helper = require("node-red-node-test-helper");
var mongodbNode = require("../src/mongodb4.js");
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
        handleDocId: true,
        maxTimeMS: "0",
        output: "toArray",
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

                operationNode.on("call:status", (call) => {
                    should(call.firstArg.text).be.equal("connected");
                    done();
                });
            }
        );
    });

    it("insertOne", function (done) {
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

                operationNode.receive({
                    payload: [{ foo: 'bar' }],
                    collection: testConfig.collection,
                    operation: "insertOne",
                });

                operationNode.on("call:error", (call) => {
                    done(new Error(call.firstArg));
                });
            }
        );
    });

    it("document _id", function (done) {
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
                        msg.payload.should.have.property("insertedId").and.be.an.instanceOf(ObjectId)
                        msg.payload.should.have.property("acknowledged", true);
                        done();
                    } catch (err) {
                        done(err);
                    }
                });

                operationNode.receive({
                    payload: [{ _id: new ObjectId().toString() }],
                    collection: testConfig.collection,
                    operation: "insertOne",
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
                        msg.payload.should.be.instanceOf(Array);
                        done();
                    } catch (err) {
                        done(err);
                    }
                });

                operationNode.receive({
                    collection: testConfig.collection,
                    operation: "find",
                    payload: [{}],
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

                let msgCount = 0;

                helperNode.on("input", (msg) => {
                    if (msg.afterInsertMany) {
                        operationNode.receive({
                            operation: "aggregate",
                            payload: [
                                [
                                    { $match: { test: { $in: [1, 2, 3] } } },
                                    { $limit: 3 },
                                ],
                            ],
                        });
                    } else {
                        // count to three
                        msgCount++;
                        if (msgCount === 3) {
                            done();
                        }
                    }
                });

                operationNode.receive({
                    operation: "insertMany",
                    payload: [[{ test: 1 }, { test: 2 }, { test: 3 }]],
                    afterInsertMany: true,
                });

                operationNode.on("call:error", (call) => {
                    done(new Error(call.firstArg));
                });
            }
        );
    });

    it("mongodb error", function (done) {
        helper.load(
            mongodbNode,
            testFlow,
            { "config-node": testConfig.credentials },
            function () {
                var operationNode = helper.getNode("operation-node");

                operationNode.receive({
                    payload: [{ $fail: 'foo bar' }],
                    collection: testConfig.collection,
                    operation: "findOne",
                });

                operationNode.on("call:error", (call) => {
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

                operationNode.receive({
                    payload: [{ foo: 'bar' }],
                    collection: testConfig.collection,
                    operation: "willFail",
                });

                operationNode.on("call:error", (call) => {
                    try {
                        should(call.firstArg).have.property(
                            "message",
                            "unknown operation: 'willFail'"
                        );
                        done();
                    }catch(err){
                        done(err);
                    }
                });
            }
        );
    });
});
