module.exports = function (RED) {
    var MongoClient = require("mongodb").MongoClient;

    function ClientNode(n) {
        RED.nodes.createNode(this, n);

        // set database connection url
        this.url = `${n.protocol}://${n.hostname}:${n.port}`;
        this.dbName = n.dbName;

        // mongo client options
        this.options = {};
        if (this.credentials.username || this.credentials.password) {
            this.options.auth = {
                username: this.credentials.username,
                password: this.credentials.password,
            };
            this.options.authSource = n.authSource;
            this.options.authMechanism = n.authMechanism;
        }
        if (n.tls) this.options.tls = n.tls;
        if (n.tlsCAFile) this.options.tlsCAFile = n.tlsCAFile;
        if (n.tlsInsecure) this.options.tlsInsecure = n.tlsInsecure;

        this.client = null;

        var node = this;

        node.connect = function () {
            this.client = new MongoClient(this.url, this.options);
            return this.client.connect();
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
        this.clientNode = n.clientNode;
        this.operation = n.operation;
        this.collection = n.collection;
        var node = this;
        var counter = 0;

        node.status({ fill: "yellow", shape: "ring", text: "waiting" });

        node.on("input", async function (msg, send, done) {
            send =
                send ||
                function () {
                    node.send.apply(node, arguments);
                };

            var clientNode = RED.nodes.getNode(node.clientNode);

            try {
                var client = await clientNode.connect();
                try {
                    // get collection
                    var collection = msg.collection || node.collection;
                    var c = client.db(clientNode.dbName).collection(collection);

                    // get operation
                    var operation = msg.operation || node.operation;
                    if (typeof c[operation] !== "function") {
                        throw `Operation "${operation}" is not supported by collection.`;
                    }

                    // execute request
                    var request = null;
                    if (Array.isArray(msg.payload)) {
                        request = c[operation].apply(this, msg.payload);
                    } else {
                        request = c[operation](msg.payload);
                    }

                    // continue with response
                    if (operation === "aggregate" || operation === "find") {
                        msg.payload = await request.toArray();
                    } else {
                        msg.payload = await request;
                    }
                    send(msg);

                    // display node status
                    counter++;
                    node.status({
                        fill: "green",
                        shape: "dot",
                        text: `success ${counter}`,
                    });
                } finally {
                    client.close();
                }
            } catch (err) {
                counter = 0;
                node.status({ fill: "red", shape: "ring", text: "error" });
                node.error(err);
            }

            if (done) {
                done();
            }
        });
    }

    RED.nodes.registerType("mongodb4", OperationNode);
};
