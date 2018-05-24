db = db.getSiblingDB('foodofthegods-api');
print('selecting db: foodofthegods-api');

db.users.insertOne({"username" : username, "password" : password, "timestamp" : timestamp});
print('user inserted!');

