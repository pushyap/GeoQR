const request = require('supertest');

// Mocks must be set before requiring the app
jest.mock('../middleware/auth', () => ({
  authenticate: (req, res, next) => {
    // Attach a test user
    req.user = { id: 1 };
    next();
  }
}));

jest.mock('../config/database', () => ({
  db: {
    query: jest.fn()
  }
}));

jest.mock('../config/redis', () => ({
  setCache: jest.fn(() => Promise.resolve(true)),
  getCache: jest.fn(() => Promise.resolve(null)),
  deleteCache: jest.fn(() => Promise.resolve(true))
}));

jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: jest.fn(() => Promise.resolve({
    challenge: 'test-challenge',
    rp: { id: 'localhost', name: 'GeoQR' },
    user: { id: '1', name: 'test@example.com', displayName: 'Test User' }
  })),
  verifyRegistrationResponse: jest.fn(() => Promise.resolve({ verified: true, registrationInfo: { credential: { id: 'cred-id', publicKey: new Uint8Array([1,2,3]), counter: 0 }, credentialBackedUp: false } }))
}));

const app = require('../server');
const { db } = require('../config/database');
const { setCache, getCache, deleteCache } = require('../config/redis');
const { generateRegistrationOptions, verifyRegistrationResponse } = require('@simplewebauthn/server');

describe('WebAuthn Registration Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /api/webauthn/register/options returns options and stores challenge', async () => {
    // Mock DB user lookup
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, email: 'test@example.com', name: 'Test User' }] });
    db.query.mockResolvedValueOnce({ rows: [] }); // no credentials

    const res = await request(app)
      .post('/api/webauthn/register/options')
      .set('Authorization', 'Bearer faketoken')
      .send();

    expect(res.statusCode).toBe(200);
    expect(res.body.challenge).toBeDefined();
    expect(setCache).toHaveBeenCalledWith('webauthn:register:1', expect.any(Object), expect.any(Number));
    expect(generateRegistrationOptions).toHaveBeenCalled();
  });

  test('POST /api/webauthn/register/verify verifies and stores credential', async () => {
    // Mock stored challenge in cache
    getCache.mockResolvedValueOnce({ challenge: 'test-challenge' });

    // DB queries: select user, insert credential, update user
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, email: 'test@example.com', name: 'Test User' }] });
    db.query.mockResolvedValueOnce({}); // insert credential
    db.query.mockResolvedValueOnce({}); // update user

    const attestation = { response: { clientDataJSON: 'dummy' } };

    const res = await request(app)
      .post('/api/webauthn/register/verify')
      .set('Authorization', 'Bearer faketoken')
      .send(attestation);

    expect(res.statusCode).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(deleteCache).toHaveBeenCalledWith('webauthn:register:1');
    expect(db.query).toHaveBeenCalled();
    expect(verifyRegistrationResponse).toHaveBeenCalled();
  });
});
