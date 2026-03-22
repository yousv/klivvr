const crypto = require('crypto');
const { makeOAuth2 } = require('../../lib/sheets');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const force = req.query.force === '1';
  const state = crypto.randomBytes(16).toString('hex');
  const auth  = makeOAuth2();
  const url   = auth.generateAuthUrl({
    access_type: 'offline',
    prompt:      force ? 'consent' : 'consent',
    scope:       ['https://www.googleapis.com/auth/spreadsheets'],
    state,
  });

  res.setHeader('Set-Cookie', `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  res.redirect(302, url);
};
