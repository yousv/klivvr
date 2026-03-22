const crypto = require('crypto');
const { makeOAuth2 } = require('../../lib/sheets');

function signState(state) {
  const sig = crypto.createHmac('sha256', process.env.COOKIE_SECRET || 'dev-secret')
    .update(state).digest('hex').slice(0, 16);
  return `${state}.${sig}`;
}

function verifyState(signed) {
  const dot = signed.lastIndexOf('.');
  if (dot < 0) return false;
  const state = signed.slice(0, dot);
  return signState(state) === signed;
}

module.exports = function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const state = signState(crypto.randomBytes(16).toString('hex'));
  const auth  = makeOAuth2();
  const url   = auth.generateAuthUrl({
    access_type: 'offline',
    prompt:      'consent',
    scope:       ['https://www.googleapis.com/auth/spreadsheets'],
    state,
  });
  res.redirect(302, url);
};

