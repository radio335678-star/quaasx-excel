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

  /**
   * Import spreadsheet state from an .xlsx file using ExcelJS.
   * @param {ArrayBuffer} arrayBuffer - The uploaded Excel file buffer
   * @returns {Promise<Object>} - Mapped spreadsheetState object
   */
  async function importFromExcel(arrayBuffer) {
    if (window.logTelemetry) {
      window.logTelemetry('[SYS] Loading ExcelJS workbook from uploaded buffer...', 'system');
    }

    var workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    var parsedState = {
      title: 'Imported Spreadsheet',
      sheets: []
    };

    workbook.worksheets.forEach(function (worksheet, wIdx) {
      var colCount = worksheet.columnCount;
      var rowCount = worksheet.rowCount;

      if (window.logTelemetry) {
        window.logTelemetry('[SYS] Parsing sheet "' + worksheet.name + '" (' + colCount + ' columns, ' + rowCount + ' rows)...', 'system');
      }

      // Generate column mappings (Excel letters -> col_1, col_2...)
      var colLetterMap = {};
      var columns = [];
      for (var c = 1; c <= colCount; c++) {
        var letter = window.FormulaEngine.colIdxToLetter(c - 1);
        var colId = 'col_' + c;
        colLetterMap[letter] = colId;

        // Try to get column title from Row 1
        var headerCell = worksheet.getCell(1, c);
        var headerVal = headerCell.value;
        var title = '';
        if (headerVal !== null && headerVal !== undefined) {
          title = typeof headerVal === 'object' && headerVal.richText 
            ? headerVal.richText.map(function(t) { return t.text; }).join('')
            : String(headerVal).trim();
        }
        if (!title) {
          title = 'Column ' + letter;
        }

        // Guess format of column based on cell formats
        var format = 'text';
        if (rowCount > 1) {
          var sampleCell = worksheet.getCell(2, c);
          if (sampleCell.numFmt) {
            format = guessFormatFromNumFmt(sampleCell.numFmt);
          } else if (typeof sampleCell.value === 'number') {
            format = 'number';
          }
        }

        columns.push({
          id: colId,
          title: title,
          width: 15,
          format: format
        });
      }

      var rows = [];
      var summaryRows = [];

      // Helper to translate Excel formula references to column references
      function translateExcelFormula(rawFormula) {
        if (!rawFormula) return '';
        var formula = rawFormula.replace(/\$/g, '');
        
        // Translate ranges like A2:A10 -> @col_1
        formula = formula.replace(/\b([A-Z]+)\d*:([A-Z]+)\d*\b/g, function(match, col1, col2) {
          if (col1 === col2 && colLetterMap[col1]) {
            return '@' + colLetterMap[col1];
          }
          return match;
        });
        
        // Translate single cell coordinates like A2 -> col_1
        formula = formula.replace(/\b([A-Z]+)(\d+)\b/g, function(match, col, row) {
          if (colLetterMap[col]) {
            return colLetterMap[col];
          }
          return match;
        });
        
        return formula;
      }

      // Check if a row is a candidate summary/aggregate row
      function checkIsSummaryRow(rowObj, rIdx, totalRows) {
        if (rIdx < 2) return false; // Row 1 is header
        if (rIdx < totalRows - 5) return false; // Must be in the bottom part of sheet
        
        for (var colId in rowObj.cells) {
          var cell = rowObj.cells[colId];
          // If any cell contains a formula that references a column range (@col_X)
          if (cell.formula && cell.formula.includes('@')) {
            return true;
          }
          // If first column or label contains "total", "average", etc.
          if (cell.value && typeof cell.value === 'string' && /total|average|mean|median|summary|grand/i.test(cell.value)) {
            return true;
          }
        }
        return false;
      }

      // Read rows from 2 onwards
      for (var r = 2; r <= rowCount; r++) {
        var rowObj = {
          id: 'row_' + r,
          cells: {}
        };
        var hasValues = false;

        for (var c = 1; c <= colCount; c++) {
          var colId = 'col_' + c;
          var cell = worksheet.getCell(r, c);
          var cellVal = cell.value;
          
          if (cellVal === null || cellVal === undefined) {
            continue;
          }

          var value = '';
          var formula = '';

          if (cellVal && typeof cellVal === 'object' && cellVal.formula) {
            formula = translateExcelFormula(cellVal.formula);
            value = cellVal.result !== undefined ? cellVal.result : '';
          } else {
            value = cellVal;
          }

          if (value !== '' && value !== null && value !== undefined) {
            hasValues = true;
          }

          var cellData = { value: value };
          if (formula) {
            cellData.formula = formula;
          }

          // Parse style
          var style = getCellStyle(cell);
          if (style) {
            cellData.style = style;
          }

          rowObj.cells[colId] = cellData;
        }

        // Skip completely empty rows
        if (!hasValues) {
          continue;
        }

        // Categorize row
        if (checkIsSummaryRow(rowObj, r, rowCount)) {
          // Add label if found in first column
          var label = '';
          var firstCell = rowObj.cells['col_1'];
          if (firstCell && firstCell.value && typeof firstCell.value === 'string') {
            label = firstCell.value;
          }
          summaryRows.push({
            label: label || 'Summary',
            cells: rowObj.cells,
            style: { bold: true }
          });
        } else {
          rows.push(rowObj);
        }
      }

      parsedState.sheets.push({
        name: worksheet.name || 'Sheet' + (wIdx + 1),
        columns: columns,
        rows: rows,
        summaryRows: summaryRows,
        headerStyle: { bg: '#1e1e30', color: '#ffffff', bold: true }
      });
    });

    if (parsedState.sheets.length > 0) {
      parsedState.title = parsedState.sheets[0].name || 'Imported Spreadsheet';
    }

    if (window.logTelemetry) {
      window.logTelemetry('[SYS] ExcelJS parsing complete. Constructed active spreadsheet state.', 'success-line');
    }

    return parsedState;
  }

  function getCellStyle(cell) {
    var style = {};
    if (cell.font) {
      if (cell.font.bold) style.bold = true;
      if (cell.font.italic) style.italic = true;
      var color = parseExcelColor(cell.font.color);
      if (color) style.color = color;
    }
    if (cell.fill) {
      var bg = getCellBgColor(cell.fill);
      if (bg) style.bg = bg;
    }
    if (cell.alignment && cell.alignment.horizontal) {
      style.align = cell.alignment.horizontal;
    }
    return Object.keys(style).length > 0 ? style : null;
  }

  function parseExcelColor(colorObj) {
    if (!colorObj) return null;
    var argb = null;
    if (typeof colorObj === 'string') {
      argb = colorObj;
    } else if (colorObj.argb) {
      argb = colorObj.argb;
    }
    if (!argb) return null;
    if (argb.length === 8) {
      return '#' + argb.substring(2).toLowerCase();
    }
    if (argb.length === 6) {
      return '#' + argb.toLowerCase();
    }
    return null;
  }

  function getCellBgColor(fill) {
    if (!fill) return null;
    if (fill.type === 'pattern' && fill.fgColor) {
      return parseExcelColor(fill.fgColor);
    }
    return null;
  }

  function guessFormatFromNumFmt(numFmt) {
    if (!numFmt) return 'text';
    var lower = numFmt.toLowerCase();
    if (lower.indexOf('$') !== -1 || lower.indexOf('₹') !== -1 || lower.indexOf('€') !== -1) return 'currency';
    if (lower.indexOf('%') !== -1) return 'percentage';
    if (lower.indexOf('0') !== -1 || lower.indexOf('#') !== -1) return 'number';
    return 'text';
  }

  window.ExcelExport = {
    exportToExcel: exportToExcel,
    importFromExcel: importFromExcel
  };
})();
