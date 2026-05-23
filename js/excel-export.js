/**
 * Excel Export Module
 * Exports spreadsheet state to a styled .xlsx file using ExcelJS.
 * Supports: formula cells (mapped to real Excel formulas), summary rows,
 * and static fallback for functions without Excel equivalents.
 * Exposes: window.ExcelExport = { exportToExcel }
 */
(function () {
  'use strict';

  function hexToArgb(hex) {
    if (!hex) return 'FF000000';
    var clean = hex.replace('#', '').toUpperCase();
    if (clean.length === 3) {
      clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
    }
    return 'FF' + clean;
  }

  function applyThinBorders(cell) {
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    };
  }

  function getNumberFormat(format) {
    switch (format) {
      case 'currency': return '$#,##0.00';
      case 'percentage': return '0.00%';
      case 'number': return '#,##0.##';
      default: return null;
    }
  }

  function applyStyle(cell, style) {
    if (!style) return;
    if (style.bg) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(style.bg) } };
    }
    var fontObj = {};
    if (style.color) fontObj.color = { argb: hexToArgb(style.color) };
    if (style.bold) fontObj.bold = true;
    if (style.italic) fontObj.italic = true;
    if (Object.keys(fontObj).length > 0) {
      cell.font = Object.assign({}, cell.font || {}, fontObj);
    }
    if (style.align) cell.alignment = { horizontal: style.align };
  }

  /**
   * Sanitize a value for Excel — handle NaN, Infinity, undefined, etc.
   */
  function safeValue(val) {
    if (val === undefined || val === null) return '';
    if (typeof val === 'number') {
      if (isNaN(val) || !isFinite(val)) return '';
      return val;
    }
    if (typeof val === 'string') return val;
    return String(val);
  }

  /**
   * Try to set an Excel formula on a cell.
   * Returns true if a valid formula was set, false if we fell back to static value.
   */
  function trySetFormula(cell, formulaStr, colMap, dataRowStart, dataRowEnd, currentExcelRow, computedValue) {
    if (!formulaStr || !window.FormulaEngine) return false;

    try {
      var excelFormula = window.FormulaEngine.toExcelFormula(
        formulaStr, colMap, dataRowStart, dataRowEnd, currentExcelRow
      );

      if (!excelFormula) return false;

      // Validate the formula doesn't contain our custom function names
      // that slipped through (safety check)
      var invalidFuncs = ['COHENS_D', 'MANN_WHITNEY', 'WILCOXON', 'SIGNIFICANCE',
        'SENSITIVITY', 'SPECIFICITY', 'ODDS_RATIO', 'RELATIVE_RISK', 'NNT', 'ARR',
        'BMI', 'BSA', 'CAGR', 'ROI', 'BREAKEVEN', 'MARGIN', 'MARKUP',
        'PROCESS_CP', 'PROCESS_CPK', 'UCL', 'LCL', 'SNR', 'RMSE', 'MAE', 'MAPE',
        'SEM', 'CV', 'IQR', 'TTEST_T', 'CHITEST_STAT', 'ANOVA_F', 'ANOVA_P',
        'SPEARMAN', 'CORREL_P', 'DF', 'NPV_CLINICAL', 'TTEST_INDEP_P'];

      for (var i = 0; i < invalidFuncs.length; i++) {
        if (excelFormula.toUpperCase().indexOf(invalidFuncs[i]) !== -1) {
          return false; // Contains a non-Excel function, fall back to static
        }
      }

      // Sanitize the result value for the formula cache
      var resultVal = safeValue(computedValue);
      if (resultVal === '' || resultVal === '#ERR') resultVal = 0;

      cell.value = { formula: excelFormula, result: resultVal };
      return true;

    } catch (e) {
      // Formula conversion failed, fall back to static value
      return false;
    }
  }

  /**
   * Export the full spreadsheet state to an .xlsx file and trigger download.
   */
  async function exportToExcel(state) {
    if (window.logTelemetry) {
      window.logTelemetry('[SYS] Generating ExcelJS workbook for "' + (state.title || 'Spreadsheet') + '"...', 'system');
    }

    var workbook = new ExcelJS.Workbook();
    workbook.creator = 'quaasx-excel powered by quaasx computers';
    workbook.created = new Date();

    state.sheets.forEach(function (sheet) {
      // Sanitize sheet name (Excel max 31 chars, no special chars)
      var sheetName = (sheet.name || 'Sheet').replace(/[*?:/\\[\]]/g, '').substring(0, 31);
      var worksheet = workbook.addWorksheet(sheetName);
      var columns = sheet.columns || [];
      var rows = sheet.rows || [];
      var summaryRows = sheet.summaryRows || [];

      if (window.logTelemetry) {
        window.logTelemetry('[SYS] Processing sheet "' + sheetName + '" (' + columns.length + ' cols, ' + rows.length + ' rows, ' + summaryRows.length + ' summary rows)', 'system');
      }

      // Build column map: col_id → Excel letter
      var colMap = {};
      columns.forEach(function (col, idx) {
        colMap[col.id] = window.FormulaEngine.colIdxToLetter(idx);
      });

      // Define columns
      worksheet.columns = columns.map(function (col) {
        return { header: col.title || '', key: col.id, width: col.width || 15 };
      });

      // Style header row
      var headerRow = worksheet.getRow(1);
      var hs = sheet.headerStyle || {};
      headerRow.eachCell(function (cell) {
        if (hs.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(hs.bg) } };
        cell.font = { bold: true, color: hs.color ? { argb: hexToArgb(hs.color) } : undefined };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        applyThinBorders(cell);
      });

      var dataRowStart = 2;
      var dataRowEnd = dataRowStart + rows.length - 1;
      if (rows.length === 0) dataRowEnd = dataRowStart; // Avoid invalid range

      // === DATA ROWS ===
      rows.forEach(function (row, rowIdx) {
        // Build row data with safe values
        var rowData = {};
        columns.forEach(function (col) {
          var cellData = (row.cells && row.cells[col.id]) ? row.cells[col.id] : null;
          if (cellData) {
            var val = cellData._cv !== undefined ? cellData._cv : cellData.value;
            rowData[col.id] = safeValue(val);
          } else {
            rowData[col.id] = '';
          }
        });

        var excelRow = worksheet.addRow(rowData);
        var currentExcelRow = dataRowStart + rowIdx;

        // Apply formulas and styles
        columns.forEach(function (col, colIdx) {
          var cell = excelRow.getCell(colIdx + 1);
          var cellData = (row.cells && row.cells[col.id]) ? row.cells[col.id] : null;

          // Determine formula source
          var formulaStr = null;
          if (cellData && cellData.formula) formulaStr = cellData.formula;
          else if (col.formula) formulaStr = col.formula;

          // Try Excel formula, fall back to static value
          if (formulaStr) {
            var cv = cellData ? cellData._cv : undefined;
            if (!trySetFormula(cell, formulaStr, colMap, dataRowStart, dataRowEnd, currentExcelRow, cv)) {
              // Static fallback — value already set from rowData
              cell.value = safeValue(cv !== undefined ? cv : (cellData ? cellData.value : ''));
            }
          }

          // Styles
          if (cellData && cellData.style) applyStyle(cell, cellData.style);
          var numFmt = getNumberFormat(col.format);
          if (numFmt) cell.numFmt = numFmt;
          applyThinBorders(cell);
        });
      });

      // === SUMMARY ROWS ===
      summaryRows.forEach(function (sRow, sIdx) {
        var rowData = {};
        columns.forEach(function (col, colIdx) {
          var cellData = (sRow.cells && sRow.cells[col.id]) ? sRow.cells[col.id] : null;
          if (cellData) {
            var val = cellData._cv !== undefined ? cellData._cv : cellData.value;
            rowData[col.id] = safeValue(val);
          } else if (colIdx === 0 && sRow.label) {
            rowData[col.id] = sRow.label;
          } else {
            rowData[col.id] = '';
          }
        });

        var excelRow = worksheet.addRow(rowData);
        var currentExcelRow = worksheet.rowCount;

        columns.forEach(function (col, colIdx) {
          var cell = excelRow.getCell(colIdx + 1);
          var cellData = (sRow.cells && sRow.cells[col.id]) ? sRow.cells[col.id] : null;

          // Try Excel formula for summary cells
          if (cellData && cellData.formula) {
            var cv = cellData._cv;
            if (!trySetFormula(cell, cellData.formula, colMap, dataRowStart, dataRowEnd, currentExcelRow, cv)) {
              cell.value = safeValue(cv !== undefined ? cv : (cellData.value || ''));
            }
          }

          // Bold for all summary cells
          cell.font = Object.assign({}, cell.font || {}, { bold: true });

          // Row-level style
          if (sRow.style) applyStyle(cell, sRow.style);
          // Cell-level style (overrides)
          if (cellData && cellData.style) applyStyle(cell, cellData.style);

          applyThinBorders(cell);

          // Thick top border for first summary row
          if (sIdx === 0) {
            cell.border = {
              top: { style: 'medium' }, left: { style: 'thin' },
              bottom: { style: 'thin' }, right: { style: 'thin' }
            };
          }
        });
      });

      // Freeze header row
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    });

    // Generate and download
    var buffer = await workbook.xlsx.writeBuffer();
    var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var fileName = (state.title || 'Spreadsheet').replace(/[*?:/\\[\]]/g, '') + '.xlsx';
    if (window.logTelemetry) {
      window.logTelemetry('[SYS] ExcelJS workbook compile completed successfully.', 'success-line');
      window.logTelemetry('[SYS] Direct download link dispatched: ' + fileName, 'success-line');
    }
    saveAs(blob, fileName);
  }

  window.ExcelExport = {
    exportToExcel: exportToExcel
  };
})();
