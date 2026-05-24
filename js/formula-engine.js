/**
 * Formula Engine — Safe Recursive-Descent Parser + Evaluator
 * No eval(), no Function() — fully sandboxed expression evaluation.
 * Exposes: window.FormulaEngine
 */
(function () {
  'use strict';

  if (typeof window === 'undefined') {
    global.window = {
      logTelemetry: function (msg) { console.log('[TELEMETRY]', msg); }
    };
  }

  // ========== TOKEN TYPES ==========
  var TOKEN = {
    NUMBER: 'NUM', STRING: 'STR', IDENT: 'ID',
    COL_REF: 'CREF', OPERATOR: 'OP', COMPARE: 'CMP',
    LPAREN: 'LP', RPAREN: 'RP', COMMA: 'COM', EOF: 'EOF'
  };

  // ========== TOKENIZER ==========
  function tokenize(formula) {
    var tokens = [];
    var i = 0;
    var len = formula.length;

    while (i < len) {
      var ch = formula[i];

      // Skip whitespace
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }

      // Number literal
      if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < len && formula[i + 1] >= '0' && formula[i + 1] <= '9')) {
        var ns = '';
        while (i < len && ((formula[i] >= '0' && formula[i] <= '9') || formula[i] === '.')) { ns += formula[i]; i++; }
        tokens.push({ type: TOKEN.NUMBER, value: parseFloat(ns) });
        continue;
      }

      // String literal
      if (ch === '"' || ch === "'") {
        var q = ch; i++;
        var s = '';
        while (i < len && formula[i] !== q) {
          if (formula[i] === '\\' && i + 1 < len) { i++; }
          s += formula[i]; i++;
        }
        if (i < len) i++; // closing quote
        tokens.push({ type: TOKEN.STRING, value: s });
        continue;
      }

      // Column range reference (@col_id)
      if (ch === '@') {
        i++;
        var cr = '';
        while (i < len && (isAN(formula[i]) || formula[i] === '_')) { cr += formula[i]; i++; }
        tokens.push({ type: TOKEN.COL_REF, value: cr });
        continue;
      }

      // Identifier
      if (isA(ch) || ch === '_') {
        var id = '';
        while (i < len && (isAN(formula[i]) || formula[i] === '_')) { id += formula[i]; i++; }
        tokens.push({ type: TOKEN.IDENT, value: id });
        continue;
      }

      // Comparison operators
      if ((ch === '>' || ch === '<' || ch === '!' || ch === '=') && i + 1 < len && formula[i + 1] === '=') {
        tokens.push({ type: TOKEN.COMPARE, value: ch + '=' }); i += 2; continue;
      }
      if (ch === '>' || ch === '<') {
        tokens.push({ type: TOKEN.COMPARE, value: ch }); i++; continue;
      }

      // Arithmetic operators
      if ('+-*/^%'.indexOf(ch) !== -1) {
        tokens.push({ type: TOKEN.OPERATOR, value: ch }); i++; continue;
      }

      // Parens and comma
      if (ch === '(') { tokens.push({ type: TOKEN.LPAREN }); i++; continue; }
      if (ch === ')') { tokens.push({ type: TOKEN.RPAREN }); i++; continue; }
      if (ch === ',') { tokens.push({ type: TOKEN.COMMA }); i++; continue; }

      i++; // skip unknown
    }

    tokens.push({ type: TOKEN.EOF });
    return tokens;
  }

  function isA(c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'; }
  function isAN(c) { return isA(c) || (c >= '0' && c <= '9'); }

  // ========== PARSER — Recursive Descent ==========
  function Parser(tokens) { this.t = tokens; this.p = 0; }
  Parser.prototype.pk = function () { return this.t[this.p]; };
  Parser.prototype.eat = function (type) {
    var tk = this.t[this.p];
    if (type && tk.type !== type) throw new Error('Expected ' + type + ' got ' + tk.type);
    this.p++; return tk;
  };

  Parser.prototype.parse = function () { return this.expr(); };

  // expression → comparison
  Parser.prototype.expr = function () { return this.comp(); };

  // comparison → addition (CMP addition)*
  Parser.prototype.comp = function () {
    var n = this.add();
    while (this.pk().type === TOKEN.COMPARE) {
      var op = this.eat().value;
      n = { t: 'BinOp', op: op, l: n, r: this.add() };
    }
    return n;
  };

  // addition → multiplication (('+' | '-') multiplication)*
  Parser.prototype.add = function () {
    var n = this.mul();
    while (this.pk().type === TOKEN.OPERATOR && (this.pk().value === '+' || this.pk().value === '-')) {
      var op = this.eat().value;
      n = { t: 'BinOp', op: op, l: n, r: this.mul() };
    }
    return n;
  };

  // multiplication → power (('*' | '/' | '%') power)*
  Parser.prototype.mul = function () {
    var n = this.pow();
    while (this.pk().type === TOKEN.OPERATOR && (this.pk().value === '*' || this.pk().value === '/' || this.pk().value === '%')) {
      var op = this.eat().value;
      n = { t: 'BinOp', op: op, l: n, r: this.pow() };
    }
    return n;
  };

  // power → unary ('^' unary)*
  Parser.prototype.pow = function () {
    var n = this.unary();
    while (this.pk().type === TOKEN.OPERATOR && this.pk().value === '^') {
      this.eat();
      n = { t: 'BinOp', op: '^', l: n, r: this.unary() };
    }
    return n;
  };

  // unary → '-' unary | primary
  Parser.prototype.unary = function () {
    if (this.pk().type === TOKEN.OPERATOR && this.pk().value === '-') {
      this.eat();
      return { t: 'Neg', v: this.unary() };
    }
    return this.primary();
  };

  // primary → NUMBER | STRING | func_call | col_ref | '(' expr ')'
  Parser.prototype.primary = function () {
    var tk = this.pk();

    if (tk.type === TOKEN.NUMBER) { this.eat(); return { t: 'Num', v: tk.value }; }
    if (tk.type === TOKEN.STRING) { this.eat(); return { t: 'Str', v: tk.value }; }
    if (tk.type === TOKEN.COL_REF) { this.eat(); return { t: 'CRange', id: tk.value }; }

    if (tk.type === TOKEN.IDENT) {
      this.eat();
      // Function call?
      if (this.pk().type === TOKEN.LPAREN) {
        this.eat(); // (
        var args = [];
        if (this.pk().type !== TOKEN.RPAREN) {
          args.push(this.expr());
          while (this.pk().type === TOKEN.COMMA) { this.eat(); args.push(this.expr()); }
        }
        this.eat(TOKEN.RPAREN);
        return { t: 'Fn', name: tk.value.toUpperCase(), args: args };
      }
      // Boolean literal
      var up = tk.value.toUpperCase();
      if (up === 'TRUE') return { t: 'Num', v: 1 };
      if (up === 'FALSE') return { t: 'Num', v: 0 };
      // Column reference
      return { t: 'CRef', id: tk.value };
    }

    if (tk.type === TOKEN.LPAREN) {
      this.eat();
      var e = this.expr();
      this.eat(TOKEN.RPAREN);
      return e;
    }

    throw new Error('Unexpected: ' + (tk.value || tk.type));
  };

  // ========== EVALUATOR ==========
  var funcRegistry = {};

  function evalAST(node, ctx) {
    switch (node.t) {
      case 'Num': return node.v;
      case 'Str': return node.v;

      case 'CRef':
        if (ctx.row && ctx.row.hasOwnProperty(node.id)) {
          var v = ctx.row[node.id];
          return (v === '' || v === null || v === undefined) ? 0 : v;
        }
        return 0;

      case 'CRange':
        return ctx.colVals ? ctx.colVals(node.id) : [];

      case 'Neg':
        return -Number(evalAST(node.v, ctx));

      case 'BinOp':
        var l = evalAST(node.l, ctx);
        var r = evalAST(node.r, ctx);
        return binOp(node.op, l, r);

      case 'Fn':
        var args = node.args.map(function (a) { return evalAST(a, ctx); });
        var fn = funcRegistry[node.name];
        if (!fn) throw new Error('Unknown function: ' + node.name);
        return fn.apply(null, args);

      default: throw new Error('Unknown node: ' + node.t);
    }
  }

  function binOp(op, l, r) {
    var a = Number(l), b = Number(r);
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b !== 0 ? a / b : NaN;
      case '^': return Math.pow(a, b);
      case '%': return b !== 0 ? a % b : NaN;
      case '>': return a > b ? 1 : 0;
      case '<': return a < b ? 1 : 0;
      case '>=': return a >= b ? 1 : 0;
      case '<=': return a <= b ? 1 : 0;
      case '==': return l == r ? 1 : 0;
      case '!=': return l != r ? 1 : 0;
      default: return NaN;
    }
  }

  // ========== SHEET EVALUATOR ==========
  function evaluateSheet(sheet) {
    if (!sheet || !sheet.columns || !sheet.rows) return sheet;

    var startTime = performance.now();
    var calcCount = 0;

    var cols = sheet.columns;
    var rows = sheet.rows;
    var sumRows = sheet.summaryRows || [];

    // Helper: get numeric values for a column from data rows
    function colVals(colId) {
      var vals = [];
      rows.forEach(function (r) {
        if (!r.cells || !r.cells[colId]) return;
        var c = r.cells[colId];
        var v = c._cv !== undefined ? c._cv : c.value;
        if (v !== undefined && v !== null && v !== '' && !isNaN(Number(v))) {
          vals.push(Number(v));
        }
      });
      return vals;
    }

    // Pass 1: Column-level formulas (applied to each data row)
    cols.forEach(function (col) {
      if (!col.formula) return;
      var ast;
      try { ast = parseFormula(col.formula); } catch (e) { return; }

      rows.forEach(function (r) {
        if (!r.cells) r.cells = {};
        if (!r.cells[col.id]) r.cells[col.id] = {};

        var rowData = {};
        cols.forEach(function (c) {
          if (r.cells[c.id]) {
            rowData[c.id] = r.cells[c.id]._cv !== undefined ? r.cells[c.id]._cv : r.cells[c.id].value;
          }
        });

        calcCount++;
        try {
          r.cells[col.id]._cv = evalAST(ast, { row: rowData, colVals: colVals });
          r.cells[col.id]._fm = col.formula;
        } catch (e) {
          r.cells[col.id]._cv = '#ERR';
          r.cells[col.id]._fm = col.formula;
        }
      });
    });

    // Pass 2: Cell-level formulas in data rows
    rows.forEach(function (r) {
      if (!r.cells) return;
      cols.forEach(function (col) {
        var cell = r.cells[col.id];
        if (!cell || !cell.formula) return;

        var ast;
        try { ast = parseFormula(cell.formula); } catch (e) { cell._cv = '#ERR'; return; }

        var rowData = {};
        cols.forEach(function (c) {
          if (r.cells[c.id]) {
            rowData[c.id] = r.cells[c.id]._cv !== undefined ? r.cells[c.id]._cv : r.cells[c.id].value;
          }
        });

        calcCount++;
        try {
          cell._cv = evalAST(ast, { row: rowData, colVals: colVals });
          cell._fm = cell.formula;
        } catch (e) {
          cell._cv = '#ERR';
        }
      });
    });

    // Pass 3: Summary rows
    sumRows.forEach(function (sr) {
      if (!sr.cells) sr.cells = {};

      // Put label in first column if needed
      if (sr.label && cols[0] && !sr.cells[cols[0].id]) {
        sr.cells[cols[0].id] = { value: sr.label };
      } else if (sr.label && cols[0] && !sr.cells[cols[0].id].value) {
        sr.cells[cols[0].id].value = sr.label;
      }

      cols.forEach(function (col) {
        var cell = sr.cells[col.id];
        if (!cell || !cell.formula) return;

        var ast;
        try { ast = parseFormula(cell.formula); } catch (e) { cell._cv = '#ERR'; return; }

        calcCount++;
        try {
          cell._cv = evalAST(ast, { row: {}, colVals: colVals });
          cell._fm = cell.formula;
        } catch (e) {
          cell._cv = '#ERR';
        }
      });
    });

    var duration = (performance.now() - startTime).toFixed(2);
    if (window.logTelemetry) {
      window.logTelemetry('[SYS] Recalculating sheet "' + sheet.name + '"...', 'system');
      if (calcCount > 0) {
        window.logTelemetry('[CALC] Processed ' + calcCount + ' expressions in ' + duration + 'ms', 'calc-highlight');
        
        // Log a couple of specific values as telemetry details
        var sampleLogs = [];
        rows.slice(0, 3).forEach(function (r, idx) {
          cols.forEach(function (col) {
            var cell = r.cells && r.cells[col.id];
            if (cell && cell.formula && sampleLogs.length < 2) {
              var displayVal = cell._cv;
              if (typeof displayVal === 'number') displayVal = displayVal.toFixed(4).replace(/\.?0+$/, '');
              sampleLogs.push('Row ' + (idx + 1) + ', col ' + col.title + ': =' + cell.formula + ' -> ' + displayVal);
            }
          });
        });
        sampleLogs.forEach(function (log) {
          window.logTelemetry('[CALC] ' + log, 'calc');
        });
      }
    }

    return sheet;
  }

  // ========== PARSE HELPER ==========
  function parseFormula(formula) {
    return new Parser(tokenize(formula)).parse();
  }

  // ========== EXCEL FORMULA MAPPING ==========
  function colIdxToLetter(i) {
    var s = '';
    while (i >= 0) {
      s = String.fromCharCode(65 + (i % 26)) + s;
      i = Math.floor(i / 26) - 1;
    }
    return s;
  }

  // Our function names → Excel function names
  var EXCEL_MAP = {
    'SUM': 'SUM', 'AVERAGE': 'AVERAGE', 'COUNT': 'COUNT', 'COUNTA': 'COUNTA',
    'MIN': 'MIN', 'MAX': 'MAX', 'ABS': 'ABS', 'ROUND': 'ROUND',
    'CEILING': 'CEILING', 'FLOOR': 'FLOOR', 'POWER': 'POWER', 'SQRT': 'SQRT',
    'LOG': 'LOG', 'LN': 'LN', 'EXP': 'EXP',
    'STDEV': 'STDEV.S', 'STDEVP': 'STDEV.P', 'VAR': 'VAR.S', 'VARP': 'VAR.P',
    'MEDIAN': 'MEDIAN', 'MODE': 'MODE.SNGL',
    'PERCENTILE': 'PERCENTILE.INC', 'QUARTILE': 'QUARTILE.INC',
    'RANK': 'RANK.AVG', 'PERCENTRANK': 'PERCENTRANK.INC',
    'SKEW': 'SKEW', 'KURT': 'KURT',
    'CORREL': 'CORREL', 'RSQ': 'RSQ', 'SLOPE': 'SLOPE', 'INTERCEPT': 'INTERCEPT',
    'CONFIDENCE_T': 'CONFIDENCE.T', 'CONFIDENCE_NORM': 'CONFIDENCE.NORM',
    'IF': 'IF', 'AND': 'AND', 'OR': 'OR', 'NOT': 'NOT',
    'IFERROR': 'IFERROR', 'ISBLANK': 'ISBLANK', 'ISNUMBER': 'ISNUMBER',
    'NPV_FIN': 'NPV', 'IRR': 'IRR', 'PMT': 'PMT', 'FV': 'FV', 'PV': 'PV'
  };

  // Functions that must be exported as static values (no Excel equivalent)
  var NO_EXCEL = [
    'SEM', 'CV', 'IQR', 'COHENS_D', 'TTEST_T', 'TTEST_P', 'TTEST_INDEP_P',
    'CHITEST_STAT', 'CHITEST_P', 'FTEST_P',
    'ANOVA_F', 'ANOVA_P', 'SPEARMAN', 'CORREL_P',
    'MANN_WHITNEY_U', 'MANN_WHITNEY_P', 'WILCOXON_T', 'WILCOXON_P',
    'SIGNIFICANCE', 'DF',
    'SENSITIVITY', 'SPECIFICITY', 'PPV', 'NPV_CLINICAL', 'ACCURACY',
    'ODDS_RATIO', 'RELATIVE_RISK', 'NNT', 'ARR', 'BMI', 'BSA',
    'CAGR', 'ROI', 'BREAKEVEN', 'MARGIN', 'MARKUP',
    'PROCESS_CP', 'PROCESS_CPK', 'UCL', 'LCL', 'SNR', 'RMSE', 'MAE', 'MAPE'
  ];

  function toExcelFormula(formula, colMap, dStart, dEnd, curRow) {
    var ast;
    try { ast = parseFormula(formula); } catch (e) { return null; }
    return _toExcel(ast, colMap, dStart, dEnd, curRow);
  }

  function _toExcel(n, cm, ds, de, cr) {
    switch (n.t) {
      case 'Num': return String(n.v);
      case 'Str': return '"' + n.v + '"';
      case 'CRef':
        var lt = cm[n.id]; return lt ? lt + cr : n.id;
      case 'CRange':
        var lt2 = cm[n.id]; return lt2 ? lt2 + ds + ':' + lt2 + de : n.id;
      case 'Neg':
        var inner = _toExcel(n.v, cm, ds, de, cr);
        return inner === null ? null : '-' + inner;
      case 'BinOp':
        var le = _toExcel(n.l, cm, ds, de, cr);
        var re = _toExcel(n.r, cm, ds, de, cr);
        if (le === null || re === null) return null;
        return '(' + le + n.op + re + ')';
      case 'Fn':
        if (NO_EXCEL.indexOf(n.name) !== -1) return null;
        var en = EXCEL_MAP[n.name] || n.name;
        var ea = [];
        for (var i = 0; i < n.args.length; i++) {
          var a = _toExcel(n.args[i], cm, ds, de, cr);
          if (a === null) return null;
          ea.push(a);
        }
        return en + '(' + ea.join(',') + ')';
      default: return null;
    }
  }

  // ========== EXPOSE ON WINDOW / GLOBAL ==========
  var exports = {
    parse: parseFormula,
    evaluate: function (formula, ctx) { return evalAST(parseFormula(formula), ctx); },
    evaluateSheet: evaluateSheet,
    toExcelFormula: toExcelFormula,
    register: function (name, fn) { funcRegistry[name.toUpperCase()] = fn; },
    colIdxToLetter: colIdxToLetter,
    _registry: funcRegistry
  };

  if (typeof window !== 'undefined') {
    window.FormulaEngine = exports;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }
})();
