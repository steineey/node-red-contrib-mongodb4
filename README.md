# node-red-contrib-mongodb4

A MongoDB driver node for Node-Red without limitations.

[![npm version](https://img.shields.io/npm/v/node-red-contrib-mongodb4.svg?style=flat-square)](https://www.npmjs.org/package/node-red-contrib-mongodb4)
[![install size](https://img.shields.io/badge/dynamic/json?url=https://packagephobia.com/v2/api.json?p=node-red-contrib-mongodb4&query=$.install.pretty&label=install%20size&style=flat-square)](https://packagephobia.now.sh/result?p=node-red-contrib-mongodb4)
[![npm downloads](https://img.shields.io/npm/dm/node-red-contrib-mongodb4.svg?style=flat-square)](https://npm-stat.com/charts.html?package=node-red-contrib-mongodb4)

This package includes two nodes for node-red:

**The Config Node**

Connect to your local MongoDB Server or a MongoDB Atlas cluster.
![client-node](https://raw.githubusercontent.com/steineey/node-red-contrib-mongodb4/master/examples/config-node.png)

**The Flow Node**

Execute a database or collection operation within your flow. This node was developed to use all the features of the native MongoDB driver without any limitations.
![basic-flow](https://raw.githubusercontent.com/steineey/node-red-contrib-mongodb4/master/examples/basic-flow.png)
![flow-node](https://raw.githubusercontent.com/steineey/node-red-contrib-mongodb4/master/examples/operation-node.png)

_This node was inspired by other projects like [node-red-contrib-mongodb3](https://github.com/ozomer/node-red-contrib-mongodb2) or [node-red-node-mongodb](https://flows.nodered.org/node/node-red-node-mongodb)._

## Installation

Navigate to your .node-red directory - typically `~/.node-red`.

```sh
npm install --save --omit=dev node-red-contrib-mongodb4
```

## Compatibility

The latest version of node-red-contrib-mongodb4@2.4.x is compatible with the following MongoDB server versions: 8.0, 7.0, 6.0, 5.0, 4.4, 4.2, 4.0

Node-RED >= v3.0.0  
NodeJS >= v16.20.1

## Upgrade to node-red-contrib-mongodb4@3.x.x

Version 3.x of this node-red node is now using the mongodb driver version 6.12.

These breaking changes could affect you if you upgrade from node-red-contrib-mongodb4@2.x.x to node-red-contrib-mongodb@3.x.x. [Read here](https://www.mongodb.com/docs/drivers/node/current/upgrade/#version-6.0-breaking-changes) 

## Usage Example

Import the example flow to get a quick introduction how to use this node. \
[flow.json](https://raw.githubusercontent.com/steineey/node-red-contrib-mongodb4/master/examples/example-1.json) \
\
![flow-image](https://raw.githubusercontent.com/steineey/node-red-contrib-mongodb4/master/examples/example-1-flow.png)

## The Configuration Node

Configuration node for MongoDB connection config.
This node will create a MongoDB client, with a connection pool for operation nodes.

### Simple Connection URI

-   **Protocol** - `mongodb` or `mongodb+srv`

-   **Hostname** - Hostname / IP to connect to MongoDB

-   **Port** - Optional port number. In most cases `27017`.

### Advanced Connection URI

-   **URI** - Define your own connection string in URI format.
    [Read the docs: Connection String in URI Format](https://docs.mongodb.com/manual/reference/connection-string/)

### Authentication (optional)

-   **Username** - Username for authentication.

-   **Password** - Password for authentication.

-   **AuthMech** - Specify the authentication mechanism that MongoDB will use to authenticate the connection. This will only be used in combination with username and password.

-   **AuthSource** - Specify the database name associated with the user’s credentials.

### Application

-   **Database** - A MongoDB database name is required.

-   **Application Name** - The name of the application that created this MongoClient instance. MongoDB 3.4 and newer will print this value in the server log upon establishing each connection. It is also recorded in the slow query log and profile collections.

If this field is unspecified, the client node will create a app name for you.
That looks like this: `nodered-azmr5z97`. The prefix `nodered` is static. `azmr5z97` is a random connection pool id, created on runtime start-up, config-node update and full deployment.

The current app name of a config node is logged to the node-red runtime log.

Check the current db connections with this query:

```js
db.currentOp(true).inprog.reduce((accumulator, connection) => {
    const appName = connection.appName || "unknown";
    accumulator[appName] = (accumulator[appName] || 0) + 1;
    accumulator.totalCount ++;
    return accumulator;
  }, {totalCount: 0})
```

### TLS (optional)

-   **TLS CA File (path)** - Specifies the location of a local .pem file that contains the root certificate chain from the Certificate Authority. This file is used to validate the certificate presented by the mongod/mongos instance.

-   **TLS Certificate Key File (path)** - Specifies the location of a local .pem file that contains either the client's TLS/SSL certificate and key or only the client's TLS/SSL key when tlsCertificateFile is used to provide the certificate.

-   **TLS Certificate Key Filepassword (string)** - Specifies the password to de-crypt the TLS certificate.

-   **TLS-Insecure** - Disables various certificate validations. THIS IS REALLY NOT SECURE.

### Connect Options

-   **ConnectTimeoutMS** - Specifies the amount of time, in milliseconds, to wait to establish a single TCP socket connection to the server before raising an error.

-   **SocketTimeoutMS** - To make sure that the driver correctly closes the socket in these cases, set the SocketTimeoutMS option. When a MongoDB process times out, the driver will close the socket. We recommend that you select a value for socketTimeoutMS that is two to three times as long as the expected duration of the slowest operation that your application executes.

If you set the value of ConnectTimeoutMS or SocketTimeoutMS to 0, your application will use the operating system's default socket timeout value.

-   **MinPoolSize / MaxPoolsize** - Specifies the minimun and maximum number of connections the driver should create in its connection pool. This count includes connections in use.

-   **MaxIdleTimeMS** - Specifies the amount of time, in milliseconds, a connection can be idle before it's closed. Specifying 0 means no minimum.

### More Options

-   **Options (JSON)** - MongoDB Driver 4 MongoClient supports more options. Feel free to overwrite all client options with your own.
    [Read the docs: MongoClientOptions](https://mongodb.github.io/node-mongodb-native/6.12/interfaces/MongoClientOptions.html)

### Connection Pools

Each configuration node has his own connection pool with a default max poolsize of 100 connection at a given time. More parallel connections / operations will be queued and processed synchronous. In this scenario slow operations will delay fast operations. You can create more separat connection pools with more configuration nodes. [More Information](https://docs.mongodb.com/drivers/node/current/faq/#how-can-i-prevent-a-slow-operation-from-delaying-other-operations-)

## The Flow Node

Execute MongoDB collection operations with this node.

### Inputs / Options

-   **Connection (mongodb-client)** - Select a MongoDB database server connection.

-   **Mode | msg.mode (string)** - Decide if you want to run a collection or db operation {'collection', 'db'}

-   **Collection | msg.collection (string)** - MongoDB database collection.

-   **Operation | msg.operation (string)** - Run a collection or database operation.

Common collection operations are `find`, `findOne`, `insertOne`, `insertMany`, `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, `aggregate` and more.

`insert`, `update` and `delete` are deprecated and not supported by the latest mongodb driver version. Read the [upgrade instructions](https://github.com/steineey/node-red-contrib-mongodb4#upgrade-to-package-version-v2x) for more information.

Common database operations are `command`, `ping`, `stats` and more.

-   **msg.payload (array)** - Pass the CRUD operation arguments as message payload. Message payload has to be array type to pass multiple function arguments to a driver operation.

Example `insertOne`:

```js
msg.payload = [{name: 'Anna', age: 1}];
```

Example `find`:

```js
// find query argument
const query = {
  age: 22
};
// find option argument
const options = {
  sort: {name: 1},
  projection: {name: 1},
  limit: 10,
  skip: 2
};
// payload for mongodb4 node
msg.payload = [query, options];
return msg;
```

The payload array will be passed as function arguments for the MongoDB driver collection operation
: `collection.find({age: 22}, {sort: {...}})`

Another example for an aggregation call:

```js
// aggregation pipeline
const pipeline = [{
    $sort:{age: 1}
}, {
    $project: {
        name: 1
    }
},{
    $limit: 10
}];
// optional: aggregate options
const options = {
    allowDiskUse: true
};
// payload for mongodb4 node
msg.payload = [pipeline, options];
return msg;
```

In a simple aggregation call you have an array inside array like `msg.payload = [pipeline]`. This might be confusing, but I haven't found a better solution for that.

-   **Output** - For `find` and `aggregate` operation. Choose `toArray` or `forEach` output type.

-   **MaxTimeMS** - MaxTimeMS Specifies the maximum amount of time the server should wait for an operation to complete after it has reached the server. If an operation runs over the specified time limit, it returns a timeout error. Prevent long-running operations from slowing down the server by specifying a timeout value. Specifying 0 means no timeout.

-   **Handle document \_id (deprecated)** - With this feature enabled, the operation node will search for \_id fields of type string to convert them into document \_id of type ObjectId. Be aware that not every _id field has to be a ObjectId field. Use this feature only if necessary. A better solution is to use  explicit BSON types in your query (Read: How to use BSON Types).

The default MongoDB document identifier has to be of type ObjectId. This means the native driver expects query arguments like: `msg.payload = [{_id: new ObjectId("624b527d08e23628e99eb963")}]`

This mongodb node can handle this for you. If the string is a valid ObjectId, it will be translated into a real ObjectId before executed by the native driver.
So this will work:
`msg.payload = [{_id: "624b527d08e23628e99eb963"}]`
...and this will also work:
`msg.payload = [{_id: {$in: ["624b527d08e23628e99eb963"]}}]`

### More information about collection operations

[Collection-API v6.12](https://mongodb.github.io/node-mongodb-native/6.12/classes/Collection.html)

### Payload Output

The node will output the database driver response as message payload.
The operations `aggregate` and `find` can output with `toArray` or `forEach`.

### How to use BSON data types with this Node

You can use BSON types with this node.

First enable "mongodb" in your function global context. Add this to your `settings.js` file - typically this file located in `~/.node-red`:
```js
functionGlobalContext: {
    mongodb: require("node-red-contrib-mongodb4/node_modules/mongodb")
},
```
This kind of require statement ensures that we use the BSON types from the mongodb driver used in this node. Otherwise we could run into compatibilty issues.

You can now use BSON types in your function node like so:
```js
// get BSON types
const {ObjectId, Double, Timestamp} = global.get("mongodb");
// write your query
msg.payload = [{
    _id: new ObjectId() , 
    value: new Double(1.4), 
    ts: new Timestamp()
}];
// send them to the mongodb node
return msg;
```

### Node Status 

Node status information is displayed below the node:

#### Tags
- **s** : Number of successful executions
- **err** : Number of failed executions 
- **rt** : Last execution runtime in ms 

#### Colors
- **green** : Last execution was successful 
- **blue** : Node execution in progress 
- **red** : Last execution failed

### More general driver information

[Visit the MongoDB Driver Docs](https://www.mongodb.com/docs/drivers/node/current/)
