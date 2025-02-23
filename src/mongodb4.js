module.exports = function (RED) {
    const { MongoClient, ObjectId } = require("mongodb");

    function randStr() {
        return Math.floor(Math.random() * Date.now()).toString(36);
    }

    function ClientNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // prepare mongodb connection uri
        let mongoUri = "";
        switch (config.uriTabActive) {
            case "tab-uri-simple":
                if (config.protocol && config.hostname) {
                    mongoUri = `${config.protocol}://${config.hostname}`;
                } else {
                    throw new Error("MongoDB protocol or hostname undefined.");
                }
                if (config.port) {
                    mongoUri += `:${config.port}`;
                }
                break;

            case "tab-uri-advanced":
                if (config.uri) {
                    mongoUri = config.uri;
                } else {
                    throw new Error("MongoDB URI undefined.");
                }
                break;

            default:
                throw new Error("MongoDB uri config failed.");
        }

        // prepare mongodb client authentication
        let auth = null;
        if (node.credentials.username || node.credentials.password) {
            auth = {
                username: node.credentials.username || "",
                password: node.credentials.password || "",
            };
        }

        // user can pass more options as json
        let advanced = {};
        try {
            advanced = JSON.parse(config.advanced || "{}");
        } catch (err) {
            throw new Error("Parsing advanced options JSON failed.");
        }

        // app name will be printed in db server log upon establishing each connection
        const appName = config.appName || `nodered-${randStr()}`;

        // init mongo client instance
        node.mongoClient = new MongoClient(mongoUri, {
            appName: appName,
            auth: auth,
            authMechanism: config.authMechanism || undefined,
            authSource: config.authSource || undefined,
            tls: config.tls || undefined,
            tlsCAFile: config.tlsCAFile || undefined,
            tlsCertificateKeyFile: config.tlsCertificateKeyFile || undefined,
            tlsCertificateKeyFilePassword:
                config.tlsCertificateKeyFilePassword || undefined,
            tlsInsecure: config.tlsInsecure || undefined,
            connectTimeoutMS: parseInt(config.connectTimeoutMS || "30000", 10),
            socketTimeoutMS: parseInt(config.socketTimeoutMS || "0", 10),
            minPoolSize: parseInt(config.minPoolSize || "0", 10),
            maxPoolSize: parseInt(config.maxPoolSize || "100", 10),
            maxIdleTimeMS: parseInt(config.maxIdleTimeMS || "0", 10),
            ...advanced, // custom options will overwrite other options
        });

        // internal database pointer
        node._db = node.mongoClient.db(config.dbName);

        // listening for unexpected topology close
        node._topologyIsClosed = false;
        node.mongoClient.on("topologyClosed", () => {
            node._topologyIsClosed = true;
        });

        // database handling
        node.db = async () => {
            if (node._topologyIsClosed) {
                // try reconnect in event of topology is closed
                await node.mongoClient.connect();
                node._db = node.mongoClient.db(config.dbName);
                node._topologyIsClosed = false;
            }
            return node._db;
        };

        // on flow redeployment or node-red instance shutdown
        node.on("close", async (removed, done) => {
            done = done || function () {};
            if (node.mongoClient) {
                // close mongodb client and all open connections
                await node.mongoClient.close();
                node.log("client closed");
            }
            done();
        });

        node.log(`client initialized with app name '${appName}'`);
    }

    RED.nodes.registerType("mongodb4-client", ClientNode, {
        credentials: {
            username: { type: "text" },
            password: { type: "password" },
        },
    });

    function OperationNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.mongoClient = RED.nodes.getNode(config.clientNode);

        node.config = {
            mode: config.mode,
            collection: config.collection,
            operation: config.operation,
            output: config.output,
            maxTimeMS: parseInt(config.maxTimeMS || "0", 10),
            handleDocId: config.handleDocId,
        };

        /* display node metric in node status */
        const metric = {
            execCtr: 0,
            successCtr: 0,
            errorCtr: 0,
            runtime: 0,
        };

        function updateStatus({ fill }) {
            node.status({
                fill: fill,
                shape: "dot",
                text: `s=${metric.successCtr}, err=${metric.errorCtr}, rt=${metric.runtime}ms`,
            });
        }

        // init
        updateStatus({ fill: "green" });

        function execStart() {
            const execStartTs = Date.now();
            metric.execCtr++;
            updateStatus({ fill: "blue" });
            return execStartTs;
        }

        function execSuccess(execStartTs) {
            metric.execCtr--;
            metric.successCtr++;
            metric.runtime = Date.now() - execStartTs;
            updateStatus({
                fill: metric.execCtr > 0 ? "blue" : "green",
            });
        }

        function execError(execStartTs) {
            metric.execCtr--;
            metric.errorCtr++;
            metric.runtime = Date.now() - execStartTs;
            updateStatus({
                fill: "red",
            });
        }

        // mongodb change stream
        node.changeStream = null;

        node.closeChangeStream = async () => {
            if (node.changeStream) {
                await node.changeStream.close();
            }
        };

        node.on("input", async (msg, send, done) => {
            done = done || function () {};

            const execStartTs = execStart();

            try {
                // close existing changeStreams if necessary
                await node.closeChangeStream();

                // get mongodb database
                if (!node.mongoClient || !node.mongoClient.db) {
                    throw Error("MongoDB config error.");
                }
                const database = await node.mongoClient.db();

                let operTarget;
                if (node.config.mode === "db") {
                    // database operation mode
                    operTarget = database;
                } else {
                    // default mode is collection operation mode
                    const cn = node.config.collection || msg.collection;
                    if (!cn) throw Error("collection name undefined");
                    operTarget = database.collection(cn);
                }

                // get mongodb operation
                const operation = node.config.operation || msg.operation;
                if (!operation) throw Error("operation undefined");

                // check if mongodb collection has operation
                if (typeof operTarget[operation] !== "function") {
                    throw Error(`unknown operation: '${operation}'`);
                }

                // prepare operation arguments
                let operArgs = [];
                if (msg.payload) {
                    // operation args, have to be array type
                    if (Array.isArray(msg.payload)) {
                        operArgs = msg.payload;
                    } else {
                        operArgs = [msg.payload];
                    }
                }

                // add max time
                if (node.config.maxTimeMS > 0) {
                    setMaxTimeMS(operation, operArgs, node.config.maxTimeMS);
                }

                // DEPRECATED: no longer maintained, do not use in future projects
                if (node.config.handleDocId) {
                    try {
                        // handle mongodb document id
                        handleDocumentId(operArgs, false);
                    } catch (err) {
                        // on error set warning and continue
                        throw Error(
                            `document _id handling failed ${err.message}`
                        );
                    }
                }

                // execute operation
                const request = operTarget[operation](...operArgs);

                // output handling on aggregate or find operation
                if (operation === "aggregate" || operation === "find") {
                    switch (node.config.output) {
                        case "forEach":
                            await request.forEach((payload) => {
                                send({ ...msg, payload: payload });
                            });
                            break;

                        case "toArray":
                        default:
                            msg.payload = await request.toArray();
                            send(msg);
                    }
                } else if (operation === "watch") {
                    node.changeStream = request;
                    node.changeStream.on("change", (payload) => {
                        node.send({ payload: payload });
                    });
                    node.changeStream.on("error", (err) => {
                        node.error(err);
                    });
                    done();
                } else {
                    msg.payload = await request;
                    send(msg);
                }

                execSuccess(execStartTs);
                done();
            } catch (err) {
                // operation error handling
                execError(execStartTs);
                done(err);
            }
        });

        node.on("close", async (removed, done) => {
            done = done || function () {};
            await node.closeChangeStream();
            done();
        });
    }

    // handle document _id which was set as string type by user
    // mongodb driver expects ObjectId as document _id
    function handleDocumentId(queryObj, keyWasId) {
        if (!queryObj || typeof queryObj !== "object") {
            return;
        }

        for (const [key, value] of Object.entries(queryObj)) {
            const keyIsId =
                keyWasId === true ||
                key === "_id" ||
                key.substring(key.length - 4) === "._id";

            if (
                keyIsId === true &&
                typeof value === "string" &&
                ObjectId.isValid(value)
            ) {
                queryObj[key] = new ObjectId(value);
            } else if (typeof value === "object") {
                handleDocumentId(value, keyIsId);
            }
        }
    }

    function setMaxTimeMS(operation, payload, maxTimeMS) {
        let argi = 0;
        switch (operation) {
            case "stats":
                argi = 0;
                break;
            case "insertOne":
            case "insertMany":
            case "find":
            case "findOne":
            case "aggregate":
            case "findOneAndDelete":
            case "deleteOne":
            case "deleteMany":
            case "count":
            case "countDocuments":
                argi = 1;
                break;
            case "replaceOne":
            case "updateOne":
            case "updateMany":
            case "findOneAndUpdate":
            case "findOneAndReplace":
                argi = 2;
                break;
            default:
                throw Error(
                    `this node can't set maxTimeMS for operation '${operation}'. Use msg.payload instead.`
                );
        }

        if (typeof payload[argi] !== "object") {
            payload[argi] = {};
        }

        payload[argi].maxTimeMS = maxTimeMS;
    }

    RED.nodes.registerType("mongodb4", OperationNode);
};
