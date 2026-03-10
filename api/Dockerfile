FROM node:22.22.1

ARG START_CMD
ENV START_CMD=${START_CMD}

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
# If you are building your code for production
# RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["sh", "-c", "npm run ${START_CMD}" ]
