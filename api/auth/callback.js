const { makeOAuth2 } = require('../../lib/sheets');
const { setSession, parseCookies } = require('../../lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { code, state, error } = req.query;
  const cookies = parseCookies(req);
  const savedState = cookies.oauth_state;

  if (error)       return res.redirect(302, `/?auth_error=google:${error}`);
  if (!code)       return res.redirect(302, '/?auth_error=no_code');
  if (!state)      return res.redirect(302, '/?auth_error=no_state');
  if (!savedState) return res.redirect(302, '/?auth_error=no_cookie');
  if (state !== savedState) return res.redirect(302, '/?auth_error=state_mismatch');

  try {
    const auth = makeOAuth2();
    const { tokens } = await auth.getToken(code);

    if (!tokens.refresh_token) {
      return res.redirect(302, '/api/auth/login?force=1');
    }

    setSession(res, {
      accessToken:  tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt:    tokens.expiry_date,
    });

    const current = res.getHeader('Set-Cookie');
    const clear   = 'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
    res.setHeader('Set-Cookie', Array.isArray(current) ? [...current, clear] : [current, clear]);

    res.redirect(302, '/');
  } catch (e) {
    console.error('OAuth callback error:', e.message);
    res.redirect(302, `/?auth_error=token:${encodeURIComponent(e.message)}`);
  }
};
