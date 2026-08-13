import { NextRequest, NextResponse } from 'next/server';
const FormulaEngine = require('../../../js/formula-engine.js');
require('../../../js/stat-functions.js');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sheets, activeSheetId } = body;

    if (!sheets) {
      return NextResponse.json({ error: 'sheets payload is required' }, { status: 400 });
    }

    const updatedSheets = FormulaEngine.evaluateSheet(sheets, activeSheetId);
    return NextResponse.json({ sheets: updatedSheets });
  } catch (err: any) {
    return NextResponse.json({ error: 'Evaluation failed: ' + err.message }, { status: 500 });
  }
}
