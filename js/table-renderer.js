/**
 * Table Renderer Module
 * Renders spreadsheet data as an editable HTML table.
 * Supports formula cells (shows computed value, formula tooltip),
 * summary rows (styled, non-editable), and column-level formulas.
 * Exposes: window.TableRenderer = { renderTable }
 */
(function () {
  'use strict';

  /**
   * Render a sheet's data as an editable HTML table.
   * @param {Object} sheetData - A single sheet object from the JSON state
   * @param {HTMLElement} containerEl - DOM element to render the table into
   * @param {Function} onCellEdit - Callback: function(rowId, colId, newValue)
   */
  function renderTable(sheetData, containerEl, onCellEdit) {
    // Clear container
    containerEl.innerHTML = '';

    var columns = sheetData.columns || [];
    var rows = sheetData.rows || [];
    var summaryRows = sheetData.summaryRows || [];
    var headerStyle = sheetData.headerStyle || {};

    // Create table
    var table = document.createElement('table');
    table.className = 'spreadsheet-table';

    // === THEAD ===
    var thead = document.createElement('thead');
    var headerRow = document.createElement('tr');

    columns.forEach(function (col) {
      var th = document.createElement('th');
      th.textContent = col.title || '';

      // Apply header styles
      if (headerStyle.bg) th.style.backgroundColor = headerStyle.bg;
      if (headerStyle.color) th.style.color = headerStyle.color;
      if (headerStyle.bold) th.style.fontWeight = '700';

      // Show formula indicator for computed columns
      if (col.formula) {
        th.title = 'Formula column: ' + col.formula;
        th.classList.add('formula-column');
      }

      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // === TBODY — Data Rows ===
    var tbody = document.createElement('tbody');

    rows.forEach(function (row) {
      var tr = document.createElement('tr');

      columns.forEach(function (col) {
        var td = document.createElement('td');

        // Get cell data (handle missing cells)
        var cellData = (row.cells && row.cells[col.id]) ? row.cells[col.id] : null;

        // Determine display value: _cv (computed) takes priority, then value
        var displayValue = '';
        var hasFormula = false;
        var formulaText = '';

        if (cellData) {
          if (cellData._cv !== undefined) {
            displayValue = formatDisplayValue(cellData._cv);
            hasFormula = true;
            formulaText = cellData._fm || cellData.formula || col.formula || '';
          } else if (cellData.value != null) {
            displayValue = cellData.value;
          }
          if (cellData.formula || col.formula) {
            hasFormula = true;
            formulaText = cellData.formula || col.formula || '';
          }
        }

        td.textContent = displayValue;

        // Formula cells: show indicator + tooltip, non-editable for column formulas
        if (hasFormula) {
          td.classList.add('formula-cell');
          td.title = 'ƒ  ' + formulaText;
          // Column-level formulas are not directly editable
          if (col.formula) {
            td.contentEditable = 'false';
          } else {
            td.contentEditable = 'true';
          }
        } else {
          td.contentEditable = 'true';
        }

        td.dataset.rowId = row.id;
        td.dataset.colId = col.id;

        // Apply cell styles if present
        if (cellData && cellData.style) {
          applyCellStyle(td, cellData.style);
        }

        // Focus event: add editing class
        td.addEventListener('focus', function () {
          td.classList.add('cell-editing');
        });

        // Blur event: remove editing class, trigger callback
        td.addEventListener('blur', function () {
          td.classList.remove('cell-editing');
          if (typeof onCellEdit === 'function') {
            onCellEdit(td.dataset.rowId, td.dataset.colId, td.textContent);
          }
        });

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    // === SUMMARY ROWS (non-editable, styled) ===
    if (summaryRows.length > 0) {
      summaryRows.forEach(function (sRow) {
        var tr = document.createElement('tr');
        tr.className = 'summary-row';

        columns.forEach(function (col, colIdx) {
          var td = document.createElement('td');
          td.contentEditable = 'false';

          var cellData = (sRow.cells && sRow.cells[col.id]) ? sRow.cells[col.id] : null;

          // Display value
          var displayValue = '';
          if (cellData) {
            if (cellData._cv !== undefined) {
              displayValue = formatDisplayValue(cellData._cv);
              td.title = 'ƒ  ' + (cellData._fm || cellData.formula || '');
              td.classList.add('formula-cell');
            } else if (cellData.value != null) {
              displayValue = cellData.value;
            }
          }

          // Label in first column if nothing else
          if (colIdx === 0 && !displayValue && sRow.label) {
            displayValue = sRow.label;
          }

          td.textContent = displayValue;

          // Apply summary row default style
          td.style.fontWeight = '600';

          // Apply row-level style
          if (sRow.style) applyCellStyle(td, sRow.style);
          // Apply cell-level style
          if (cellData && cellData.style) applyCellStyle(td, cellData.style);

          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    containerEl.appendChild(table);
  }

  /**
   * Format a computed value for display.
   */
  function formatDisplayValue(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (isNaN(val)) return String(val);
    // Round to reasonable precision
    if (Number.isInteger(val)) return String(val);
    // Smart rounding: more decimals for small numbers
    var abs = Math.abs(val);
    if (abs < 0.001 && abs > 0) return val.toExponential(3);
    if (abs < 1) return Number(val.toFixed(4)).toString();
    if (abs < 100) return Number(val.toFixed(2)).toString();
    return Number(val.toFixed(1)).toString();
  }

  /**
   * Apply style object to a table cell.
   */
  function applyCellStyle(td, style) {
    if (style.bg) td.style.backgroundColor = style.bg;
    if (style.color) td.style.color = style.color;
    if (style.bold) td.style.fontWeight = '700';
    if (style.italic) td.style.fontStyle = 'italic';
    if (style.align) td.style.textAlign = style.align;
  }

  // Expose on window
  window.TableRenderer = {
    renderTable: renderTable
  };
})();
