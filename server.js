const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Load local Node.js compliant modules
const FormulaEngine = require('./js/formula-engine.js');
require('./js/stat-functions.js'); // registers functions with FormulaEngine
const ExcelExport = require('./js/excel-export.js');

// Helper to mock Vercel req/res for serverless functions
function runVercelHandler(handlerPath) {
  return (req, res) => {
    // Require handler directly
    const handler = require(handlerPath);
    
    // Add Vercel helper properties if missing
    if (!res.status) {
      res.status = (statusCode) => {
        res.statusCode = statusCode;
        return res;
      };
    }
    if (!res.json) {
      res.json = (data) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      };
    }
    
    handler(req, res);
  };
}

// Mount existing API routes
app.get('/api/config', runVercelHandler('./api/config.js'));
app.post('/api/generate-sheet', runVercelHandler('./api/generate-sheet.js'));
app.post('/api/parse-document', runVercelHandler('./api/parse-document.js'));
app.post('/api/proxy', runVercelHandler('./api/proxy.js'));
app.post('/api/research', runVercelHandler('./api/research.js'));

// Mount NEW compute routes
app.post('/api/evaluate', (req, res) => {
  try {
    const { sheets, activeSheetId } = req.body;
    if (!sheets) {
      return res.status(400).json({ error: 'sheets payload is required' });
    }
    
    // Run evaluation
    const updatedSheets = FormulaEngine.evaluateSheet(sheets, activeSheetId);
    res.status(200).json({ sheets: updatedSheets });
  } catch (err) {
    res.status(500).json({ error: 'Evaluation failed: ' + err.message });
  }
});

app.post('/api/export', async (req, res) => {
  try {
    const spreadsheetState = req.body;
    if (!spreadsheetState || !spreadsheetState.sheets) {
      return res.status(400).json({ error: 'Spreadsheet state is required' });
    }

    // Call exportToExcel
    const workbook = await ExcelExport.exportToExcel(spreadsheetState);
    
    // Set headers for download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(spreadsheetState.title || 'Spreadsheet')}.xlsx"`);
    
    // Write workbook directly to response stream
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: 'Export failed: ' + err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`[INFO] Railway compute backend listening on port ${PORT}`);
});
