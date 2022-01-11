# node-red-contrib-mongodb4
A MongoDB client node for Node-Red powered by MongoDB Driver 4.

This package includes two nodes for node-red:
* A configuration node which defines a connection to a MongoDB database server.
* A flow node to execute every MongoDB collection operation supported by MongoDB Driver 4.

This node was inspired by other projects like [node-red-contrib-mongodb3](https://github.com/ozomer/node-red-contrib-mongodb2) or [node-red-node-mongodb](https://flows.nodered.org/node/node-red-node-mongodb).

## Compatibility
This MongoDB Node is compatible with the following MongoDB Server versions:
5.1, 5.0, 4.4, 4.2, 4.0, 3.6

You will also need a node-red version with NodeJS v12 or v14.

## Installation
Navigate to your .node-red directory - typically `~/.node-red`.
```
  npm install node-red-contrib-mongodb4
```

## Usage Example
Import the example flow to get a quick introduction how to use this node. \
[flow.json](https://raw.githubusercontent.com/steineey/node-red-contrib-mongodb4/master/examples/example-1.json) \
\
![flow-image](https://github.com/steineey/node-red-contrib-mongodb4/blob/master/examples/example-1-flow.png) \
\
![flow-image](https://github.com/steineey/node-red-contrib-mongodb4/blob/master/examples/example-1-config.png) \
\

## The Configuration Node
Configuration node for MongoDB connection config.
This node will create a MongoDB client, with a connection pool for operation nodes.

### Simple Connection URI

: Protocol (string) : `mongodb` or `mongodb+srv`

: Hostname (string) : Hostname / IP to connect to MongoDB

: Port (number) : Optional port number. In most cases `27017`.

### Advanced Connection URI

: URI (string) : This will overwrite `Protocol`, `Hostname` and `Port` with your own connection string.
[Read the docs: Connection String in URI Format](https://docs.mongodb.com/manual/reference/connection-string/)

### Authentication

: Username (string) : Username for authentication.

: Password (string) : Password for authentication.

: AuthSource (string) : Specify the database name associated with the user’s credentials.

: AuthMech (string) : Specify the authentication mechanism that MongoDB will use to authenticate the connection.

### TLS Encryption

: TLS CA-File (path) : Specifies the location of a local .pem file that contains the root certificate chain from the Certificate Authority. This file is used to validate the certificate presented by the mongod/mongos instance.

: TLS-Insecure (bool) : Disables various certificate validations. THIS IS REALLY NOT SECURE.

### More Options

: Options (JSON) : MongoDB Driver 4 MongoClient supports more options. Feel free to overwrite all client options with your own.
[Read the docs: MongoClientOptions](https://mongodb.github.io/node-mongodb-native/4.2/interfaces/MongoClientOptions.html)

### Database

: Database (string) : A MongoDB database name is required.

### Connection Pools
Each configuration node has his own connection pool with a default max poolsize of 100 connection at a given time. More parallel connections / operations will be queued and processed synchronous. In this scenario slow operations will delay fast operations. You can create more separat connection pools with more configuration nodes. [More Information](https://docs.mongodb.com/drivers/node/current/faq/#how-can-i-prevent-a-slow-operation-from-delaying-other-operations-)


## The Operation Node

Execute MongoDB collection operations with this node.

### Connection

Select a MongoDB database server connection.

### Collection

MongoDB database collection static definition or with `msg.collection`

### Operation

A MongoDB Driver 4 collection CRUD operation for example `find`, `insertOne`, `updateOne`, `aggregate` and many more.

Read the full documentation here: [Collection-API](https://mongodb.github.io/node-mongodb-native/4.2/classes/Collection.html)

### Payload Input

Pass the CRUD operation arguments as message payload.
Message payload has to be array type to pass multiple function arguments to driver operation.
Example: `msg.payload = [{_id: '123'},{fields: {...}}]`.
The payload array will be passed as function arguments for the MongoDB driver collection operation, like so: `collection.find({_id: '123'}, {fields: {...}})`

More information here:
[Collection-API](https://mongodb.github.io/node-mongodb-native/4.2/classes/Collection.html)

### Payload Output

The node will output the database driver response as message payload.
The operations `aggregate` and `find` can output with `toArray` or `forEach`.

### More information

[Visit the MongoDB Driver 4 Docs](https://docs.mongodb.com/drivers/node/current/)