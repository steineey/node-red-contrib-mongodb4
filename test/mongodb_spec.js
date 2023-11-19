const should = require("should");
const helper = require("node-red-node-test-helper");
const { ObjectId } = require("mongodb");
const mongodbNode = require("../src/mongodb4.js");

helper.init(require.resolve("node-red"));

describe("testing mongodb4 nodes", function () {
    const MONGODB_COLLECTION = process.env.MONGODB_COLLECTION || "";
    const MONGODB_CREDENTIALS = {
        username: process.env.MONGODB_USERNAME || "",
        password: process.env.MONGODB_PASSWORD || "",
    };
    const testFlow = [
        {
            id: "config-node",
            type: "mongodb4-client",
            protocol: process.env.MONGODB_PROTOCOL || "mongodb",
            hostname: process.env.MONGODB_HOSTNAME || "",
            port: process.env.MONGODB_PORT || "",
            dbName: process.env.MONGODB_DBNAME || "",
            authSource: process.env.MONGODB_AUTHSRC || "",
            authMechanism: process.env.MONGODB_AUTHMECH || "SCRAM-SHA-1",
            tls: Boolean(process.env.MONGODB_TLS),
            uriTabActive: "tab-uri-simple"
        },
        { id: "helper-node", type: "helper" },
    ];
    const operationNode = {
        id: "operation-node",
        type: "mongodb4",
        clientNode: "config-node",
        mode: "collection",
        collection: MONGODB_COLLECTION,
        operation: "insertOne",
        handleDocId: false,
        maxTimeMS: "0",
        output: "toArray",
        wires: [["helper-node"]],
    };

    beforeEach(function (done) {
        try {
            helper.startServer(done);
        }catch(err){
            done(err);
        }
    });

    afterEach(function (done) {
        helper.unload().then(function () {
            helper.stopServer(done);
        });
    });

    it("insertOne", function (done) {
        helper.load(
            mongodbNode,
            [
                ...testFlow,
                {
                    ...operationNode,
                },
            ],
            { "config-node": MONGODB_CREDENTIALS },
            function () {
                const helperNode = helper.getNode("helper-node");

                helperNode.on("input", function (msg) {
                    try {
                        msg.should.have
                            .property("payload")
                            .with.property("acknowledged", true);
                        done();
                    } catch (err) {
                        done(err);
                    }
                });

                const operationNode = helper.getNode("operation-node");

                operationNode.receive({
                    payload: [{ foo: "bar" }],
                });

                operationNode.on("call:error", (call) => {
                    done(new Error(call.firstArg));
                });
            }
        );
    });

    it("overwrite node config", function (done) {
        helper.load(
            mongodbNode,
            [
                ...testFlow,
                {
                    ...operationNode,
                    collection: "",
                    operation: ""
                },
            ],
            { "config-node": MONGODB_CREDENTIALS },
            function () {
                const helperNode = helper.getNode("helper-node");

                helperNode.on("input", function (msg) {
                    try {
                        msg.should.have
                            .property("payload")
                            .with.property("acknowledged", true);
                        done();
                    } catch (err) {
                        done(err);
                    }
                });

                const operationNode = helper.getNode("operation-node");

                operationNode.receive({
                    collection: MONGODB_COLLECTION,
                    operation: "insertOne",
                    payload: [{ foo: "bar" }]
                });

                operationNode.on("call:error", (call) => {
                    done(new Error(call.firstArg));
                });
            }
        );
    });

    it("implicit document _id (experimental)", function (done) {
        helper.load(
            mongodbNode,
            [
                ...testFlow,
                {
                    ...operationNode,
                    handleDocId: true
                },
            ],
            { "config-node": MONGODB_CREDENTIALS },
            function () {
                const helperNode = helper.getNode("helper-node");

                helperNode.on("input", function (msg) {
                    try {
                        msg.should.have.property("payload");
                        msg.payload.should.have
                            .property("insertedId")
                            .and.be.an.instanceOf(ObjectId);
                        msg.payload.should.have.property("acknowledged", true);
                        done();
                    } catch (err) {
                        done(err);
                    }
                });

                const operationNode = helper.getNode("operation-node");
                
                operationNode.receive({
                    payload: [{ _id: new ObjectId().toString() }]
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
            [
                ...testFlow,
                {
                    ...operationNode,
                    operation: "find"
                },
            ],
            { "config-node": MONGODB_CREDENTIALS },
            function () {
                const helperNode = helper.getNode("helper-node");

                helperNode.on("input", function (msg) {
                    try {
                        msg.should.have.property("payload");
                        msg.payload.should.be.instanceOf(Array);
                        done();
                    } catch (err) {
                        done(err);
                    }
                });

                const operationNode = helper.getNode("operation-node");

                operationNode.receive({
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
                ...testFlow,
                {
                    ...operationNode,
                    operation: "", // collection is empty so we can overwrite the operation with msg.operation
                    output: "forEach"
                },
            ],
            { "config-node": MONGODB_CREDENTIALS },
            function () {
                const operationNode = helper.getNode("operation-node");
                const helperNode = helper.getNode("helper-node");

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
            [
                ...testFlow,
                {
                    ...operationNode,
                    operation: "findOne"
                },
            ],
            { "config-node": MONGODB_CREDENTIALS },
            function () {
                const operationNode = helper.getNode("operation-node");

                operationNode.receive({
                    payload: [{ $fail: "foo bar" }]
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
            [
                ...testFlow,
                {
                    ...operationNode,
                    operation: "willFail"
                },
            ],
            { "config-node": MONGODB_CREDENTIALS },
            function () {
                const operationNode = helper.getNode("operation-node");

                operationNode.receive({
                    payload: [{ foo: "bar" }]
                });

                operationNode.on("call:error", (call) => {
                    try {
                        should(call.firstArg).have.property(
                            "message",
                            "unknown operation: 'willFail'"
                        );
                        done();
                    } catch (err) {
                        done(err);
                    }
                });
            }
        );
    });

    it("database operation - stats", function (done) {
        helper.load(
            mongodbNode,
            [
                ...testFlow,
                {
                    ...operationNode,
                    mode: "db",
                    operation: "stats"
                },
            ],
            { "config-node": MONGODB_CREDENTIALS },
            function () {
                const operationNode = helper.getNode("operation-node");
                const helperNode = helper.getNode("helper-node");

                helperNode.on("input", function (msg) {
                    try {
                        msg.should.have.property("payload").with.property("db", process.env.MONGODB_DBNAME);
                        done();
                    } catch (err) {
                        done(err);
                    }
                });

                operationNode.receive({});
            }
        );
    });
});
