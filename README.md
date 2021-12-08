# node-red-contrib-mongodb4
A simple Mongodb wrapper for Node-Red powered by Mongodb NodeJS driver 4.

This packages includes two nodes for node-red:
* A configuration node which defines a connection to a MongoDB database server
* A flow node to execute every MongoDB collection operation supported by MongoDB NodeJS driver 4.

## Configuration Node

A wrapper node for MongoClient.
[Connection Fundamentals](https://docs.mongodb.com/drivers/node/current/fundamentals/connection/)

More explanation here:
[Connection Options](https://mongodb.github.io/node-mongodb-native/4.2/interfaces/MongoClientOptions.html)

## Operation Node

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

This package is a beta version. Please feel free to report any issues.
