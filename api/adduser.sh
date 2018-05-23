#!/bin/sh

if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ];
then
    echo "Vars are unset! Need username, password, and timestamp"
else
    mongo --eval "var username='$1', password='$2', timestamp='$3'" addUser.js
fi
