import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import RequestService from '../../src/services/request.service.js';
import { makeRes, makeReq } from '../helpers/mocks.js';

const service = new RequestService();

describe('RequestService', () => {
  describe('checkUser', () => {
    test('returns true when id matches decoded username', () => {
      const req = makeReq({ username: 'user-abc' });
      assert.equal(service.checkUser(req, 'user-abc'), true);
    });

    test('returns false when id does not match decoded username', () => {
      const req = makeReq({ username: 'user-abc' });
      assert.equal(service.checkUser(req, 'user-xyz'), false);
    });

    test('returns false when id is undefined', () => {
      const req = makeReq({ username: 'user-abc' });
      assert.equal(service.checkUser(req, undefined), false);
    });
  });

  describe('returnUnauthorized', () => {
    test('sets status 401 and returns success: false', () => {
      const res = makeRes();
      service.returnUnauthorized(res);
      assert.equal(res._status, 401);
      assert.equal(res._body.success, false);
    });
  });

  describe('printMsg', () => {
    test('returns success response when err is null', () => {
      const res = makeRes();
      service.printMsg(res, null, 'recipe added');
      assert.equal(res._body.success, true);
      assert.equal(res._body.data.msg, 'recipe added');
    });

    test('includes "error" in the message when err is present', () => {
      const res = makeRes();
      service.printMsg(res, new Error('db failure'), 'recipe added');
      assert.equal(res._body.success, true);
      assert.match(res._body.data.msg, /error/);
    });
  });
});
