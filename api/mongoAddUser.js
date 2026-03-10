db = db.getSiblingDB(process.env.DB_SERVICE_NAME);
print(`selecting db: ${process.env.DB_SERVICE_NAME}`);

db.users.insertOne({
  username: username,
  password: password,
});
print("user inserted!");
