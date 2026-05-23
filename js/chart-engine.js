/**
 * Chart Engine — Smart Data Detection + Chart Configuration Generator
 * Analyzes spreadsheet data and generates ApexCharts-ready configurations.
 * Zero AI — pure pattern matching on column headers + data types.
 * Exposes: window.ChartEngine = { generateCharts }
 */
(function () {
  'use strict';

  var COLORS = ['#7c3aed', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1'];

  var PRE_KW = /\b(before|pre|baseline|initial|admission|entry|bt|pretest|pre.?test|pre.?treatment)\b/i;
  var POST_KW = /\b(after|post|final|discharge|exit|at|posttest|post.?test|post.?treatment|follow)\b/i;
  var GROUP_KW = /\b(group|category|type|class|gender|sex|treatment|arm|diagnosis|grade|stage|dept)\b/i;
  var LABEL_KW = /\b(id|name|patient|subject|participant|sl|sr|serial|code|no|number|sample)\b/i;
  var DATE_KW = /\b(date|time|year|month|day|period|week|quarter)\b/i;

  // ========== COLUMN DATA EXTRACTION ==========
  function extractColumnData(sheet) {
    var data = {};
    sheet.columns.forEach(function (col) { data[col.id] = []; });
    sheet.rows.forEach(function (row) {
      sheet.columns.forEach(function (col) {
        var cell = row.cells && row.cells[col.id];
        var val = null;
        if (cell) val = cell._cv !== undefined ? cell._cv : cell.value;
        data[col.id].push(val);
      });
    });
    return data;
  }

  // Get numeric-only values
  function numericVals(arr) {
    return arr.filter(function (v) { return v !== null && v !== '' && v !== undefined && !isNaN(Number(v)); }).map(Number);
  }

  // ========== COLUMN TYPE DETECTION ==========
  function detectColumnTypes(sheet, colData) {
    return sheet.columns.map(function (col) {
      var title = (col.title || '').toLowerCase();
      var vals = colData[col.id];
      var nums = numericVals(vals);
      var numRatio = vals.length > 0 ? nums.length / vals.length : 0;
      var uniqueStrings = {};
      var strCount = 0;
      vals.forEach(function (v) {
        if (v !== null && v !== '' && v !== undefined && isNaN(Number(v))) {
          uniqueStrings[String(v)] = true; strCount++;
        }
      });
      var uniqueCount = Object.keys(uniqueStrings).length;

      var type = 'unknown';
      var subtype = null;

      if (LABEL_KW.test(title)) { type = 'label'; }
      else if (DATE_KW.test(title)) { type = 'date'; }
      else if (PRE_KW.test(title)) { type = 'numeric'; subtype = 'pre'; }
      else if (POST_KW.test(title)) { type = 'numeric'; subtype = 'post'; }
      else if (GROUP_KW.test(title)) { type = 'categorical'; }
      else if (numRatio >= 0.7 && nums.length >= 2) { type = 'numeric'; }
      else if (uniqueCount > 0 && uniqueCount <= 12 && strCount > 0) { type = 'categorical'; }
      else if (numRatio >= 0.5) { type = 'numeric'; }
      else { type = 'label'; }

      return { id: col.id, title: col.title || col.id, type: type, subtype: subtype, format: col.format };
    });
  }

  // ========== STATISTICAL HELPERS ==========
  function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : 0; }
  function stdev(a) {
    if (a.length < 2) return 0;
    var m = mean(a), ss = a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0);
    return Math.sqrt(ss / (a.length - 1));
  }
  function percentile(sorted, p) {
    var i = p * (sorted.length - 1), lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }
  function pearsonCorr(x, y) {
    var n = Math.min(x.length, y.length); if (n < 2) return 0;
    var mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
    var num = 0, dx = 0, dy = 0;
    for (var i = 0; i < n; i++) {
      num += (x[i] - mx) * (y[i] - my);
      dx += (x[i] - mx) * (x[i] - mx);
      dy += (y[i] - my) * (y[i] - my);
    }
    var den = Math.sqrt(dx * dy);
    return den ? num / den : 0;
  }

  // ========== FIND LABELS ==========
  function getLabels(colTypes, colData) {
    var labelCol = colTypes.find(function (ct) { return ct.type === 'label'; });
    if (labelCol) return colData[labelCol.id].map(function (v) { return v != null ? String(v) : ''; });
    return colData[colTypes[0].id].map(function (v, i) { return 'Row ' + (i + 1); });
  }

  // ========== FIND PRE/POST PAIRS ==========
  function findPrePostPairs(colTypes) {
    var pre = colTypes.filter(function (ct) { return ct.subtype === 'pre'; });
    var post = colTypes.filter(function (ct) { return ct.subtype === 'post'; });
    var pairs = [];
    pre.forEach(function (p) {
      // Match by removing pre/post keywords and comparing
      var pClean = p.title.toLowerCase().replace(PRE_KW, '').trim();
      var match = post.find(function (q) {
        var qClean = q.title.toLowerCase().replace(POST_KW, '').trim();
        return pClean === qClean || post.length === 1;
      });
      if (match) pairs.push({ pre: p, post: match });
    });
    // If no keyword match, but we have exactly 1 pre and 1 post
    if (pairs.length === 0 && pre.length > 0 && post.length > 0) {
      pairs.push({ pre: pre[0], post: post[0] });
    }
    return pairs;
  }

  // ========== BASE APEX OPTIONS ==========
  function baseApex(type, height) {
    return {
      chart: {
        type: type, height: height || 380,
        background: 'transparent', foreColor: '#94a3b8',
        fontFamily: 'Inter, system-ui, sans-serif',
        toolbar: { show: true, tools: { download: true, selection: false, zoom: false, zoomin: false, zoomout: false, pan: false, reset: false } },
        animations: { enabled: true, easing: 'easeinout', speed: 600 }
      },
      theme: { mode: 'dark' },
      colors: COLORS,
      grid: { borderColor: 'rgba(255,255,255,0.06)', padding: { left: 8, right: 8 } },
      tooltip: { theme: 'dark' },
      legend: { position: 'bottom', fontSize: '12px', labels: { colors: '#94a3b8' } }
    };
  }

  // ========== CHART MAKERS ==========

  function makeGroupedBar(pair, colData, colTypes, labels) {
    var preVals = numericVals(colData[pair.pre.id]);
    var postVals = numericVals(colData[pair.post.id]);
    if (preVals.length < 2 || postVals.length < 2) return null;
    var opts = baseApex('bar');
    opts.series = [
      { name: pair.pre.title, data: preVals },
      { name: pair.post.title, data: postVals }
    ];
    opts.xaxis = { categories: labels.slice(0, preVals.length) };
    opts.plotOptions = { bar: { columnWidth: '55%', borderRadius: 4 } };
    opts.dataLabels = { enabled: false };
    return { chartType: 'apex', title: pair.pre.title + ' vs ' + pair.post.title, subtitle: 'Grouped Bar Comparison', options: opts };
  }

  function makeBoxPlot(pair, colData) {
    var preN = numericVals(colData[pair.pre.id]).sort(function (a, b) { return a - b; });
    var postN = numericVals(colData[pair.post.id]).sort(function (a, b) { return a - b; });
    if (preN.length < 5 || postN.length < 5) return null;
    var opts = baseApex('boxPlot');
    opts.series = [{ data: [
      { x: pair.pre.title, y: [preN[0], percentile(preN, 0.25), percentile(preN, 0.5), percentile(preN, 0.75), preN[preN.length - 1]] },
      { x: pair.post.title, y: [postN[0], percentile(postN, 0.25), percentile(postN, 0.5), percentile(postN, 0.75), postN[postN.length - 1]] }
    ] }];
    opts.plotOptions = { boxPlot: { colors: { upper: COLORS[0], lower: COLORS[1] } } };
    return { chartType: 'apex', title: 'Distribution: ' + pair.pre.title + ' vs ' + pair.post.title, subtitle: 'Box & Whisker Plot', options: opts };
  }

  function makeErrorBarChart(pair, colData) {
    var preN = numericVals(colData[pair.pre.id]);
    var postN = numericVals(colData[pair.post.id]);
    if (preN.length < 2 || postN.length < 2) return null;
    var preMean = mean(preN), postMean = mean(postN);
    var preSD = stdev(preN), postSD = stdev(postN);
    return {
      chartType: 'custom_error_bar',
      title: 'Mean ± SD: ' + pair.pre.title + ' vs ' + pair.post.title,
      subtitle: 'Error Bar Chart',
      data: {
        categories: [pair.pre.title, pair.post.title],
        means: [preMean, postMean],
        sds: [preSD, postSD],
        ns: [preN.length, postN.length],
        colors: [COLORS[0], COLORS[1]]
      }
    };
  }

  function makePairedDotPlot(pair, colData, labels) {
    var preN = numericVals(colData[pair.pre.id]);
    var postN = numericVals(colData[pair.post.id]);
    var n = Math.min(preN.length, postN.length);
    if (n < 3) return null;
    return {
      chartType: 'custom_paired_dot',
      title: 'Individual Changes: ' + pair.pre.title + ' → ' + pair.post.title,
      subtitle: 'Paired Dot Plot',
      data: {
        labels: labels.slice(0, n),
        pre: preN.slice(0, n),
        post: postN.slice(0, n),
        preName: pair.pre.title,
        postName: pair.post.title,
        colors: [COLORS[0], COLORS[1]]
      }
    };
  }

  function makePieChart(ct, colData) {
    var freq = {};
    colData[ct.id].forEach(function (v) {
      if (v !== null && v !== '' && v !== undefined) {
        var key = String(v);
        freq[key] = (freq[key] || 0) + 1;
      }
    });
    var keys = Object.keys(freq);
    if (keys.length < 2 || keys.length > 10) return null;
    var opts = baseApex('pie', 360);
    opts.series = keys.map(function (k) { return freq[k]; });
    opts.labels = keys;
    opts.dataLabels = { enabled: true, style: { fontSize: '13px' }, dropShadow: { enabled: false } };
    opts.stroke = { width: 2, colors: ['#0f0f18'] };
    return { chartType: 'apex', title: ct.title + ' Distribution', subtitle: 'Pie Chart', options: opts };
  }

  function makeDonutChart(ct, colData) {
    var freq = {};
    colData[ct.id].forEach(function (v) {
      if (v !== null && v !== '' && v !== undefined) {
        var key = String(v);
        freq[key] = (freq[key] || 0) + 1;
      }
    });
    var keys = Object.keys(freq);
    if (keys.length < 2 || keys.length > 10) return null;
    var total = keys.reduce(function (s, k) { return s + freq[k]; }, 0);
    var opts = baseApex('donut', 360);
    opts.series = keys.map(function (k) { return freq[k]; });
    opts.labels = keys;
    opts.plotOptions = { pie: { donut: { size: '55%', labels: { show: true, total: { show: true, label: 'Total', formatter: function () { return total; } } } } } };
    opts.dataLabels = { enabled: true, style: { fontSize: '12px' }, dropShadow: { enabled: false } };
    opts.stroke = { width: 2, colors: ['#0f0f18'] };
    return { chartType: 'apex', title: ct.title + ' Breakdown', subtitle: 'Donut Chart', options: opts };
  }

  function makeScatterPlot(ct1, ct2, colData) {
    var x = numericVals(colData[ct1.id]);
    var y = numericVals(colData[ct2.id]);
    var n = Math.min(x.length, y.length);
    if (n < 3) return null;
    var points = [];
    for (var i = 0; i < n; i++) points.push([x[i], y[i]]);
    var r = pearsonCorr(x.slice(0, n), y.slice(0, n));
    var opts = baseApex('scatter');
    opts.series = [{ name: 'Data', data: points }];
    opts.xaxis = { title: { text: ct1.title, style: { fontSize: '12px', color: '#94a3b8' } }, tickAmount: 6 };
    opts.yaxis = { title: { text: ct2.title, style: { fontSize: '12px', color: '#94a3b8' } } };
    opts.markers = { size: 6, strokeWidth: 0 };
    // Add annotation for r value
    opts.annotations = { yaxis: [{ y: mean(y.slice(0, n)), borderColor: 'rgba(124,58,237,0.3)', strokeDashArray: 4, label: { text: 'r = ' + r.toFixed(3), style: { color: '#e2e8f0', background: 'rgba(124,58,237,0.2)', fontSize: '11px', padding: { left: 6, right: 6, top: 2, bottom: 2 } } } }] };
    return { chartType: 'apex', title: ct1.title + ' vs ' + ct2.title, subtitle: 'Scatter Plot (r=' + r.toFixed(3) + ')', options: opts };
  }

  function makeHistogram(ct, colData) {
    var vals = numericVals(colData[ct.id]);
    if (vals.length < 5) return null;
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (min === max) return null;
    var numBins = Math.min(Math.ceil(Math.sqrt(vals.length)), 12);
    var binWidth = (max - min) / numBins;
    var bins = [];
    for (var i = 0; i < numBins; i++) {
      var lo = min + i * binWidth, hi = lo + binWidth;
      var count = vals.filter(function (v) { return v >= lo && (i === numBins - 1 ? v <= hi : v < hi); }).length;
      bins.push({ label: lo.toFixed(1) + '-' + hi.toFixed(1), count: count });
    }
    var opts = baseApex('bar');
    opts.series = [{ name: 'Frequency', data: bins.map(function (b) { return b.count; }) }];
    opts.xaxis = { categories: bins.map(function (b) { return b.label; }), title: { text: ct.title, style: { fontSize: '12px', color: '#94a3b8' } } };
    opts.yaxis = { title: { text: 'Frequency', style: { fontSize: '12px', color: '#94a3b8' } } };
    opts.plotOptions = { bar: { columnWidth: '90%', borderRadius: 2 } };
    opts.dataLabels = { enabled: true, style: { fontSize: '11px' } };
    opts.colors = [COLORS[0]];
    return { chartType: 'apex', title: ct.title + ' Distribution', subtitle: 'Histogram', options: opts };
  }

  function makeRadarChart(numericCols, colData) {
    var cols = numericCols.slice(0, 8);
    var means = cols.map(function (ct) { return mean(numericVals(colData[ct.id])); });
    // Normalize to 0-100 for comparability
    var maxVal = Math.max.apply(null, means);
    var normalized = means.map(function (m) { return maxVal > 0 ? Math.round(m / maxVal * 100) : 0; });
    var opts = baseApex('radar', 400);
    opts.series = [{ name: 'Mean (normalized)', data: normalized }];
    opts.xaxis = { categories: cols.map(function (ct) { return ct.title; }) };
    opts.yaxis = { show: false };
    opts.markers = { size: 4 };
    opts.fill = { opacity: 0.15 };
    opts.stroke = { width: 2 };
    return { chartType: 'apex', title: 'Multi-Variable Overview', subtitle: 'Radar Chart', options: opts };
  }

  function makeHeatmap(numericCols, colData) {
    var cols = numericCols.slice(0, 8);
    if (cols.length < 3) return null;
    var numData = {};
    cols.forEach(function (ct) { numData[ct.id] = numericVals(colData[ct.id]); });
    var series = [];
    cols.forEach(function (rowCol) {
      var row = { name: rowCol.title, data: [] };
      cols.forEach(function (colCol) {
        var r = pearsonCorr(numData[rowCol.id], numData[colCol.id]);
        row.data.push({ x: colCol.title, y: Math.round(r * 100) / 100 });
      });
      series.push(row);
    });
    var opts = baseApex('heatmap', 380);
    opts.series = series;
    opts.plotOptions = { heatmap: { colorScale: { ranges: [
      { from: -1, to: -0.5, color: '#ef4444', name: 'Strong -' },
      { from: -0.5, to: -0.1, color: '#f97316', name: 'Weak -' },
      { from: -0.1, to: 0.1, color: '#6b7280', name: 'None' },
      { from: 0.1, to: 0.5, color: '#06b6d4', name: 'Weak +' },
      { from: 0.5, to: 1, color: '#7c3aed', name: 'Strong +' }
    ] } } };
    opts.dataLabels = { enabled: true, style: { fontSize: '11px' } };
    return { chartType: 'apex', title: 'Correlation Matrix', subtitle: 'Heatmap', options: opts };
  }

  function makeBarChart(catCt, numCt, colData) {
    var catVals = colData[catCt.id];
    var numVals = colData[numCt.id];
    var grouped = {};
    for (var i = 0; i < Math.min(catVals.length, numVals.length); i++) {
      var key = String(catVals[i] || '');
      if (!key) continue;
      if (!grouped[key]) grouped[key] = [];
      var nv = Number(numVals[i]);
      if (!isNaN(nv)) grouped[key].push(nv);
    }
    var keys = Object.keys(grouped);
    if (keys.length < 2 || keys.length > 15) return null;
    var opts = baseApex('bar');
    opts.series = [{ name: 'Mean ' + numCt.title, data: keys.map(function (k) { return Math.round(mean(grouped[k]) * 100) / 100; }) }];
    opts.xaxis = { categories: keys };
    opts.plotOptions = { bar: { columnWidth: '55%', borderRadius: 6, distributed: true } };
    opts.dataLabels = { enabled: true, style: { fontSize: '12px' } };
    return { chartType: 'apex', title: numCt.title + ' by ' + catCt.title, subtitle: 'Bar Chart', options: opts };
  }

  function makeLineChart(dateCt, numericCols, colData) {
    var dateVals = colData[dateCt.id].map(function (v) { return v != null ? String(v) : ''; });
    var series = [];
    numericCols.slice(0, 4).forEach(function (ct) {
      series.push({ name: ct.title, data: numericVals(colData[ct.id]) });
    });
    if (series.length === 0) return null;
    var opts = baseApex('line');
    opts.series = series;
    opts.xaxis = { categories: dateVals.slice(0, series[0].data.length), title: { text: dateCt.title } };
    opts.stroke = { curve: 'smooth', width: 2.5 };
    opts.markers = { size: 4 };
    return { chartType: 'apex', title: 'Trend Over ' + dateCt.title, subtitle: 'Line Chart', options: opts };
  }

  function makeAreaChart(numericCols, colData, labels) {
    var cols = numericCols.slice(0, 3);
    if (cols.length < 1) return null;
    var series = cols.map(function (ct) { return { name: ct.title, data: numericVals(colData[ct.id]) }; });
    var opts = baseApex('area');
    opts.series = series;
    opts.xaxis = { categories: labels.slice(0, series[0].data.length) };
    opts.stroke = { curve: 'smooth', width: 2 };
    opts.fill = { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0.05 } };
    opts.dataLabels = { enabled: false };
    return { chartType: 'apex', title: 'Area Comparison', subtitle: 'Area Chart', options: opts };
  }

  function makeHorizontalBar(catCt, numCt, colData) {
    var catVals = colData[catCt.id];
    var numVals = colData[numCt.id];
    var grouped = {};
    for (var i = 0; i < Math.min(catVals.length, numVals.length); i++) {
      var key = String(catVals[i] || ''); if (!key) continue;
      if (!grouped[key]) grouped[key] = [];
      var nv = Number(numVals[i]); if (!isNaN(nv)) grouped[key].push(nv);
    }
    var keys = Object.keys(grouped);
    if (keys.length < 2 || keys.length > 15) return null;
    var opts = baseApex('bar', 30 * keys.length + 100);
    opts.series = [{ name: numCt.title, data: keys.map(function (k) { return Math.round(mean(grouped[k]) * 100) / 100; }) }];
    opts.xaxis = { categories: keys };
    opts.plotOptions = { bar: { horizontal: true, barHeight: '55%', borderRadius: 4, distributed: true } };
    opts.dataLabels = { enabled: true, style: { fontSize: '12px' } };
    return { chartType: 'apex', title: numCt.title + ' by ' + catCt.title, subtitle: 'Horizontal Bar Chart', options: opts };
  }

  // ========== MAIN ENTRY ==========
  function generateCharts(sheet) {
    if (!sheet || !sheet.columns || !sheet.rows || sheet.rows.length === 0) return [];

    var colData = extractColumnData(sheet);
    var colTypes = detectColumnTypes(sheet, colData);
    var labels = getLabels(colTypes, colData);
    var charts = [];

    // 1. Pre/Post pairs → Grouped Bar, Box Plot, Error Bar, Paired Dot
    var pairs = findPrePostPairs(colTypes);
    pairs.forEach(function (pair) {
      var gb = makeGroupedBar(pair, colData, colTypes, labels); if (gb) charts.push(gb);
      var bp = makeBoxPlot(pair, colData); if (bp) charts.push(bp);
      var eb = makeErrorBarChart(pair, colData); if (eb) charts.push(eb);
      var pd = makePairedDotPlot(pair, colData, labels); if (pd) charts.push(pd);
    });

    // 2. Categorical → Pie + Donut
    var catCols = colTypes.filter(function (ct) { return ct.type === 'categorical'; });
    catCols.forEach(function (ct) {
      var pie = makePieChart(ct, colData); if (pie) charts.push(pie);
      var donut = makeDonutChart(ct, colData); if (donut) charts.push(donut);
    });

    // 3. Numeric columns
    var numCols = colTypes.filter(function (ct) { return ct.type === 'numeric'; });

    // Scatter for numeric pairs (limit to 3 pairs)
    var scatterCount = 0;
    for (var i = 0; i < numCols.length && scatterCount < 3; i++) {
      for (var j = i + 1; j < numCols.length && scatterCount < 3; j++) {
        var sc = makeScatterPlot(numCols[i], numCols[j], colData);
        if (sc) { charts.push(sc); scatterCount++; }
      }
    }

    // Histogram for each numeric column (limit to 4)
    numCols.slice(0, 4).forEach(function (ct) {
      var h = makeHistogram(ct, colData); if (h) charts.push(h);
    });

    // Radar if 3+ numeric cols
    if (numCols.length >= 3) {
      var radar = makeRadarChart(numCols, colData); if (radar) charts.push(radar);
    }

    // Heatmap if 3+ numeric cols
    if (numCols.length >= 3) {
      var hm = makeHeatmap(numCols, colData); if (hm) charts.push(hm);
    }

    // Bar chart for categorical + numeric
    if (catCols.length > 0 && numCols.length > 0) {
      var bar = makeBarChart(catCols[0], numCols[0], colData); if (bar) charts.push(bar);
      if (numCols.length > 1) {
        var hbar = makeHorizontalBar(catCols[0], numCols[1], colData); if (hbar) charts.push(hbar);
      }
    }

    // Line chart for date columns
    var dateCols = colTypes.filter(function (ct) { return ct.type === 'date'; });
    if (dateCols.length > 0 && numCols.length > 0) {
      var line = makeLineChart(dateCols[0], numCols, colData); if (line) charts.push(line);
    }

    // Area chart
    if (numCols.length >= 2) {
      var area = makeAreaChart(numCols, colData, labels); if (area) charts.push(area);
    }

    return charts;
  }

  window.ChartEngine = {
    generateCharts: generateCharts
  };
})();
