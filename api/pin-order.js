const { google } = require('googleapis');
const { getSession } = require('../lib/session');
const { getClient } = require('../lib/sheets');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GID = 1723849469;
const PIN_ORDER_COL = 5; // Column E (after the main 4 columns)

module.exports = async function handler(req, res) {
  getSession(req);
  const auth = getClient(req, res);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const sheets = google.sheets({ version: 'v4', auth });

  try {
    if (req.method === 'PUT') {
      const { pinnedIds, sheetName } = req.body;
      if (!Array.isArray(pinnedIds) || !sheetName) {
        return res.status(400).json({ error: 'Invalid body' });
      }

      // Store pinned order as JSON string in column E (or next available after data columns)
      const pinOrderJson = JSON.stringify(pinnedIds);
      
      // Update a metadata row (row 1 can store this) or create a special row
      // For now, we'll store it in the first row's extra column
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!E1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[pinOrderJson]],
        },
      });

      return res.json({ ok: true });
    }

    if (req.method === 'GET') {
      const { sheetName } = req.query;
      if (!sheetName) {
        return res.status(400).json({ error: 'Invalid query' });
      }

      // Retrieve pinned order from column E row 1
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!E1`,
      });

      const pinnedJson = result.data.values?.[0]?.[0];
      let pinnedIds = [];

      if (pinnedJson) {
        try {
          pinnedIds = JSON.parse(pinnedJson);
        } catch {
          pinnedIds = [];
        }
      }

      return res.json({ pinnedIds });
    }

    res.status(405).end();
  } catch (e) {
    console.error('pin-order error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
