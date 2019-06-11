const httpMocks = require('node-mocks-http');
import {
  fakeResponse,
  readRes,
  fireResponse,
  nextToPromise,
  Resp,
} from './adapter';
import { sleep } from './util';
const emptyPromise = require('empty-promise');

describe('fakeResponse', () => {
  const req = httpMocks.createRequest();

  it('captures status code', () => {
    const res = fakeResponse(req);
    res.sendStatus(401);
    const resp = readRes(res);
    expect(resp.status_code).toBe(401);
  });

  it('captures headers explicitly set', () => {
    const res = fakeResponse(req);
    res.setHeader('X-This-Is-A-Test', 'bologna-socks');
    res.send({});
    const resp = readRes(res);
    expect(resp.headers['x-this-is-a-test']).toBe('bologna-socks');
  });

  it('captures the application/json header set via .json', () => {
    const res = fakeResponse(req);
    res.json({ msg: 'asdf' });
    const resp = readRes(res);
    expect(resp.headers['content-type']).toBe('application/json');
  });

  it('emits an "end" event', () => {
    const ended = emptyPromise();
    const res = fakeResponse(req);
    res.on('end', () => ended.resolve());
    res.status(200);
    expect(ended.done()).toBe(false);
    res.json({ msg: 'should end' });
    expect(ended).resolves.toBeUndefined();
  });

  it('captures headers even without an end', async () => {
    const ended = emptyPromise();
    const res = fakeResponse(req);
    res.on('end', () => ended.resolve());
    res.setHeader('middleware-was-here', 'but-didnt-end-the-res');
    await sleep(0);
    expect(ended.done()).toBe(false);
    const resp = readRes(res);
    expect(resp.headers['middleware-was-here']).toBe('but-didnt-end-the-res');
  });
});

describe('fireResponse', () => {
  const req = httpMocks.createRequest();
  const res = fakeResponse(req);
  const resp: Resp = {
    status_code: 401,
    body: 'one potato two potato three potato four',
    headers: {
      'x-test-header':
        'this has been a test of the header reporting system. There is no emergency at this time',
    },
  };
  fireResponse(resp, res);

  it('emits the correct status code', () => {
    expect(res._getStatusCode()).toBe(401);
  });

  it('includes the body', () => {
    expect(res._getData()).toEqual(resp.body);
  });

  it('sets headers correctly', () => {
    expect(res._getHeaders()).toEqual(resp.headers);
  });
});

describe('nextToPromise', () => {
  it('resolves on call', () => {
    const { next, p } = nextToPromise();
    next();
    expect(p).resolves.toBeFalsy();
  });

  it('rejects on call with argument', () => {
    const { next, p } = nextToPromise();
    next('error');
    expect(p).rejects.toBe('error');
  });
});
