import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MailService } from "../../src/services/mail.service.js";
import { makeRes, makeReq, makeCollection } from "../helpers/mocks.js";

function makeSendMail(impl = async () => ({ response: "250 OK" })) {
  return impl;
}

function makeTransporter(sendMail = makeSendMail()) {
  return () => ({ sendMail });
}

describe("MailService", () => {
  describe("register", () => {
    test("returns 400 when username or email is missing", async () => {
      const service = new MailService(makeTransporter());
      const res = makeRes();
      const req = makeReq({ body: { email: "user@example.com" } });

      await service.register(req, res);

      assert.equal(res._status, 400);
      assert.equal(res._body.success, false);
    });

    test("succeeds silently when username is already registered", async () => {
      const service = new MailService(makeTransporter());
      const res = makeRes();
      const req = makeReq({
        body: { username: "hash123", email: "user@example.com" },
        collections: {
          users: makeCollection({ findOne: () => Promise.resolve({ username: "hash123" }) }),
        },
      });

      await service.register(req, res);

      assert.equal(res._body.success, true);
      assert.equal(res._status, 200);
    });

    test("succeeds silently when registration is already pending", async () => {
      const service = new MailService(makeTransporter());
      const res = makeRes();
      const req = makeReq({
        body: { username: "hash123", email: "user@example.com" },
        collections: {
          users: makeCollection({ findOne: () => Promise.resolve(null) }),
          pendingUsers: makeCollection({ findOne: () => Promise.resolve({ username: "hash123" }) }),
        },
      });

      await service.register(req, res);

      assert.equal(res._body.success, true);
    });

    test("inserts pending user and sends admin email on success", async () => {
      let inserted = null;
      let sentMail = null;
      const service = new MailService(
        makeTransporter(async (opts) => {
          sentMail = opts;
          return { response: "250 OK" };
        }),
      );
      const res = makeRes();
      const req = makeReq({
        body: { username: "hash123", email: "user@example.com" },
        collections: {
          users: makeCollection({ findOne: () => Promise.resolve(null) }),
          pendingUsers: makeCollection({
            findOne: () => Promise.resolve(null),
            insert: (doc) => {
              inserted = doc;
              return Promise.resolve({ ...doc, _id: "pending-id" });
            },
          }),
        },
      });

      await service.register(req, res);

      assert.equal(res._body.success, true);
      assert.equal(inserted.username, "hash123");
      assert.equal(inserted.status, "pending_approval");
      assert.ok(inserted.approvalToken);
      assert.ok(sentMail.text.includes("user@example.com"));
      assert.ok(sentMail.text.includes("/mail/approve/"));
    });

    test("returns 500 when sendMail throws", async () => {
      const service = new MailService(
        makeTransporter(async () => {
          throw new Error("SMTP error");
        }),
      );
      const res = makeRes();
      const req = makeReq({
        body: { username: "hash123", email: "user@example.com" },
        collections: {
          users: makeCollection({ findOne: () => Promise.resolve(null) }),
          pendingUsers: makeCollection({ findOne: () => Promise.resolve(null) }),
        },
      });

      await service.register(req, res);

      assert.equal(res._status, 500);
      assert.equal(res._body.success, false);
    });
  });

  describe("approve", () => {
    test("returns 404 when token is not found", async () => {
      const service = new MailService(makeTransporter());
      const res = makeRes();
      const req = makeReq({
        params: { token: "badtoken" },
        collections: {
          pendingUsers: makeCollection({ findOne: () => Promise.resolve(null) }),
        },
      });

      await service.approve(req, res);

      assert.equal(res._status, 404);
    });

    test("returns 410 and removes record when token is expired", async () => {
      let removed = false;
      const service = new MailService(makeTransporter());
      const res = makeRes();
      const req = makeReq({
        params: { token: "expiredtoken" },
        collections: {
          pendingUsers: makeCollection({
            findOne: () =>
              Promise.resolve({
                _id: "p1",
                approvalToken: "expiredtoken",
                status: "pending_approval",
                tokenExpiry: new Date(Date.now() - 1000),
                email: "user@example.com",
              }),
            remove: () => {
              removed = true;
              return Promise.resolve();
            },
          }),
        },
      });

      await service.approve(req, res);

      assert.equal(res._status, 410);
      assert.equal(removed, true);
    });

    test("updates record and sends set-password email on success", async () => {
      let updateArgs = null;
      let sentMail = null;
      const service = new MailService(
        makeTransporter(async (opts) => {
          sentMail = opts;
          return { response: "250 OK" };
        }),
      );
      const res = makeRes();
      const req = makeReq({
        params: { token: "validtoken" },
        collections: {
          pendingUsers: makeCollection({
            findOne: () =>
              Promise.resolve({
                _id: "p1",
                approvalToken: "validtoken",
                status: "pending_approval",
                tokenExpiry: new Date(Date.now() + 86400000),
                email: "user@example.com",
              }),
            update: (_q, update) => {
              updateArgs = update;
              return Promise.resolve();
            },
          }),
        },
      });

      await service.approve(req, res);

      assert.equal(updateArgs.$set.status, "pending_password");
      assert.equal(updateArgs.$set.approvalToken, null);
      assert.ok(updateArgs.$set.setPasswordToken);
      assert.ok(sentMail.to, "user@example.com");
      assert.ok(sentMail.text.includes("/set-password?token="));
      assert.ok(typeof res._body === "string" && res._body.includes("user@example.com"));
    });
  });

  describe("setPassword", () => {
    test("returns 400 when token or password is missing", async () => {
      const service = new MailService(makeTransporter());
      const res = makeRes();
      const req = makeReq({ body: { token: "tok" } });

      await service.setPassword(req, res);

      assert.equal(res._status, 400);
      assert.equal(res._body.success, false);
    });

    test("returns 404 when token is not found", async () => {
      const service = new MailService(makeTransporter());
      const res = makeRes();
      const req = makeReq({
        body: { token: "badtoken", password: "newpassword" },
        collections: {
          pendingUsers: makeCollection({ findOne: () => Promise.resolve(null) }),
        },
      });

      await service.setPassword(req, res);

      assert.equal(res._status, 404);
      assert.equal(res._body.success, false);
    });

    test("returns 410 and removes record when token is expired", async () => {
      let removed = false;
      const service = new MailService(makeTransporter());
      const res = makeRes();
      const req = makeReq({
        body: { token: "expiredtoken", password: "newpassword" },
        collections: {
          pendingUsers: makeCollection({
            findOne: () =>
              Promise.resolve({
                _id: "p1",
                setPasswordToken: "expiredtoken",
                status: "pending_password",
                tokenExpiry: new Date(Date.now() - 1000),
              }),
            remove: () => {
              removed = true;
              return Promise.resolve();
            },
          }),
        },
      });

      await service.setPassword(req, res);

      assert.equal(res._status, 410);
      assert.equal(removed, true);
    });

    test("creates user with bcrypt password and removes pending record on success", async () => {
      let insertedUser = null;
      let removedPending = false;
      const service = new MailService(makeTransporter());
      const res = makeRes();
      const req = makeReq({
        body: { token: "validtoken", password: "mypassword123" },
        collections: {
          pendingUsers: makeCollection({
            findOne: () =>
              Promise.resolve({
                _id: "p1",
                setPasswordToken: "validtoken",
                status: "pending_password",
                tokenExpiry: new Date(Date.now() + 86400000),
                username: "hash123",
                email: "user@example.com",
              }),
            remove: () => {
              removedPending = true;
              return Promise.resolve();
            },
          }),
          users: makeCollection({
            insert: (doc) => {
              insertedUser = doc;
              return Promise.resolve({ ...doc, _id: "new-user-id" });
            },
          }),
        },
      });

      await service.setPassword(req, res);

      assert.equal(res._body.success, true);
      assert.equal(insertedUser.username, "hash123");
      assert.equal(insertedUser.email, "user@example.com");
      assert.ok(insertedUser.password.startsWith("$2b$"), "password should be bcrypt hashed");
      assert.equal(removedPending, true);
    });
  });
});
