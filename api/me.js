const { getClient } = require('../lib/sheets');
const { clearSession } = require('../lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const auth = await getClient(req, res);
  if (!auth) {
    clearSession(res);
    return res.json({ loggedIn: false });
  }
  res.json({ loggedIn: true });
};
