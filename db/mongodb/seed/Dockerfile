FROM mongo

COPY ingredientlist.json /ingredientlist.json
COPY recipelist.json /recipelist.json
COPY users.json /users.json

CMD mongoimport --host fotg-db --db foodofthegods-api --collection ingredientlist --type json --drop --file /ingredientlist.json && \
    mongoimport --host fotg-db --db foodofthegods-api --collection recipelist --type json --drop --file /recipelist.json && \
    mongoimport --host fotg-db --db foodofthegods-api --collection users --type json --drop --file /users.json