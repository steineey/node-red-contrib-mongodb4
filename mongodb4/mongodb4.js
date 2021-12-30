module.exports = function (RED) {
  var MongoClient = require("mongodb").MongoClient;

  function ClientNode(n) {
    RED.nodes.createNode(this, n);
    var node = this;

    // node data
    node.n = {
      // set database connection url
      uri: null,
      // database name
      dbName: n.dbName,
      options: {},
      client: null,
    };

    try {
      if (n.uriTabActive === 'tab-uri-advanced') {
        if(n.uri) {
          node.n.uri = n.uri;
        }else{
          throw new Error("Connection URI undefined.");
        }
      } else if (n.protocol && n.hostname) {
        if (n.port) {
          node.n.uri = `${n.protocol}://${n.hostname}:${n.port}`;
        } else {
          node.n.uri = `${n.protocol}://${n.hostname}`;
        }
      } else {
        throw new Error("Connection URI undefined. Define a hostname.");
      }

      // mongo client options
      if (node.credentials.username || node.credentials.password) {
        node.n.options.auth = {
          username: node.credentials.username,
          password: node.credentials.password,
        };
        if (n.authSource) {
          node.n.options.authSource = n.authSource;
        }
        if (n.authMechanism) {
          node.n.options.authMechanism = n.authMechanism;
        }
      }

      // tls support
      node.n.options.tls = n.tls;
      if (n.tlsCAFile) node.n.options.tlsCAFile = n.tlsCAFile;
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

      node.connect = function () {
        return node.n.client.connect();
      };

      node.getDBName = function () {
        return node.n.dbName;
      };
    } catch (err) {
      node.error(err.message);
    }
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
      clientNode: RED.nodes.getNode(n.clientNode),
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

    async function handleIn(msg, send, done) {
      try {
        // get collection
        var c = msg.collection || node.n.collection;
        if (!c) {
          throw new Error("Database collection undefined.");
        }
        var collection = node.n.database.collection(c);

        // get operation
        var operation = msg.operation || node.n.operation;
        if (!operation) {
          throw new Error("Collection operation undefined.");
        }
        if (typeof collection[operation] !== "function") {
          throw new Error(`Unsupported collection operation: "${operation}"`);
        }

        // execute operation
        var request = null;
        if (Array.isArray(msg.payload)) {
          request = collection[operation](...msg.payload);
        } else {
          throw new Error("Payload is missing or not array type.");
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
    }

    node.on("input", function (msg, send, done) {
      send =
        send ||
        function () {
          node.send.apply(node, arguments);
        };

      if (node.n.database) {
        // continue with operation
        handleIn(msg, send, done);
      } else if (node.n.connect) {
        // wait for connection
        node.n.connect.then((success) => {
          if (success) {
            handleIn(msg, send, done);
          } else {
            node.error("Message dropped. Connection error.");
            if (done) {
              done();
            }
          }
        });
      } else {
        node.error("Message dropped. Not connected.");
        if (done) {
          done();
        }
      }
    });

    async function connect() {
      node.status({ fill: "yellow", shape: "ring", text: "connecting" });
      try {
        node.n.connection = await node.n.clientNode.connect();
        node.n.database = node.n.connection.db(node.n.clientNode.getDBName());

        // ping test
        var ping = await node.n.database.command({ ping: 1 });
        if (!ping || ping.ok !== 1) {
          throw new Error("Ping database server failed.");
        }
        node.n.connect = null;
        node.status({ fill: "green", shape: "dot", text: "connected" });
        return true;
      } catch (err) {
        // error on connection
        node.n.connect = null;
        node.status({ fill: "red", shape: "ring", text: "connection error" });
        node.error(err.message);
        return false;
      }
    }

    if (node.n.clientNode && node.n.clientNode.connect) {
      // connect async
      node.n.connect = connect();
    } else {
      node.status({ fill: "red", shape: "ring", text: "config error" });
      node.error("Configuration node error.");
    }

    node.on("close", function (removed, done) {
      if (node.n.connection) {
        node.n.connection.close();
      }
      if (done) {
        done();
      }
    });
  }

  RED.nodes.registerType("mongodb4", OperationNode);
};
