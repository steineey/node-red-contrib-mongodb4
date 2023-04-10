module.exports = function (RED) {
    var { MongoClient, ObjectId } = require("mongodb");

    function randStr(){
        return Math.floor(Math.random() * Date.now()).toString(36);
    }  

    function ClientNode(n) {
        RED.nodes.createNode(this, n);
        const node = this;

        node.n = {
            uri: null, // mongodb connection uri
            options: {}, // mongodb client options
            client: null, // mongodb client instance
        };

        node.on("close", async function (removed, done) {
            done = done || function () {};
            if (node.n.client) {
                // close client and all open connections
                await node.n.client.close();
                node.log("client closed");
            }
            done();
        });

        try {

            // prepare mongodb connection uri
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
            let auth = null;
            if (node.credentials.username || node.credentials.password) {
                auth = {
                    username: node.credentials.username || '',
                    password: node.credentials.password || ''
                };
            }

            // user can define more options with json input
            let advanced = {};
            try {
                advanced = JSON.parse(n.advanced || "{}");
            } catch (err) {
                throw new Error("Parsing advanced options JSON failed.");
            }

            // app name will be printed in db server log upon establishing each connection
            const appName = n.appName || `nodered-${randStr()}`;

            // connection options
            node.n.options = {
                ...node.n.options,
                appName: appName,
                auth: auth,
                authMechanism: n.authMechanism || undefined,
                authSource: n.authSource || undefined,
                tls: n.tls || undefined,
                tlsCAFile: n.tlsCAFile || undefined,
                tlsCertificateKeyFile: n.tlsCertificateKeyFile || undefined,
                tlsCertificateKeyFilePassword: n.tlsCertificateKeyFilePassword || undefined,
                tlsInsecure: n.tlsInsecure || undefined,
                connectTimeoutMS: parseInt(n.connectTimeoutMS || "30000", 10),
                socketTimeoutMS: parseInt(n.socketTimeoutMS || "0", 10),
                minPoolSize: parseInt(n.minPoolSize || "0", 10),
                maxPoolSize: parseInt(n.maxPoolSize || "100", 10),
                maxIdleTimeMS: parseInt(n.maxIdleTimeMS || "0", 10),
                ...advanced // custom options will overwrite other options
            };

            // console.log(n, node.n.options);

            // initialize mongo client instance
            node.n.client = new MongoClient(node.n.uri, node.n.options);
            node.log(`client initialized with app name '${appName}'`);

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
        const node = this;
        node.n = {
            database: RED.nodes.getNode(n.clientNode).getDatabase(),
            mode: n.mode,
            collection: n.collection,
            operation: n.operation,
            output: n.output,
            maxTimeMS: n.maxTimeMS,
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
                let dbElement;
                if ((msg.mode || node.n.mode) === "db") {
                    // database operation mode
                    dbElement = node.n.database;
                } else {
                    // default mode is collection operation mode
                    // get mongodb collection
                    const cn = msg.collection || node.n.collection;
                    if (!cn) {
                        throw Error("collection name undefined");
                    }
                    dbElement = node.n.database.collection(cn);
                }

                // get mongodb operation
                const operation = msg.operation || node.n.operation;
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
                    requestArg = [ msg.payload ];
                }else if(msg.payload) {
                    requestArg = msg.payload;
                }

                const maxTimeMS = parseInt(node.n.maxTimeMS || "0", 10);
                if(maxTimeMS > 0) {
                    setMaxTimeMS(operation, requestArg, maxTimeMS);
                }

                // experimentel feature
                if (node.n.handleDocId) {
                    try {
                        // handle mongodb document id
                        handleDocumentId(requestArg, false);
                    } catch (err) {
                        // on error set warning and continue
                        throw Error(`document _id handling failed ${err.message}`);
                    }
                }

                const request = dbElement[operation](...requestArg);

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
                    queryObj[key] = new ObjectId(value);
                } else if (typeof value === "object") {
                    if (key === "_id") {
                        keyWasId = true;
                    }
                    handleDocumentId(value, keyWasId);
                }
            }
        }
    }

    function setMaxTimeMS(operation, payload, maxTimeMS) {
        let argi = 0;
        switch(operation) {
            case 'stats':
                argi = 0;
                break;
            case 'insertOne':
            case 'insertMany':
            case 'find':
            case 'findOne':
            case 'aggregate':
            case 'findOneAndDelete':
            case 'deleteOne':
            case 'deleteMany':
            case 'count':
            case 'countDocuments':
                argi = 1;
                break;
            case 'replaceOne':
            case 'updateOne':
            case 'updateMany':
            case 'findOneAndUpdate':
            case 'findOneAndReplace':
                argi = 2;
                break;
            default:
                throw Error(`this node can't set maxTimeMS for operation '${operation}'. Use msg.payload instead.`);
        }
        
        if(typeof payload[argi] !== 'object') {
            payload[argi] = {};
        }

        payload[argi].maxTimeMS = maxTimeMS;
    }

    RED.nodes.registerType("mongodb4", OperationNode);
};
