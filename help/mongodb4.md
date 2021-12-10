Execute MongoDB collection operations with this node.

### Inputs / Options

: Connection (mongodb-client) : Select a MongoDB database server connection.

: Collection | msg.collection (string) : MongoDB database collection.

: Operation | msg.operation (string) : A MongoDB Driver 4 collection CRUD operation for example `find`, `findOne`, `insertOne`, `updateOne`, `aggregate` and many more. 

: msg.payload (array) : Pass the CRUD operation arguments as message payload. Message payload has to be array type to pass multiple function arguments to driver operation. 
Example: `msg.payload = [{_id: '123'},{fields: {...}}]`. The payload array will be passed as function arguments for the MongoDB driver collection operation, like so: `collection.find({_id: '123'}, {fields: {...}})`

: Output : For `find` and `aggregate` operation. Choose `toArray` or `forEach` output type.

More information here:
[Collection-API](https://mongodb.github.io/node-mongodb-native/4.2/classes/Collection.html)

### Output
: msg.payload (any) : The node will output the database driver response as message payload. The operations `aggregate` and `find` can output with `toArray` or `forEach`.

### More information

[Visit the MongoDB Driver 4 Docs](https://docs.mongodb.com/drivers/node/current/)