module.exports = function (RED) {
    var { MongoClient, ObjectId } = require("mongodb");

    function randStr() {
        return Math.floor(Math.random() * Date.now()).toString(36);
    }

    function ClientNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.mongoConfig = {
            uri: null, // mongodb connection uri
            options: {}, // mongodb client options
        };

        try {
            // prepare mongodb connection uri
            if (config.uriTabActive === "tab-uri-advanced") {
                if (config.uri) {
                    node.mongoConfig.uri = config.uri;
                } else {
                    throw new Error("Connection URI undefined.");
                }
            } else if (config.protocol && config.hostname) {
                if (config.port) {
                    node.mongoConfig.uri = `${config.protocol}://${config.hostname}:${config.port}`;
                } else {
                    node.mongoConfig.uri = `${config.protocol}://${config.hostname}`;
                }
            } else {
                throw new Error("Define a hostname for MongoDB connection.");
            }

            // mongo client authentication
            let auth = null;
            if (node.credentials.username || node.credentials.password) {
                auth = {
                    username: node.credentials.username || "",
                    password: node.credentials.password || "",
                };
            }

            // user can define more options with json input
            let advanced = {};
            try {
                advanced = JSON.parse(config.advanced || "{}");
            } catch (err) {
                throw new Error("Parsing advanced options JSON failed.");
            }

            // app name will be printed in db server log upon establishing each connection
            const appName = config.appName || `nodered-${randStr()}`;

            // connection options
            node.mongoConfig.options = {
                ...node.mongoConfig.options,
                appName: appName,
                auth: auth,
                authMechanism: config.authMechanism || undefined,
                authSource: config.authSource || undefined,
                tls: config.tls || undefined,
                tlsCAFile: config.tlsCAFile || undefined,
                tlsCertificateKeyFile:
                    config.tlsCertificateKeyFile || undefined,
                tlsCertificateKeyFilePassword:
                    config.tlsCertificateKeyFilePassword || undefined,
                tlsInsecure: config.tlsInsecure || undefined,
                connectTimeoutMS: parseInt(
                    config.connectTimeoutMS || "30000",
                    10
                ),
                socketTimeoutMS: parseInt(config.socketTimeoutMS || "0", 10),
                minPoolSize: parseInt(config.minPoolSize || "0", 10),
                maxPoolSize: parseInt(config.maxPoolSize || "100", 10),
                maxIdleTimeMS: parseInt(config.maxIdleTimeMS || "0", 10),
                ...advanced, // custom options will overwrite other options
            };

            // console.log(n, node.mongoConfig.options);

            // initialize mongo client instance
            node.mongoClient = new MongoClient(
                node.mongoConfig.uri,
                node.mongoConfig.options
            );
            node.log(`client initialized with app name '${appName}'`);

            node.database = node.mongoClient.db(config.dbName);
        } catch (err) {
            node.error(err.message);
        }

        node.on("close", async function (removed, done) {
            done = done || function () {};
            if (node.mongoClient) {
                // close client and all open connections
                await node.mongoClient.close();
                node.log("client closed");
            }
            done();
        });
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
            maxTimeMS: config.maxTimeMS,
            handleDocId: config.handleDocId,
        };

        node.counter = {
            success: 0,
            error: 0,
        };

        node.on("input", async function (msg, send, done) {
            try {
                let dbElement;
                if ((msg.mode || node.config.mode) === "db") {
                    // database operation mode
                    dbElement = node.mongoClient.database;
                } else {
                    // default mode is collection operation mode
                    // get mongodb collection
                    const cn = msg.collection || node.config.collection;
                    if (!cn) {
                        throw Error("collection name undefined");
                    }
                    dbElement = node.mongoClient.database.collection(cn);
                }

                // get mongodb operation
                const operation = msg.operation || node.config.operation;
                if (!operation) {
                    throw Error("operation undefined");
                }

                // check if mongodb collection has operation
                if (typeof dbElement[operation] !== "function") {
                    throw Error(`unknown operation: '${operation}'`);
                }

                // prepare request arguments
                let requestArg = [];
                if (msg.payload && !Array.isArray(msg.payload)) {
                    requestArg = [msg.payload];
                } else if (msg.payload) {
                    requestArg = msg.payload;
                }

                const maxTimeMS = parseInt(node.config.maxTimeMS || "0", 10);
                if (maxTimeMS > 0) {
                    setMaxTimeMS(operation, requestArg, maxTimeMS);
                }

                // experimentel feature
                if (node.config.handleDocId) {
                    try {
                        // handle mongodb document id
                        handleDocumentId(requestArg, false);
                    } catch (err) {
                        // on error set warning and continue
                        throw Error(
                            `document _id handling failed ${err.message}`
                        );
                    }
                }

                const request = dbElement[operation](...requestArg);

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
                    request.on("change", (payload) => {
                        node.send({ ...msg, payload: payload });
                    });
                } else {
                    msg.payload = await request;
                    send(msg);
                }

                // display node status
                node.counter.success++;
                node.status({
                    fill: "green",
                    shape: "dot",
                    text: `success ${node.counter.success}, error ${node.counter.error}`,
                });

                if (done) {
                    done();
                }
            } catch (err) {
                // operation error handling
                node.counter.error++;
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "critical error",
                });
                done(err);
            }
        });
    }

    // handle document _id which was set as string type by user
    // mongodb driver expects ObjectId as document _id
    function handleDocumentId(queryObj, keyWasId) {
        if (queryObj && typeof queryObj === "object") {
            for (var [key, value] of Object.entries(queryObj)) {
                keyWasId =
                    keyWasId ||
                    key === "_id" ||
                    key.substring(key.length - 4) === "._id";
                if (
                    keyWasId &&
                    typeof value === "string" &&
                    ObjectId.isValid(value)
                ) {
                    queryObj[key] = new ObjectId(value);
                } else if (typeof value === "object") {
                    handleDocumentId(value, keyWasId);
                }
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
