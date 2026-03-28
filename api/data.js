const { google } = require('googleapis');
const { getSession } = require('../lib/session');
const { getClient } = require('../lib/sheets');

const SHEET_ID  = process.env.GOOGLE_SHEET_ID;
const GID       = 1723849469;
const DATA_COLS = 4;   // columns displayed in the UI
const PIN_COL   = 4;   // 0-indexed column index for pin order (column E, immediately after column D)

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  getSession(req);
  const auth = getClient(req, res);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const meta   = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      includeGridData: true,
      fields: 'properties.title,sheets(properties,data(rowData(values(formattedValue,effectiveFormat(backgroundColor)))))',
    });

    const sheet   = meta.data.sheets.find(s => s.properties.sheetId === GID) || meta.data.sheets[0];
    const allRows = sheet.data?.[0]?.rowData || [];

    const headers = (allRows[0]?.values || []).slice(0, DATA_COLS).map(c => c.formattedValue || '');
    const rows    = [];

    for (let i = 1; i < allRows.length; i++) {
      const cells  = allRows[i]?.values || [];
      const values = headers.map((_, ci) => cells[ci]?.formattedValue || '');
      if (values.every(v => !v.trim())) continue;

      const bg = cells[0]?.effectiveFormat?.backgroundColor;
      let hex  = null;
      if (bg) {
        const r = Math.round((bg.red   || 0) * 255);
        const g = Math.round((bg.green || 0) * 255);
        const b = Math.round((bg.blue  || 0) * 255);
        if (!(r > 245 && g > 245 && b > 245)) {
          hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        }
      }

      // Read pin order from PIN_COL (column E, immediately after the English field)
      const pinRaw   = cells[PIN_COL]?.formattedValue;
      const pinOrder = (pinRaw && !isNaN(parseInt(pinRaw, 10))) ? parseInt(pinRaw, 10) : null;

      rows.push({ values, hex, sheetRow: i + 1, pinOrder });
    }

    res.json({ title: meta.data.properties.title, sheetName: sheet.properties.title, headers, rows });
  } catch (e) {
    console.error('data error:', e.message);
    const status = e.code === 401 ? 401 : 500;
    res.status(status).json({ error: e.message });
  }
};
