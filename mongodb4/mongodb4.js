module.exports = function (RED) {
  var MongoClient = require("mongodb").MongoClient;

  function ClientNode(n) {
    RED.nodes.createNode(this, n);
    var node = this;
    
    // set database connection url
    node.url = `${n.protocol}://${n.hostname}:${n.port}`;
    node.dbName = n.dbName;

    // mongo client options
    node.options = {};
    if (node.credentials.username || node.credentials.password) {
      node.options.auth = {
        username: node.credentials.username,
        password: node.credentials.password,
      };
      node.options.authSource = n.authSource;
      node.options.authMechanism = n.authMechanism;
    }
    if (n.tls) node.options.tls = n.tls;
    if (n.tlsCAFile) node.options.tlsCAFile = n.tlsCAFile;
    if (n.tlsInsecure) node.options.tlsInsecure = n.tlsInsecure;

    // parse advanced options as json
    if(n.advanced) {
      try {
        var advanced = JSON.parse(n.advanced);
        node.options = {
          ...node.options,
          ...advanced
        };
      }catch(err){
        throw 'Parsing advanced options JSON failed.';
      }
    }

    node.client = null;

    node.connect = function () {
      node.client = new MongoClient(node.url, node.options);
      return node.client.connect();
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
            var request = c[operation](...msg.payload);

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

    if (node.n.client) {
      connect();
    } else {
      node.status({ fill: "red", shape: "ring", text: "error" });
      node.error("Missing node configuration");
    }

    node.on("close", function (removed, done) {
      if (node.n.connection) {
        node.n.connection.close();
      }
      done();
    });
  }

  RED.nodes.registerType("mongodb4", OperationNode);
};
