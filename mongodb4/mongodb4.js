module.exports = function (RED) {
  var MongoClient = require("mongodb").MongoClient;

  function ClientNode(n) {
    RED.nodes.createNode(this, n);
    var node = this;

    // node data
    node.n = {
      // set database connection url
      url: `${n.protocol}://${n.hostname}:${n.port}`,
      // database name
      dbName: n.dbName,
      options: {},
      client: null
    };

    // mongo client options
    if (node.credentials.username || node.credentials.password) {
      node.n.options.auth = {
        username: node.credentials.username,
        password: node.credentials.password,
      };
      node.n.options.authSource = n.authSource;
      node.n.options.authMechanism = n.authMechanism;
    }

    // tls support
    if (n.tls) node.n.options.tls = n.tls;
    if (n.tlsCAFile) node.n.options.tlsCAFile = n.tlsCAFile;
    if (n.tlsInsecure) node.n.options.tlsInsecure = n.tlsInsecure;

    // parse advanced options as json
    if(n.advanced) {
      try {
        var advanced = JSON.parse(n.advanced);
        node.n.options = {
          ...node.n.options,
          ...advanced
        };
      }catch(err){
        node.error(new Error('Parsing advanced options JSON failed.'));
      }
    }

    node.connect = function () {
      if(node.n.client === null){
        node.n.client = new MongoClient(node.n.url, node.n.options);
      }
      return node.n.client.connect();
    };

    node.getDBName = function() {
      return node.n.dbName;
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
        node.n.database = node.n.connection.db(node.n.client.getDBName());
        
        // ping test
        var ping = await node.n.database.command({ ping: 1 });
        if(!ping || ping.ok !== 1) {
          throw 'Ping database server failed.';
        }

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
            if(!collection){
              throw new Error('Database collection undefined.');
            }
            var c = node.n.database.collection(collection);

            // get operation
            var operation = msg.operation || node.n.operation;
            if(!operation) {
              throw new Error('Collection operation undefined.');
            }
            if (typeof c[operation] !== "function") {
              throw new Error(`Unsupported collection operation: "${operation}"`);
            }

            // execute operation
            var request = null;
            if(Array.isArray(msg.payload)){
              request = c[operation](...msg.payload);
            } else {
              throw new Error('Payload is missing or not array type.');
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
            node.error(err.message);
          }

          if (done) {
            done();
          }
        });
        // end of node input
      } catch (err) {
        counter = 0;
        node.status({ fill: "red", shape: "ring", text: "error" });
        node.error(err.message);
      }
    };

    if (node.n.client) {
      connect();
    } else {
      node.status({ fill: "red", shape: "ring", text: "error" });
      node.error(new Error("Node configuration undefined."));
    }

    node.on("close", function (removed, done) {
      if (node.n.connection) {
        node.n.connection.close();
      }
      if(done) {
        done();
      }
    });
  }

  RED.nodes.registerType("mongodb4", OperationNode);
};
