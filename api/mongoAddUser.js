db = db.getSiblingDB(process.env.DB_NAME);
print(`selecting db: ${process.env.DB_NAME}`);

db.users.insertOne({
  username: username,
  password: password,
});
print("user inserted!");
