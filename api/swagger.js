import swaggerAutogen from "swagger-autogen";

const doc = {
  info: {
    title: "Food of the Gods API",
    description: "REST API for the Food of the Gods recipe app",
    version: "1.0.0",
  },
  host: "localhost:3000",
  securityDefinitions: {
    bearerAuth: {
      type: "apiKey",
      in: "header",
      name: "X-Access-Token",
    },
  },
};

const outputFile = "./swagger_output.json";
const routes = ["./src/fotg.js"];

swaggerAutogen({ openapi: "3.0.0" })(outputFile, routes, doc);
