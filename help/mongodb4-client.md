Configuration node for MongoDB connection config.
This node will create a MongoDB client, with a connection pool for operation nodes.

### Options
#### Protocol
`mongodb` or `mongodb+srv`

#### Hostname
Hostname / IP to connect to MongoDB

#### Port
Default port is 27017.

#### Database
A MongoDB database name.

#### AuthSource
Specify the database name associated with the user’s credentials.

#### AuthMech
Specify the authentication mechanism that MongoDB will use to authenticate the connection.

#### TLS CA-File
Specifies the location of a local .pem file that contains the root certificate chain from the Certificate Authority. This file is used to validate the certificate presented by the mongod/mongos instance.

#### TLS-Insecure
Disables various certificate validations. THIS IS REALLY NOT SECURE.

#### Advanced Options
MongoDB Driver 4 MongoClient supports more options. Feel free to overwrite all client options with your own JSON-Config-String.
[MongoClientOptions](https://mongodb.github.io/node-mongodb-native/4.2/interfaces/MongoClientOptions.html)

### Connection Pools
Each configuration node has his own connection pool with a default max poolsize of 100 connection at a given time. More parallel connections / operations will be queued and processed synchronous. In this scenario slow operations will delay fast operations. You can create more separat connection pools with more configuration nodes. [More Information](https://docs.mongodb.com/drivers/node/current/faq/#how-can-i-prevent-a-slow-operation-from-delaying-other-operations-)