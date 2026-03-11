FROM mongo:8

COPY ingredientlist.json /ingredientlist.json
COPY recipelist.json /recipelist.json
COPY users.json /users.json

CMD mongoimport --host fotg-db --username $DB_USERNAME --password $DB_PASSWORD --authenticationDatabase admin --db $DB_NAME --collection ingredientlist --type json --drop --file /ingredientlist.json && \
    mongoimport --host fotg-db --username $DB_USERNAME --password $DB_PASSWORD --authenticationDatabase admin --db $DB_NAME --collection recipelist --type json --jsonArray --drop --file /recipelist.json && \
    mongoimport --host fotg-db --username $DB_USERNAME --password $DB_PASSWORD --authenticationDatabase admin --db $DB_NAME --collection users --type json --drop --file /users.json