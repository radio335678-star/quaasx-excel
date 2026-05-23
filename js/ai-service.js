/**
 * AI Service Module
 * Handles communication with Quaasx API and file processing.
 * Exposes: window.AIService = { callQuaasxAPI, processFile, SYSTEM_PROMPT }
 */
(function () {
  'use strict';

  var SYSTEM_PROMPT = [
    'You are quaasx-excel, an expert AI spreadsheet generator powered by Quaasx Computers with built-in statistical analysis capabilities.',
    'You MUST respond with ONLY valid JSON (no markdown fences, no explanations).',
    '',
    'JSON SCHEMA:',
    '{',
    '  "title": "Workbook Title",',
    '  "sheets": [{',
    '    "name": "Sheet Name",',
    '    "columns": [',
    '      { "id": "col_0", "title": "Header", "width": 20, "format": "text" },',
    '      { "id": "col_3", "title": "Computed", "width": 15, "format": "number", "formula": "col_1 - col_2" }',
    '    ],',
    '    "rows": [{ "id": "row_0", "cells": { "col_0": { "value": "data", "style": {} } } }],',
    '    "summaryRows": [',
    '      { "id": "sum_0", "label": "Mean", "cells": { "col_1": { "formula": "AVERAGE(@col_1)" } }, "style": { "bold": true, "bg": "#e8eaf6" } }',
    '    ],',
    '    "headerStyle": { "bg": "#1a237e", "color": "#ffffff", "bold": true }',
    '  }]',
    '}',
    '',
    'FORMULA SYSTEM — USE FORMULAS FOR ALL COMPUTED VALUES:',
    '- Cell formula: { "formula": "col_1 * col_2" } — evaluated live, recalculates on edit',
    '- Column formula: column.formula = "col_2 - col_1" — applies to every data row',
    '- Summary row formula: { "formula": "AVERAGE(@col_1)" } — aggregates over all data rows',
    '- Reference syntax: col_id = current row value, @col_id = all values in column (array)',
    '- NEVER hardcode a computed value. Use a formula instead.',
    '',
    'AVAILABLE FUNCTIONS:',
    'Math: SUM, AVERAGE, COUNT, COUNTA, MIN, MAX, ABS, ROUND, CEILING, FLOOR, POWER, SQRT, LOG, LN, EXP',
    'Descriptive: STDEV, STDEVP, VAR, VARP, MEDIAN, MODE, PERCENTILE, QUARTILE, IQR, RANK, PERCENTRANK, SKEW, KURT, SEM, CV',
    'Inferential: TTEST_P(@r1,@r2,tails), TTEST_T(@r1,@r2), TTEST_INDEP_P(@r1,@r2,tails), CHITEST_P(@obs,@exp), CHITEST_STAT(@obs,@exp), FTEST_P(@r1,@r2), ANOVA_F(@g1,@g2,...), ANOVA_P(@g1,@g2,...)',
    'Correlation: CORREL(@r1,@r2), CORREL_P(@r1,@r2), SPEARMAN(@r1,@r2), RSQ(@y,@x), SLOPE(@y,@x), INTERCEPT(@y,@x)',
    'Effect Size: COHENS_D(@r1,@r2), CONFIDENCE_T(alpha,stdev,n), CONFIDENCE_NORM(alpha,stdev,n)',
    'Non-parametric: MANN_WHITNEY_U(@r1,@r2), MANN_WHITNEY_P(@r1,@r2), WILCOXON_T(@r1,@r2), WILCOXON_P(@r1,@r2)',
    'Clinical: SENSITIVITY(TP,FN), SPECIFICITY(TN,FP), PPV(TP,FP), NPV_CLINICAL(TN,FN), ACCURACY(TP,TN,FP,FN), ODDS_RATIO(a,b,c,d), RELATIVE_RISK(a,b,c,d), NNT(CER,EER), ARR(CER,EER), BMI(wt_kg,ht_m), BSA(wt_kg,ht_cm)',
    'Financial: NPV_FIN(rate,@cf), IRR(@cf), PMT(rate,nper,pv), FV(rate,nper,pmt), PV(rate,nper,fv), CAGR(start,end,years), ROI(gain,cost), BREAKEVEN(fixed,price,vc), MARGIN(rev,cost), MARKUP(cost,price)',
    'Engineering: PROCESS_CP(USL,LSL,stdev), PROCESS_CPK(USL,LSL,mean,stdev), UCL(@r), LCL(@r), SNR(sig,noise), RMSE(@actual,@pred), MAE(@actual,@pred), MAPE(@actual,@pred)',
    'Logical: IF(cond,true,false), AND, OR, NOT, IFERROR(val,fallback), ISBLANK, ISNUMBER',
    'Utility: SIGNIFICANCE(p_value) → returns ***, **, *, or NS; DF(@range) → n-1',
    '',
    'STATISTICAL TEST SELECTION — auto-detect from context:',
    '- 2 groups, continuous, paired (before/after) → TTEST_P (paired), or WILCOXON_P for ordinal/non-normal',
    '- 2 groups, continuous, independent → TTEST_INDEP_P, or MANN_WHITNEY_P for non-parametric',
    '- 3+ groups comparison → ANOVA_F + ANOVA_P',
    '- 2 categorical variables → CHITEST_P + CHITEST_STAT',
    '- Relationship between 2 continuous → CORREL + CORREL_P, or SPEARMAN for ordinal',
    '- Prediction/regression → SLOPE + INTERCEPT + RSQ',
    '- Diagnostic test → SENSITIVITY, SPECIFICITY, PPV, NPV_CLINICAL, ACCURACY',
    '- Treatment effect → COHENS_D, NNT, ODDS_RATIO, RELATIVE_RISK',
    '',
    'DOMAIN RULES:',
    '- Medical/Clinical/Ayurveda/Homeopathy/Siddha/Unani/AYUSH thesis: Use non-parametric tests (Wilcoxon, Mann-Whitney) for symptom scores, Likert scales, ordinal data. Use paired tests for before/after treatment. Always include: Descriptive stats (Mean±SD), SEM, 95% CI, p-value, significance markers (*/NS), effect size (Cohen d).',
    '- Engineering: Use regression, process capability (Cp/Cpk), control limits (UCL/LCL), RMSE/MAE for model accuracy.',
    '- Business/Finance: Use CAGR, ROI, NPV, IRR, break-even analysis, margin/markup calculations.',
    '- PhD/Research: Always create multi-sheet workbooks: Sheet 1=Raw Data, Sheet 2=Descriptive Statistics (with formulas), Sheet 3=Inferential Statistics (with test results), Sheet 4=Summary Table (publication-ready).',
    '',
    'FORMATTING & PREMIUM STYLE RULES:',
    '- ALWAYS use premium, professionally tailored color palettes (e.g., Cobalt & Slate, Forest & Emerald, Obsidian & Gold, Indigo & Cool Lavender, Deep Teal & Amber, Charcoal & Warm Sand). Avoid raw primary/neon colors.',
    '- STRICT CONTRAST RULES: ALWAYS enforce readable text-to-background contrast. If a cell or header background is dark/saturated (e.g. `#1a237e`, `#1b5e20`, `#3e2723`), the text color MUST be white (`#ffffff`). If the background is light/pastel, the text color MUST be dark charcoal or black (`#1e293b` or `#000000`).',
    '- ZEBRA STRIPING: Apply subtle alternating row backgrounds for all data rows to enhance legibility (e.g., alternating between white `#ffffff` and a very light grey/tint like `#f8fafc`).',
    '- CELL ALIGNMENT: Align data types professionally. Numbers and statistics MUST be right-aligned (`"align": "right"`). Text labels, names, and titles should be left-aligned (`"align": "left"`) or centered (`"align": "center"`).',
    '- HIGHLIGHTS & SUMMARY: For significance markers, p-values, or summary rows, use soft pastel color fills (e.g. light green `#e8f5e9` with dark green text `#2e7d32` for success/positive values; light red `#ffebee` with dark red text `#c62828` for negative values) to highlight key findings cleanly without color mismatch.',
    '- Computed values use ROUND() to 2 decimals for means/SD, 3 for p-values, 4 for correlations',
    '- Significance markers: * (p<0.05), ** (p<0.01), *** (p<0.001), NS (not significant)',
    '- Summary/statistics rows use summaryRows array with formulas and bold styling',
    '- Column IDs: col_0, col_1, etc. Row IDs: row_0, row_1, etc.',
    '- Generate realistic, domain-appropriate sample data. IMPORTANT: If the user uploads documents or images containing actual tables, values, list items, or numbers, you MUST extract and use these EXACT real values and labels as they are, without fabricating fake or mock data.',
    '- When given existing JSON + modification request, return COMPLETE updated JSON'
  ].join('\n');

  /**
   * Process an uploaded file and return its content in a standardized format.
   * @param {File} file - The File object to process
   * @returns {Promise<{type: string, content: string, name: string}>}
   */
  async function processFile(file) {
    // Image files
    if (file.type.startsWith('image/')) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          resolve({ type: 'image', content: reader.result, name: file.name });
        };
        reader.onerror = function () {
          reject(new Error('Failed to read image file: ' + file.name));
        };
        reader.readAsDataURL(file);
      });
    }

    // PDF files are completely unsupported
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      throw new Error('PDF file uploads are not supported. Please upload Word documents (.doc, .docx) or images instead.');
    }

    // Word documents
    if (file.type.includes('word') || file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc')) {
      var ab = await file.arrayBuffer();
      var response = await fetch('/api/parse-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name)
        },
        body: ab
      });
      if (!response.ok) {
        throw new Error('Failed to parse document on server: status ' + response.status);
      }
      var data = await response.json();
      return { type: 'text', content: data.text, name: file.name };
    }

    // Default: read as plain text
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve({ type: 'text', content: reader.result, name: file.name });
      };
      reader.onerror = function () {
        reject(new Error('Failed to read file: ' + file.name));
      };
      reader.readAsText(file);
    });
  }

  // Quaasx API Abstractions
  var QUAASX_MODEL_ID = 'quaasx-cognitive-4';

  function getGatewayConfig(apiKey) {
    if (apiKey && apiKey.startsWith('nvapi-')) {
      return {
        url: 'https://integrate.api.nvidia.com/v1/chat/completions',
        provider: 'nvidia'
      };
    }
    return {
      url: 'https://api.moonshot.ai/v1/chat/completions',
      provider: 'moonshot'
    };
  }

  function getActualModelId(id, provider) {
    if (id === 'quaasx-cognitive-4' || id === 'quaasx-cognitive-ultra' || id === 'quaasx-cognitive-speed') {
      return provider === 'nvidia' ? 'moonshotai/kimi-k2.6' : 'kimi-k2.6';
    }
    return id;
  }

  function getRequestTarget(configUrl) {
    if (window.location.protocol !== 'file:') {
      return {
        url: '/api/proxy',
        isProxy: true
      };
    }
    return {
      url: configUrl,
      isProxy: false
    };
  }


  /**
   * Call the Quaasx API.
   * @param {string} apiKey - The Quaasx API key
   * @param {Array} messages - Array of message objects { role, content }
   * @returns {Promise<string>} - The assistant's response content
   */
  async function callQuaasxAPI(apiKey, messages) {
    var config = getGatewayConfig(apiKey);
    var target = getRequestTarget(config.url);
    
    var fetchUrl = target.url;
    var fetchHeaders = {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    };
    var fetchBody = {
      model: getActualModelId(QUAASX_MODEL_ID, config.provider),
      messages: messages,
      temperature: 1.0
    };

    if (target.isProxy) {
      fetchHeaders = { 'Content-Type': 'application/json' };
      fetchBody = {
        url: config.url,
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: fetchBody
      };
    }

    var response;
    try {
      response = await fetch(fetchUrl, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify(fetchBody)
      });
    } catch (err) {
      throw new Error('Network error calling Quaasx API: ' + err.message);
    }

    if (!response.ok) {
      var errorText = '';
      try {
        errorText = await response.text();
      } catch (_) {
        errorText = 'Unable to read error response body';
      }
      throw new Error('Quaasx API error (status ' + response.status + '): ' + errorText);
    }

    var data;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error('Failed to parse Quaasx API response as JSON: ' + err.message);
    }

    if (!data.choices || !data.choices[0] || !data.choices[0].message || typeof data.choices[0].message.content !== 'string') {
      throw new Error('Unexpected Quaasx API response structure: ' + JSON.stringify(data));
    }

    return data.choices[0].message.content;
  }

  /**
   * Call the Quaasx API with streaming enabled.
   * @param {string} apiKey - The Quaasx API key
   * @param {Array} messages - Array of message objects { role, content }
   * @param {Object} callbacks - { onThinking(chunk, full), onContent(chunk, full) }
   * @param {AbortSignal} abortSignal - AbortController signal to cancel the stream
   * @returns {Promise<{content: string, thinking: string}>}
   */
  async function callQuaasxAPIStream(apiKey, messages, callbacks, abortSignal) {
    var config = getGatewayConfig(apiKey);
    var actualModel = getActualModelId(QUAASX_MODEL_ID, config.provider);
    var target = getRequestTarget(config.url);
    
    var fetchUrl = target.url;
    var fetchHeaders = {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    };
    var fetchBody = {
      model: actualModel,
      messages: messages,
      temperature: 1.0,
      stream: true
    };

    if (target.isProxy) {
      fetchHeaders = { 'Content-Type': 'application/json' };
      fetchBody = {
        url: config.url,
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: fetchBody
      };
    }

    if (window.logTelemetry) {
      window.logTelemetry('[SYS] Invoking Quaasx Computers cognitive core (Model: ' + QUAASX_MODEL_ID + ' / ' + actualModel + ')...', 'system');
      if (target.isProxy) {
        window.logTelemetry('[SYS] Bypassing CORS via local proxy server...', 'system');
      }
      window.logTelemetry('[SYS] Request size: ' + JSON.stringify(messages).length + ' bytes. Initializing stream...', 'system');
    }

    var response;
    try {
      response = await fetch(fetchUrl, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify(fetchBody),
        signal: abortSignal
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        if (window.logTelemetry) window.logTelemetry('[SYS] Request aborted by user.', 'error-line');
        throw err;
      }
      if (window.logTelemetry) window.logTelemetry('[ERR] Network error: ' + err.message, 'error-line');
      throw new Error('Network error calling Quaasx API: ' + err.message);
    }

    if (!response.ok) {
      var errorText = '';
      try {
        errorText = await response.text();
      } catch (_) {
        errorText = 'Unable to read error response body';
      }
      if (window.logTelemetry) window.logTelemetry('[ERR] API error (status ' + response.status + '): ' + errorText, 'error-line');
      throw new Error('Quaasx API error (status ' + response.status + '): ' + errorText);
    }

    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var fullContent = '';
    var fullThinking = '';
    var reasoningStarted = false;
    var contentStarted = false;

    while (true) {
      var readResult;
      try {
        readResult = await reader.read();
      } catch (err) {
        if (err.name === 'AbortError') {
          if (window.logTelemetry) window.logTelemetry('[SYS] Request aborted by user.', 'error-line');
          throw err;
        }
        if (window.logTelemetry) window.logTelemetry('[ERR] Stream read error: ' + err.message, 'error-line');
        throw new Error('Stream read error: ' + err.message);
      }

      if (readResult.done) break;

      buffer += decoder.decode(readResult.value, { stream: true });

      var lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || !line.startsWith('data: ')) continue;

        var data = line.slice(6);
        if (data === '[DONE]') {
          if (window.logTelemetry) {
            window.logTelemetry('[SYS] Stream completed. Received ' + fullContent.length + ' bytes of workbook schema payload.', 'success-line');
          }
          return { content: fullContent, thinking: fullThinking };
        }

        try {
          var parsed = JSON.parse(data);
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
            var delta = parsed.choices[0].delta;

            if (delta.reasoning_content) {
              if (!reasoningStarted) {
                reasoningStarted = true;
                if (window.logTelemetry) window.logTelemetry('[SYS] Cognitive core stream active: processing reasoning path...', 'api-info');
              }
              fullThinking += delta.reasoning_content;
              if (callbacks && callbacks.onThinking) {
                callbacks.onThinking(delta.reasoning_content, fullThinking);
              }
            }

            if (delta.content) {
              if (!contentStarted) {
                contentStarted = true;
                if (window.logTelemetry) window.logTelemetry('[SYS] Synthesizing spreadsheet structure...', 'api-info');
              }
              fullContent += delta.content;
              if (callbacks && callbacks.onContent) {
                callbacks.onContent(delta.content, fullContent);
              }
            }
          }
        } catch (e) {
          // Skip malformed SSE chunks
        }
      }
    }

    if (window.logTelemetry) {
      window.logTelemetry('[SYS] Stream closed. Total payload size: ' + fullContent.length + ' bytes.', 'success-line');
    }
    return { content: fullContent, thinking: fullThinking };
  }

  // Expose on window
  window.AIService = {
    callQuaasxAPI: callQuaasxAPI,
    callQuaasxAPIStream: callQuaasxAPIStream,
    processFile: processFile,
    SYSTEM_PROMPT: SYSTEM_PROMPT,
    setModelId: function (modelId) {
      QUAASX_MODEL_ID = modelId;
    },
    getModelId: function () {
      return QUAASX_MODEL_ID;
    }
  };
})();
