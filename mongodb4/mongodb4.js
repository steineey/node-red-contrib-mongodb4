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

	function CollectionNode(n) {
		RED.nodes.createNode(this, n);
		var node = this;
		node.n = {
			client: RED.nodes.getNode(n.clientNode),
			connection: null,
			database: null,
			counter: {
				success: 0,
				error: 0,
			},
			collection: n.collection,
			operation: n.operation,
			output: n.output,
		};

		var connect = async function () {
			node.status({ fill: "yellow", shape: "ring", text: "connecting" });

			try {
				node.n.connection = await node.n.client.connect();

				// get database
				node.n.database = node.n.connection.db(node.n.client.dbName);
				await node.n.database.command({ ping: 1 });
				node.status({ fill: "green", shape: "dot", text: "connected" });

				node.on("input", async function (msg, send, done) {
					send =
						send ||
						function () {
							node.send.apply(node, arguments);
						};

					try {
						// get collection
						var collection = msg.collection || node.n.collection;
						var c = node.n.database.collection(collection);

						// get operation
						var operation = msg.operation || node.n.operation;
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
							switch (node.n.output) {
								case "toArray":
									msg.payload = await request.toArray();
									send(msg);
									break;

								case "forEach":
									await request.forEach(function (payload) {
										msg.payload = payload;
										send(msg);
									});
									break;
							}
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
					} catch (err) {
						node.n.counter.error++;
						node.status({
							fill: "red",
							shape: "ring",
							text: "operation error",
						});
						node.error(err);
					}

					if (done) {
						done();
					}
				});
				// end of node input
			} catch (err) {
				counter = 0;
				node.status({ fill: "red", shape: "ring", text: "error" });
				node.error(err);
			}
		};

		if (clientNode) {
			connect();
		} else {
			node.status({ fill: "red", shape: "ring", text: "error" });
			node.error("Missing node configuration");
		}

		node.on("close", function (removed, done) {
			if (connection) {
				connection.close();
			}
			done();
		});
	}

	RED.nodes.registerType("mongodb4-collection", CollectionNode);
};
