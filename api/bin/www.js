#!/usr/bin/env node

import app from "../src/fotg.js";
import debugLib from "debug";
import https from "https";
import http from "http";
import fs from "fs";

const debug = debugLib("foodofthegods-api:server");
const ENV_PROD = "production";
const env = process.env.NODE_ENV;
const port = normalizePort(process.env.PORT);

app.set("port", port);

let server;

if (env === ENV_PROD) {
  const key = fs.readFileSync("/etc/letsencrypt/live/theunderempire.com/privkey.pem");
  const cert = fs.readFileSync("/etc/letsencrypt/live/theunderempire.com/fullchain.pem");
  server = https.createServer({ key, cert }, app);
} else {
  server = http.createServer({}, app);
}

server.listen(port);
server.on("error", onError);
server.on("listening", onListening);

function normalizePort(val) {
  const port = parseInt(val, 10);
  if (isNaN(port)) return val;
  if (port >= 0) return port;
  return false;
}

function onError(error) {
  if (error.syscall !== "listen") throw error;
  const bind = typeof port === "string" ? "Pipe " + port : "Port " + port;
  switch (error.code) {
    case "EACCES":
      console.error(bind + " requires elevated privileges");
      process.exit(1);
      break;
    case "EADDRINUSE":
      console.error(bind + " is already in use");
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function onListening() {
  const addr = server.address();
  const bind = typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
  debug("Listening on " + bind);
}
