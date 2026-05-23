/**
 * Chart Renderer — Renders chart configs from ChartEngine into the DOM.
 * Uses ApexCharts for standard charts, custom SVG for research-specific charts.
 * Exposes: window.ChartRenderer = { renderAll, destroyAll, downloadChartSVG }
 */
(function () {
  'use strict';

  var activeCharts = []; // Track ApexChart instances for cleanup

  /**
   * Destroy all active chart instances (prevents memory leaks on re-render).
   */
  function destroyAll() {
    activeCharts.forEach(function (c) { try { c.destroy(); } catch (e) {} });
    activeCharts = [];
  }

  /**
   * Render all chart configs into a container element.
   * @param {Array} configs - Array from ChartEngine.generateCharts()
   * @param {HTMLElement} container - The charts container DOM element
   */
  function renderAll(configs, container) {
    destroyAll();
    container.innerHTML = '';

    if (!configs || configs.length === 0) {
      container.innerHTML = '<div class="charts-empty"><div class="charts-empty-icon">📊</div><h3>No charts available</h3><p>Generate a spreadsheet with data first, then charts will appear automatically.</p></div>';
      return;
    }

    configs.forEach(function (config, idx) {
      var card = createChartCard(config, idx);
      container.appendChild(card);

      var chartArea = card.querySelector('.chart-area');

      if (config.chartType === 'apex' && config.options) {
        renderApexChart(config.options, chartArea, idx);
      } else if (config.chartType === 'custom_error_bar') {
        renderErrorBarSVG(config.data, chartArea);
      } else if (config.chartType === 'custom_paired_dot') {
        renderPairedDotSVG(config.data, chartArea);
      }
    });
  }

  /**
   * Create a premium chart card element.
   */
  function createChartCard(config, idx) {
    var card = document.createElement('div');
    card.className = 'chart-card';
    card.style.animationDelay = (idx * 0.06) + 's';

    // Header
    var header = document.createElement('div');
    header.className = 'chart-card-header';

    var titleArea = document.createElement('div');
    titleArea.className = 'chart-title-area';

    var title = document.createElement('h3');
    title.className = 'chart-title';
    title.textContent = config.title || 'Chart';

    var subtitle = document.createElement('span');
    subtitle.className = 'chart-subtitle';
    subtitle.textContent = config.subtitle || '';

    titleArea.appendChild(title);
    titleArea.appendChild(subtitle);

    var downloadBtn = document.createElement('button');
    downloadBtn.className = 'chart-download-btn';
    downloadBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> SVG';
    downloadBtn.title = 'Download as SVG';
    downloadBtn.addEventListener('click', function () {
      downloadChartSVG(card, config.title || 'chart');
    });

    header.appendChild(titleArea);
    header.appendChild(downloadBtn);

    // Chart area
    var chartArea = document.createElement('div');
    chartArea.className = 'chart-area';
    chartArea.id = 'chart-area-' + idx;

    card.appendChild(header);
    card.appendChild(chartArea);

    return card;
  }

  /**
   * Render an ApexChart into an element.
   */
  function renderApexChart(options, element, idx) {
    if (typeof ApexCharts === 'undefined') {
      element.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:40px;">ApexCharts not loaded</p>';
      return;
    }

    try {
      var chart = new ApexCharts(element, options);
      chart.render();
      activeCharts.push(chart);
    } catch (e) {
      element.innerHTML = '<p style="color:#ef4444;text-align:center;padding:40px;">Chart render error</p>';
    }
  }

  // ================================================================
  //  CUSTOM SVG CHARTS — Research Specific
  // ================================================================

  /**
   * Error Bar Chart — Mean ± SD with bars and whiskers.
   */
  function renderErrorBarSVG(data, container) {
    var w = 400, h = 320, pad = { top: 30, right: 30, bottom: 50, left: 60 };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var allVals = [];
    data.means.forEach(function (m, i) {
      allVals.push(m - data.sds[i], m + data.sds[i]);
    });
    var yMin = Math.min.apply(null, allVals);
    var yMax = Math.max.apply(null, allVals);
    var yRange = yMax - yMin || 1;
    yMin -= yRange * 0.15;
    yMax += yRange * 0.15;
    yRange = yMax - yMin;

    function yScale(v) { return pad.top + plotH - ((v - yMin) / yRange) * plotH; }

    var barW = Math.min(60, plotW / data.categories.length / 1.8);

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:100%;">';

    // Y-axis grid
    var yTicks = 5;
    for (var t = 0; t <= yTicks; t++) {
      var val = yMin + (yRange * t / yTicks);
      var y = yScale(val);
      svg += '<line x1="' + pad.left + '" y1="' + y + '" x2="' + (w - pad.right) + '" y2="' + y + '" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
      svg += '<text x="' + (pad.left - 8) + '" y="' + (y + 4) + '" fill="#94a3b8" font-size="11" text-anchor="end">' + val.toFixed(1) + '</text>';
    }

    // Bars and error whiskers
    data.categories.forEach(function (cat, i) {
      var cx = pad.left + (i + 0.5) * (plotW / data.categories.length);
      var m = data.means[i], sd = data.sds[i];
      var barTop = yScale(m);
      var barBot = yScale(0 > yMin ? 0 : yMin);
      var barH = barBot - barTop;
      var color = data.colors[i] || '#7c3aed';

      // Bar
      svg += '<rect x="' + (cx - barW / 2) + '" y="' + barTop + '" width="' + barW + '" height="' + Math.max(barH, 1) + '" fill="' + color + '" rx="4" opacity="0.8"/>';

      // Error whisker
      var errTop = yScale(m + sd);
      var errBot = yScale(m - sd);
      var capW = barW * 0.5;
      svg += '<line x1="' + cx + '" y1="' + errTop + '" x2="' + cx + '" y2="' + errBot + '" stroke="#e2e8f0" stroke-width="2"/>';
      svg += '<line x1="' + (cx - capW / 2) + '" y1="' + errTop + '" x2="' + (cx + capW / 2) + '" y2="' + errTop + '" stroke="#e2e8f0" stroke-width="2"/>';
      svg += '<line x1="' + (cx - capW / 2) + '" y1="' + errBot + '" x2="' + (cx + capW / 2) + '" y2="' + errBot + '" stroke="#e2e8f0" stroke-width="2"/>';

      // Mean value label
      svg += '<text x="' + cx + '" y="' + (barTop - 8) + '" fill="#e2e8f0" font-size="12" font-weight="600" text-anchor="middle">' + m.toFixed(2) + '</text>';

      // Category label
      svg += '<text x="' + cx + '" y="' + (h - pad.bottom + 20) + '" fill="#94a3b8" font-size="12" text-anchor="middle">' + cat + '</text>';

      // SD label
      svg += '<text x="' + cx + '" y="' + (h - pad.bottom + 36) + '" fill="#64748b" font-size="10" text-anchor="middle">SD: ' + sd.toFixed(2) + '</text>';
    });

    // Y-axis label
    svg += '<text x="15" y="' + (pad.top + plotH / 2) + '" fill="#94a3b8" font-size="11" text-anchor="middle" transform="rotate(-90 15 ' + (pad.top + plotH / 2) + ')">Value</text>';

    svg += '</svg>';
    container.innerHTML = svg;
  }

  /**
   * Paired Dot Plot — Before/After connected dots per subject.
   */
  function renderPairedDotSVG(data, container) {
    var n = data.pre.length;
    var w = Math.max(400, n * 32 + 120), h = 340;
    var pad = { top: 35, right: 30, bottom: 55, left: 55 };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var allVals = data.pre.concat(data.post);
    var yMin = Math.min.apply(null, allVals);
    var yMax = Math.max.apply(null, allVals);
    var yRange = yMax - yMin || 1;
    yMin -= yRange * 0.1;
    yMax += yRange * 0.1;
    yRange = yMax - yMin;

    function yScale(v) { return pad.top + plotH - ((v - yMin) / yRange) * plotH; }

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:100%;">';

    // Grid
    for (var t = 0; t <= 5; t++) {
      var val = yMin + (yRange * t / 5);
      var y = yScale(val);
      svg += '<line x1="' + pad.left + '" y1="' + y + '" x2="' + (w - pad.right) + '" y2="' + y + '" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>';
      svg += '<text x="' + (pad.left - 8) + '" y="' + (y + 4) + '" fill="#94a3b8" font-size="10" text-anchor="end">' + val.toFixed(1) + '</text>';
    }

    // Connecting lines and dots
    for (var i = 0; i < n; i++) {
      var cx = pad.left + (i + 0.5) * (plotW / n);
      var yPre = yScale(data.pre[i]);
      var yPost = yScale(data.post[i]);
      var increased = data.post[i] > data.pre[i];
      var lineColor = increased ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)';

      // Connecting line
      svg += '<line x1="' + cx + '" y1="' + yPre + '" x2="' + cx + '" y2="' + yPost + '" stroke="' + lineColor + '" stroke-width="2" stroke-dasharray="3,2"/>';

      // Pre dot
      svg += '<circle cx="' + cx + '" cy="' + yPre + '" r="5" fill="' + data.colors[0] + '" stroke="#0f0f18" stroke-width="1.5"/>';
      // Post dot
      svg += '<circle cx="' + cx + '" cy="' + yPost + '" r="5" fill="' + data.colors[1] + '" stroke="#0f0f18" stroke-width="1.5"/>';

      // Label
      var label = data.labels[i] || '' + (i + 1);
      if (label.length > 5) label = label.substring(0, 5);
      svg += '<text x="' + cx + '" y="' + (h - pad.bottom + 16) + '" fill="#64748b" font-size="9" text-anchor="middle">' + label + '</text>';
    }

    // Legend
    var lx = pad.left + 10;
    svg += '<circle cx="' + lx + '" cy="15" r="5" fill="' + data.colors[0] + '"/>';
    svg += '<text x="' + (lx + 10) + '" y="19" fill="#94a3b8" font-size="11">' + data.preName + '</text>';
    var lx2 = lx + 10 + data.preName.length * 7 + 20;
    svg += '<circle cx="' + lx2 + '" cy="15" r="5" fill="' + data.colors[1] + '"/>';
    svg += '<text x="' + (lx2 + 10) + '" y="19" fill="#94a3b8" font-size="11">' + data.postName + '</text>';

    svg += '</svg>';
    container.innerHTML = '<div style="overflow-x:auto;">' + svg + '</div>';
  }

  // ================================================================
  //  SVG DOWNLOAD
  // ================================================================

  /**
   * Download the SVG from a chart card.
   */
  function downloadChartSVG(cardEl, title) {
    var svgEl = cardEl.querySelector('svg');
    if (!svgEl) {
      // ApexCharts — find SVG inside the chart area
      var chartArea = cardEl.querySelector('.chart-area');
      if (chartArea) svgEl = chartArea.querySelector('svg');
    }
    if (!svgEl) return;

    // Clone and add white text styling for export (since bg will be transparent)
    var clone = svgEl.cloneNode(true);
    // Add a dark background rect for export readability
    var bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', '#0f0f18');
    clone.insertBefore(bg, clone.firstChild);

    var svgData = new XMLSerializer().serializeToString(clone);
    var blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    var fileName = (title || 'chart').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_') + '.svg';

    if (typeof saveAs !== 'undefined') {
      saveAs(blob, fileName);
    } else {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  // Expose
  window.ChartRenderer = {
    renderAll: renderAll,
    destroyAll: destroyAll,
    downloadChartSVG: downloadChartSVG
  };
})();
