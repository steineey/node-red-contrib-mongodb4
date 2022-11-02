module.exports = function (RED) {
    var { MongoClient, ObjectId } = require("mongodb");

    function ClientNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;

        node.n = {
            uri: null, // mongodb connection uri
            options: {}, // mongodb client options
            client: null, // mongodb client instance
        };

        node.on("close", function (removed, done) {
            done = done || function () {};
            if (node.n.client) {
                node.n.client.close().then(done);
            } else {
                done();
            }
        });

        try {
            if (n.uriTabActive === "tab-uri-advanced") {
                if (n.uri) {
                    node.n.uri = n.uri;
                } else {
                    throw new Error("Connection URI undefined.");
                }
            } else if (n.protocol && n.hostname) {
                if (n.port) {
                    node.n.uri = `${n.protocol}://${n.hostname}:${n.port}`;
                } else {
                    node.n.uri = `${n.protocol}://${n.hostname}`;
                }
            } else {
                throw new Error("Define a hostname for MongoDB connection.");
            }

            // mongo client authentication
            if (node.credentials.username || node.credentials.password) {
                node.n.options.auth = {};
            }

            if (node.credentials.username)
                node.n.options.auth.username = node.credentials.username;
            if (node.credentials.password)
                node.n.options.auth.password = node.credentials.password;

            // authentication mechanism
            if (n.authMechanism) node.n.options.authMechanism = n.authMechanism;

            // authentication source
            if (n.authSource) node.n.options.authSource = n.authSource;

            // tls settings
            if (n.tls) node.n.options.tls = n.tls;
            if (n.tlsCAFile) node.n.options.tlsCAFile = n.tlsCAFile;
            if (n.tlsCertificateKeyFile)
                node.n.options.tlsCertificateKeyFile = n.tlsCertificateKeyFile;
            if (node.credentials.tlsCertificateKeyFilePassword) {
                node.n.options.tlsCertificateKeyFilePassword =
                    node.credentials.tlsCertificateKeyFilePassword;
            }
            if (n.tlsInsecure) node.n.options.tlsInsecure = n.tlsInsecure;

            // parse advanced options as json
            if (n.advanced) {
                try {
                    var advanced = JSON.parse(n.advanced);
                    node.n.options = {
                        ...node.n.options,
                        ...advanced,
                    };
                } catch (err) {
                    throw new Error("Parsing advanced options JSON failed.");
                }
            }

            node.n.client = new MongoClient(node.n.uri, node.n.options);

        } catch (err) {
            node.error(err.message);
        }

        node.getDatabase = function () {
            if(node.n.client) {
                return node.n.client.db(n.dbName);
            }else{
                return null;
            }
        };
    }

    RED.nodes.registerType("mongodb4-client", ClientNode, {
        credentials: {
            username: { type: "text" },
            password: { type: "password" },
        },
    });

    function OperationNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        node.n = {
            database: RED.nodes.getNode(n.clientNode).getDatabase(),
            mode: n.mode,
            collection: n.collection,
            operation: n.operation,
            output: n.output,
            handleDocId: n.handleDocId,
            counter: {
                success: 0,
                error: 0,
            }
        };

        node.ping = async function(database) {
            try {
                var ping = await database.command({ ping: 1 });
                if (ping && ping.ok === 1) {
                    node.status({
                        fill: "green",
                        shape: "dot",
                        text: "connected",
                    });
                } else {
                    throw Error("ping failed");
                }
            }catch(err){
                node.error(err);
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "ping failed",
                });
            }
        }

        // connection test
        if(node.n.database) {
            node.ping(node.n.database);
        }else{
            node.status({
                fill: "red",
                shape: "dot",
                text: "config node error"
            });
        }
        
        node.on("input", async function (msg, send, done) {

            if(node.n.database === null) {
                done(new Error("config node error"));
                return;
            }

            try {
                var dbElement;
                if ((msg.mode || node.n.mode) === "db") {
                    // database operation mode
                    dbElement = node.n.database;
                } else {
                    // default mode is collection operation mode
                    // get mongodb collection
                    var cn = msg.collection || node.n.collection;
                    if (!cn) {
                        throw Error("collection name undefined");
                    }
                    dbElement = node.n.database.collection(cn);
                }

                // get mongodb operation
                var operation = msg.operation || node.n.operation;
                if (!operation) {
                    throw Error("collection operation undefined");
                }

                // check if mongodb collection has operation
                if (typeof dbElement[operation] !== "function") {
                    throw Error(`unknown operation: "${operation}"`);
                }

                var request;
                if (Array.isArray(msg.payload)) {
                    if (node.n.handleDocId) {
                        try {
                            // handle mongodb document id
                            handleDocumentId(msg.payload, false);
                        } catch (warn) {
                            // on error set warning and continue
                            console.warn(
                                "mongodb4-operation: document _id fix failed; " +
                                    warn.message
                            );
                        }
                    }
                    request = dbElement[operation](...msg.payload);
                } else if (
                    typeof msg.payload === "object" ||
                    typeof msg.payload === "string" ||
                    typeof msg.payload === "number"
                ) {
                    request = dbElement[operation](msg.payload);
                } else {
                    request = dbElement[operation]();
                }

                // output handling on aggregate or find operation
                if (operation === "aggregate" || operation === "find") {
                    switch (node.n.output) {
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
                node.n.counter.success++;
                node.status({
                    fill: "green",
                    shape: "dot",
                    text: `success ${node.n.counter.success}, error ${node.n.counter.error}`,
                });

                if (done) {
                    done();
                }
            } catch (err) {
                // operation error handling
                node.n.counter.error++;
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "operation error",
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
                if (
                    (key === "_id" || keyWasId) &&
                    typeof value === "string" &&
                    ObjectId.isValid(value)
                ) {
                    queryObj[key] = ObjectId(value);
                } else if (typeof value === "object") {
                    if (key === "_id") {
                        keyWasId = true;
                    }
                    handleDocumentId(value, keyWasId);
                }
            }
        }
    }

    RED.nodes.registerType("mongodb4", OperationNode);
};
