const { google } = require('googleapis');
const { getSession } = require('../lib/session');
const { getClient } = require('../lib/sheets');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GID      = 1723849469;
const PIN_COL  = 4; // 0-indexed column E — pin order, immediately after English field

// 0-indexed column number → A1 letter notation
const colLetter = n => {
  let s = '';
  for (let x = n; x >= 0; x = Math.floor(x / 26) - 1) s = String.fromCharCode(65 + (x % 26)) + s;
  return s;
};
const PIN_COL_LETTER = colLetter(PIN_COL); // 'E'

module.exports = async function handler(req, res) {
  getSession(req);
  const auth = getClient(req, res);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const sheets = google.sheets({ version: 'v4', auth });

  try {
    // ── POST: append a new row ────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { sheetName, values, rgb } = req.body;
      if (!Array.isArray(values) || !sheetName) return res.status(400).json({ error: 'Invalid body' });

      const result = await sheets.spreadsheets.values.append({
        spreadsheetId:    SHEET_ID,
        range:            sheetName,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody:      { values: [values] },
      });

      const m        = (result.data.updates?.updatedRange || '').match(/(\d+)$/);
      const sheetRow = m ? +m[1] : null;
      if (sheetRow && rgb) await setBg(sheets, sheetRow, rgb);

      return res.json({ ok: true, sheetRow });
    }

    // ── PATCH: update a row (full update or pin-only) ─────────────────────────
    if (req.method === 'PATCH') {
      const { sheetName, sheetRow, values, rgb, catChanged, pinOrder, pinOnly } = req.body;
      if (!sheetRow) return res.status(400).json({ error: 'Invalid body' });

      if (pinOnly) {
        await sheets.spreadsheets.values.update({
          spreadsheetId:    SHEET_ID,
          range:            `${sheetName}!${PIN_COL_LETTER}${sheetRow}`,
          valueInputOption: 'RAW',
          requestBody:      { values: [[pinOrder == null ? '' : String(pinOrder)]] },
        });
        return res.json({ ok: true });
      }

      if (!Array.isArray(values)) return res.status(400).json({ error: 'Invalid body' });

      await sheets.spreadsheets.values.update({
        spreadsheetId:    SHEET_ID,
        range:            `${sheetName}!A${sheetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody:      { values: [values] },
      });

      if (catChanged && rgb) await setBg(sheets, sheetRow, rgb);
      return res.json({ ok: true });
    }

    // ── PUT: batch-update pin order for multiple rows ─────────────────────────
    if (req.method === 'PUT') {
      const { sheetName, pinUpdates } = req.body;
      if (!Array.isArray(pinUpdates) || !sheetName) return res.status(400).json({ error: 'Invalid body' });

      const data = pinUpdates.map(({ sheetRow, pinOrder }) => ({
        range:  `${sheetName}!${PIN_COL_LETTER}${sheetRow}`,
        values: [[pinOrder == null ? '' : String(pinOrder)]],
      }));

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody:   { valueInputOption: 'RAW', data },
      });

      return res.json({ ok: true });
    }

    // ── DELETE: remove a row ──────────────────────────────────────────────────
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
      range:  { sheetId: GID, startRowIndex: sheetRow - 1, endRowIndex: sheetRow, startColumnIndex: 0, endColumnIndex: 1 },
      cell:   { userEnteredFormat: { backgroundColor: { red: rgb[0] / 255, green: rgb[1] / 255, blue: rgb[2] / 255 } } },
      fields: 'userEnteredFormat.backgroundColor',
    }}]},
  });
}
