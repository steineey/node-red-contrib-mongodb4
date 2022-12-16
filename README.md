# node-red-contrib-mongodb4
A MongoDB node for Node-Red without limitations.

This package includes two nodes for node-red:

**The Config Node** \
Connect to your local MongoDB Server or a MongoDB Atlas cluster.
![client-node](https://raw.githubusercontent.com/steineey/node-red-contrib-mongodb4/master/examples/config-node.png)

**The Flow Node** \
Execute a database or collection operation within your flow. This node was developed to use all the features of the native MongoDB driver without any limitations.
![basic-flow](https://raw.githubusercontent.com/steineey/node-red-contrib-mongodb4/master/examples/basic-flow.png)
![flow-node](https://raw.githubusercontent.com/steineey/node-red-contrib-mongodb4/master/examples/operation-node.png)

*This node was inspired by other projects like [node-red-contrib-mongodb3](https://github.com/ozomer/node-red-contrib-mongodb2) or [node-red-node-mongodb](https://flows.nodered.org/node/node-red-node-mongodb).*

## Compatibility
This MongoDB Node is compatible with the following MongoDB Server versions:
6.0, 5.0, 4.4, 4.2, 4.0, 3.6

You will also need a node-red version with NodeJS >= v12.

## Installation
Navigate to your .node-red directory - typically `~/.node-red`.

```
  npm install --save node-red-contrib-mongodb4
```

## Usage Example
Import the example flow to get a quick introduction how to use this node. \
[flow.json](https://raw.githubusercontent.com/steineey/node-red-contrib-mongodb4/master/examples/example-1.json) \
\
![flow-image](https://raw.githubusercontent.com/steineey/node-red-contrib-mongodb4/master/examples/example-1-flow.png)


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

### TLS (optional)

: TLS CA File (path) : Specifies the location of a local .pem file that contains the root certificate chain from the Certificate Authority. This file is used to validate the certificate presented by the mongod/mongos instance.

: TLS Certificate Key File (path) : Specifies the location of a local .pem file that contains either the client's TLS/SSL certificate and key or only the client's TLS/SSL key when tlsCertificateFile is used to provide the certificate.

: TLS Certificate Key Filepassword (string) : Specifies the password to de-crypt the TLS certificate.

: TLS-Insecure (bool) : Disables various certificate validations. THIS IS REALLY NOT SECURE.

### More Options

: Options (JSON) : MongoDB Driver 4 MongoClient supports more options. Feel free to overwrite all client options with your own.
[Read the docs: MongoClientOptions](https://mongodb.github.io/node-mongodb-native/4.2/interfaces/MongoClientOptions.html)

### Database

: Database (string) : A MongoDB database name is required.

### Connection Pools
Each configuration node has his own connection pool with a default max poolsize of 100 connection at a given time. More parallel connections / operations will be queued and processed synchronous. In this scenario slow operations will delay fast operations. You can create more separat connection pools with more configuration nodes. [More Information](https://docs.mongodb.com/drivers/node/current/faq/#how-can-i-prevent-a-slow-operation-from-delaying-other-operations-)


## The Flow Node

Execute MongoDB collection operations with this node.

### Inputs / Options

: Connection (mongodb-client) : Select a MongoDB database server connection.

: Mode | msg.mode (string) : Decide if you want to run a collection or db operation {'collection', 'db'}

: Collection | msg.collection (string) : MongoDB database collection.

: Operation | msg.operation (string) : Run a collection or database operation. 
Examples for collection operation are CRUD like `find`, `findOne`, `insertOne`, `updateOne`, `aggregate` and many more. 
Valid database operations are `command`, `ping`, `stats` and more.

: msg.payload (array) : Pass the CRUD operation arguments as message payload. Message payload has to be array type to pass multiple function arguments to driver operation.
Example: `msg.payload = [{name: 'marina'},{fields: {...}}]`. The payload array will be passed as function arguments for the MongoDB driver collection operation, like so: `collection.find({name: 'marina'}, {fields: {...}})`

: Output (string) : For `find` and `aggregate` operation. Choose `toArray` or `forEach` output type.

: handle document _id (bool) : With this feature enabled, the operation node will convert a document _id of type string to a document _id of type ObjectId.

The default MongoDB document identifier has to be of type ObjectId. This means the native driver expects query arguments like: `msg.payload = [{_id: ObjectId("624b527d08e23628e99eb963")}]`

This mongodb node can handle this for you. If the string is a valid ObjectId, it will be translated into a real ObjectId before executed by the native driver.
So this will work:
`msg.payload = [{_id: "624b527d08e23628e99eb963"}]`
...and this will also work:
`msg.payload = [{_id: {$in: ["624b527d08e23628e99eb963"]}}]`

### More information about collection operations
More information here:
[Collection-API](https://mongodb.github.io/node-mongodb-native/4.2/classes/Collection.html)

### Payload input

Pass the CRUD operation arguments as message payload.
Message payload has to be array type to pass multiple function arguments to driver operation.

Example to prepare a find query:
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

More information here:
[Collection-API](https://mongodb.github.io/node-mongodb-native/4.2/classes/Collection.html)

### Payload Output

The node will output the database driver response as message payload.
The operations `aggregate` and `find` can output with `toArray` or `forEach`.

### More information

[Visit the MongoDB Driver 4 Docs](https://docs.mongodb.com/drivers/node/current/)