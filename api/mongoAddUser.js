db = db.getSiblingDB(process.env.SERVER_SERVICE_NAME);
print(`selecting db: ${process.env.SERVER_SERVICE_NAME}`);

db.users.insertOne({"username" : username, "password" : password, "timestamp" : timestamp});
print('user inserted!');

