const crypto = require('crypto');
const { makeOAuth2 } = require('../../lib/sheets');
const { setSession } = require('../../lib/session');

function verifyState(signed) {
  const dot = signed.lastIndexOf('.');
  if (dot < 0) return false;
  const state = signed.slice(0, dot);
  const sig   = signed.slice(dot + 1);
  const expected = crypto.createHmac('sha256', process.env.COOKIE_SECRET || 'dev-secret')
    .update(state).digest('hex').slice(0, 16);
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { code, state, error } = req.query;

  if (error)              return res.redirect(302, `/?auth_error=google:${error}`);
  if (!code)              return res.redirect(302, '/?auth_error=no_code');
  if (!state)             return res.redirect(302, '/?auth_error=no_state');
  if (!verifyState(state)) return res.redirect(302, '/?auth_error=invalid_state');

  try {
    const auth = makeOAuth2();
    const { tokens } = await auth.getToken(code);
    if (!tokens.refresh_token) return res.redirect(302, '/api/auth/login');
    setSession(res, {
      accessToken:  tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt:    tokens.expiry_date,
    });
    res.redirect(302, '/');
  } catch (e) {
    console.error('OAuth callback error:', e.message);
    res.redirect(302, `/?auth_error=token`);
  }
};

