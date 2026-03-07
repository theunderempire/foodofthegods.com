#!/bin/sh

if [ -z "$1" ] || [ -z "$2" ];
then
    echo "Vars are unset! Need username and password"
else
    HASHED=$(node -e "import bcrypt from 'bcrypt'; bcrypt.hash('$2', 12).then(h => process.stdout.write(h))")
    mongo --eval "var username='$1', password='$HASHED'" mongoAddUser.js
fi
