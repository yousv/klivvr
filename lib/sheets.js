const { google } = require('googleapis');
const { getSession } = require('../lib/session');
const { getClient } = require('../lib/sheets');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GID      = 1723849469;

module.exports = async function handler(req, res) {
  getSession(req);
  const auth = getClient(req, res);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const sheets = google.sheets({ version: 'v4', auth });

  try {
    if (req.method === 'POST') {
      const { sheetName, values, rgb } = req.body;
      if (!Array.isArray(values) || !sheetName || typeof sheetName !== 'string') return res.status(400).json({ error: 'Invalid body' });
      if (values.length > 20) return res.status(400).json({ error: 'Too many values' });
      const safeVals = values.map(v => String(v ?? '').slice(0, 2000));

      const result = await sheets.spreadsheets.values.append({
        spreadsheetId:   SHEET_ID,
        range:           sheetName,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody:     { values: [safeVals] },
      });

      const m        = (result.data.updates?.updatedRange || '').match(/(\d+)$/);
      const sheetRow = m ? +m[1] : null;
      if (sheetRow && rgb) await setBg(sheets, sheetRow, rgb);

      return res.json({ ok: true, sheetRow });
    }

    if (req.method === 'PATCH') {
      const { sheetName, sheetRow, values, rgb, catChanged } = req.body;
      if (!sheetRow || !Array.isArray(values) || typeof sheetRow !== 'number') return res.status(400).json({ error: 'Invalid body' });
      const safeVals = values.map(v => String(v ?? '').slice(0, 2000));

      await sheets.spreadsheets.values.update({
        spreadsheetId:    SHEET_ID,
        range:            `${sheetName}!A${sheetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody:      { values: [safeVals] },
      });

      if (catChanged && rgb) await setBg(sheets, sheetRow, rgb);
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { sheetRow } = req.body;
      if (!sheetRow) return res.status(400).json({ error: 'Invalid body' });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody:   { requests: [{ deleteDimension: {
          range: { sheetId: GID, dimension: 'ROWS', startIndex: sheetRow - 1, endIndex: sheetRow },
        }}]},
      });

      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    console.error('rows error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

async function setBg(sheets, sheetRow, rgb) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody:   { requests: [{ repeatCell: {
      range: { sheetId: GID, startRowIndex: sheetRow-1, endRowIndex: sheetRow, startColumnIndex: 0, endColumnIndex: 1 },
      cell:  { userEnteredFormat: { backgroundColor: { red: rgb[0]/255, green: rgb[1]/255, blue: rgb[2]/255 } } },
      fields: 'userEnteredFormat.backgroundColor',
    }}]},
  });
}
