import { NextRequest, NextResponse } from 'next/server';
const ExcelExport = require('../../../js/excel-export.js');

export async function POST(request: NextRequest) {
  try {
    const spreadsheetState = await request.json();
    if (!spreadsheetState || !spreadsheetState.sheets) {
      return NextResponse.json({ error: 'Spreadsheet state is required' }, { status: 400 });
    }

    const workbook = await ExcelExport.exportToExcel(spreadsheetState);
    const buffer = await workbook.xlsx.writeBuffer();

    const fileName = `${encodeURIComponent(spreadsheetState.title || 'Spreadsheet')}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Export failed: ' + err.message }, { status: 500 });
  }
}
