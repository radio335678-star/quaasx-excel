const https = require('https');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RESEARCH_KEYWORDS = [
  // General & Real-time
  'latest', 'recent', 'current', 'stock', 'price', 'trends', 
  '2025', '2026', 'inflation', 'gdp', 'news', 'weather', 
  'realtime', 'real-time', 'today', 'live', 'market',
  
  // Medical, Allopathy & AYUSH (Ayurveda, Yoga, Unani, Siddha, Homeopathy)
  'clinical trials', 'allopathy', 'ayurveda', 'homeopathy', 'siddha', 'unani', 
  'ayush', 'herbal formulation', 'pharmacology', 'pharma', 'efficacy', 
  'randomized controlled', 'placebo', 'dosage', 'symptoms', 'patient outcomes',
  'treatment efficacy', 'toxicity profile', 'therapeutic', 'cohort study',
  
  // PG & PhD Research / Academics
  'dissertation', 'thesis', 'questionnaire', 'literature review', 
  'p-value', 'hypothesis', 'anova', 'chi-square', 'demographics', 
  'survey results', 'regression analysis', 'statistical validation', 
  'sample size', 'methodology', 'academic research', 'correlation matrix',
  
  // Engineering & Quality Control
  'engineering analysis', 'finite element', 'stress analysis', 'thermal tolerance', 
  'cpk index', 'control limits', 'ucl lcl', 'process capability', 'rmse', 
  'quality control', 'simulation parameters', 'experimental validation', 'tensile strength'
];

const SYSTEM_PROMPT = [
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
  '- Medical/Clinical/Allopathy/Ayurveda/Homeopathy/Siddha/Unani/AYUSH thesis: Use non-parametric tests (Wilcoxon, Mann-Whitney) for symptom scores, Likert scales, ordinal data. Use paired tests for before/after treatment. Always include: Descriptive stats (Mean±SD), SEM, 95% CI, p-value, significance markers (*/NS), effect size (Cohen d).',
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

function detectSearchIntent(query) {
  if (!query) return false;
  const q = query.toLowerCase();
  for (let i = 0; i < RESEARCH_KEYWORDS.length; i++) {
    if (q.indexOf(RESEARCH_KEYWORDS[i]) !== -1) {
      return true;
    }
  }
  return false;
}

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
  return provider === 'nvidia' ? 'moonshotai/kimi-k2.6' : 'kimi-k2.6';
}

async function conductResearch(query) {
  return new Promise((resolve) => {
    const searchUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
    const parsedUrl = new URL(searchUrl);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    };

    const searchReq = https.request(options, (searchRes) => {
      let html = '';
      searchRes.on('data', chunk => { html += chunk; });
      searchRes.on('end', () => {
        try {
          const results = [];
          const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
          const titleMatchRegex = /<a class="result__link"[^>]*>([\s\S]*?)<\/a>/g;
          
          let match;
          const snippets = [];
          while ((match = snippetRegex.exec(html)) !== null) {
            const cleanText = match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            if (cleanText) snippets.push(cleanText);
          }

          const titles = [];
          while ((match = titleMatchRegex.exec(html)) !== null) {
            const cleanTitle = match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            if (cleanTitle) titles.push(cleanTitle);
          }

          for (let i = 0; i < Math.min(snippets.length, 5); i++) {
            results.push({
              title: titles[i] || 'Search Result ' + (i + 1),
              snippet: snippets[i]
            });
          }

          if (results.length === 0) {
            resolve('');
            return;
          }

          const factSheet = [
            '=================================================================',
            'REAL-TIME WEB RESEARCH FINDINGS (INJECTED VERIFIED LIVE CONTEXT):',
            'The Research Agent scraped the web and found the following facts. Use them as the definitive truth to build the spreadsheet data:',
            ''
          ];

          results.forEach(function (res, index) {
            factSheet.push((index + 1) + '. [' + res.title + ']');
            factSheet.push('   Snippet: ' + res.snippet);
            factSheet.push('');
          });

          factSheet.push('=================================================================');
          resolve(factSheet.join('\n'));
        } catch (err) {
          resolve('');
        }
      });
    });

    searchReq.on('error', () => {
      resolve('');
    });

    searchReq.end();
  });
}

function buildAgentUserContent(prompt, attachedFiles) {
  const hasImageFiles = attachedFiles && attachedFiles.some(f => f.type === 'image');
  const textParts = [];

  if (attachedFiles) {
    attachedFiles.forEach(f => {
      if (f.type === 'text') {
        textParts.push('Content from uploaded file ' + f.name + ':\n' + f.content);
      }
    });
  }

  if (prompt) {
    textParts.push(prompt);
  }

  const combinedText = textParts.join('\n\n');

  if (hasImageFiles) {
    const contentParts = [];
    if (combinedText) {
      contentParts.push({ type: 'text', text: combinedText });
    }
    attachedFiles.forEach(f => {
      if (f.type === 'image') {
        contentParts.push({
          type: 'image_url',
          image_url: { url: f.content }
        });
      }
    });
    return contentParts;
  }

  return combinedText;
}

async function callQuaasxAPI(apiKey, messages, temperature) {
  const config = getGatewayConfig(apiKey);
  const actualModel = getActualModelId('quaasx-cognitive-4', config.provider);
  const fetchBody = {
    model: actualModel,
    messages: messages,
    temperature: parseFloat(temperature) || 1.0
  };

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(fetchBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('LLM API returned error status ' + response.status + ': ' + errorText);
  }

  const data = await response.json();
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Unexpected LLM API response structure');
  }
  return data.choices[0].message.content;
}

async function callQuaasxAPIStream(apiKey, messages, onThinking, onContent, temperature) {
  const config = getGatewayConfig(apiKey);
  const actualModel = getActualModelId('quaasx-cognitive-4', config.provider);
  const fetchBody = {
    model: actualModel,
    messages: messages,
    temperature: parseFloat(temperature) || 1.0,
    stream: true
  };

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(fetchBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('LLM API returned error status ' + response.status + ': ' + errorText);
  }

  let fullContent = '';
  let fullThinking = '';
  let buffer = '';
  const decoder = new TextDecoder();

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6);
      if (data === '[DONE]') {
        break;
      }

      try {
        const parsed = JSON.parse(data);
        if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
          const delta = parsed.choices[0].delta;
          if (delta.reasoning_content) {
            fullThinking += delta.reasoning_content;
            onThinking(delta.reasoning_content);
          }
          if (delta.content) {
            fullContent += delta.content;
            onContent(delta.content);
          }
        }
      } catch (e) {
        // Skip malformed SSE chunks
      }
    }
  }

  return { content: fullContent, thinking: fullThinking };
}

function tryParseJSON(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed.sheets || !Array.isArray(parsed.sheets)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

module.exports = async (req, res) => {
  // CORS & Server-Sent Events headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });

  const sendSSE = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  if (req.method === 'OPTIONS') {
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendSSE('error', { message: 'Method not allowed' });
    res.end();
    return;
  }

  try {
    const { apiKey, prompt, mode, attachedFiles, temperature } = req.body;
    const effectiveApiKey = apiKey || process.env.NVIDIA_API_KEY || process.env.MOONSHOT_API_KEY || process.env.QUAASX_API_KEY;
    if (!effectiveApiKey) {
      sendSSE('error', { message: 'API key is required. Please set it in Vercel environment variables (NVIDIA_API_KEY or MOONSHOT_API_KEY) or enter it in the client.' });
      res.end();
      return;
    }

    // ==========================================
    // STEP 1: INTENT & RESEARCH AGENT
    // ==========================================
    let searchContext = '';
    const requiresResearch = detectSearchIntent(prompt);
    if (requiresResearch) {
      sendSSE('status', { statusText: 'Conducting real-time web research...', agentName: 'Research Scraper 🔍' });
      sendSSE('telemetry', { text: '[RESEARCH_AGENT] Query requires live data. Executing web search proxy...', class: 'api-info' });
      searchContext = await conductResearch(prompt);
      if (searchContext) {
        sendSSE('telemetry', { text: '[RESEARCH_AGENT] Web search completed. Injected live context facts into compiler.', class: 'success-line' });
      } else {
        sendSSE('telemetry', { text: '[RESEARCH_AGENT] No live search results returned, proceeding with static intelligence.', class: 'system' });
      }
    }

    // ==========================================
    // STEP 2: PLANNER AGENT
    // ==========================================
    sendSSE('status', { statusText: 'Decomposing workbook structure...', agentName: 'Planner Agent 📋' });
    sendSSE('telemetry', { text: '[PLANNER_AGENT] Planning workbook layouts, worksheets and variables...', class: 'system' });

    const plannerSystemPrompt = [
      'You are the quaasx-excel Planner Agent. You respond with highly structured spreadsheet layout blueprints.',
      'Decompose the user request and outline the worksheets, column headers, target formulas, and styling required to build this workbook.',
      'Format your output as a clear, concise bullet-point blueprint.',
      searchContext ? '\nUse the following real-time web research findings to guide your blueprint:\n' + searchContext : '',
      '',
      '--- REAL DATA EXTRACTION RULES ---',
      'If the user has uploaded documents (Word documents) or images containing actual lists, tables, data points, or metrics:',
      '1. You MUST plan the workbook using the EXACT real values, text labels, and data points present in the files.',
      '2. DO NOT plan placeholder or mock data columns/values if the real values are available.',
      '3. Instruct the Data Ingestion subagent explicitly in your blueprint to use the real values from the files as-is.',
      '',
      '--- UPLOADED FILE CLARIFICATION RULES ---',
      'The user may have uploaded files (images or text/Word documents) to guide this request.',
      '1. Inspect the contents of the uploaded files carefully.',
      '2. If you determine that the uploaded document or image is UNREADABLE, garbled, empty, or completely lacks the necessary context/information to generate a spreadsheet blueprint:',
      '   - DO NOT output a spreadsheet layout blueprint.',
      '   - Instead, respond in plain, friendly conversational text asking the user specific, clear clarifying questions about what data or features they need.',
      '   - You MUST prefix your response with "[CLARIFY]" (e.g., "[CLARIFY] I see you uploaded an image, but it appears to be blank...").',
      '3. FLEXIBILITY RULE: Do not ask for clarification all the time. Be extremely flexible and lenient. If the document/image is mostly readable, or if you can make reasonable, intelligent assumptions based on the domain, proceed with creating the layout blueprint directly. Only ask questions and prefix with "[CLARIFY]" when you are genuinely unable to proceed or key details are totally missing.',
      '----------------------------------------'
    ].join('\n');

    const plannerUserContent = buildAgentUserContent(prompt, attachedFiles);
    const plannerMessages = [
      { role: 'system', content: plannerSystemPrompt },
      { role: 'user', content: plannerUserContent }
    ];

    let planText = '';
    try {
      planText = await callQuaasxAPI(effectiveApiKey, plannerMessages, temperature);
      sendSSE('telemetry', { text: '[PLANNER_AGENT] Blueprint finalized successfully.', class: 'success-line' });
    } catch (err) {
      sendSSE('telemetry', { text: 'Planner step failed, using direct fallback: ' + err.message, class: 'system' });
      planText = 'Direct generation requested.';
    }

    if (planText.trim().startsWith('[CLARIFY]')) {
      const cleanResponse = planText.replace(/^\[CLARIFY\]\s*/i, '');
      sendSSE('status', { statusText: 'Clarification required from user.', agentName: 'Planner Agent 📋' });
      sendSSE('telemetry', { text: '[PLANNER_AGENT] Uploaded files require clarification.', class: 'system' });
      sendSSE('done', { content: cleanResponse });
      res.end();
      return;
    }

    if (mode === 'plan') {
      sendSSE('status', { statusText: 'Blueprint finalized! 🚀', agentName: 'System Core 🌐' });
      sendSSE('done', { content: planText });
      res.end();
      return;
    }

    // ==========================================
    // STEP 3: WORKERS & ASSEMBLER AGENTS
    // ==========================================
    sendSSE('status', { statusText: 'Compiling dataset & formulas...', agentName: 'Workers & Assembler ⚡' });
    sendSSE('telemetry', { text: '[INGEST_AGENT] Synthesizing database records...', class: 'system' });
    sendSSE('telemetry', { text: '[STATS_AGENT] Deciding mathematical formula trees and summary rows...', class: 'system' });
    sendSSE('telemetry', { text: '[DESIGN_AGENT] Applying Obsidian theme styling & layout grids...', class: 'system' });

    let systemPrompt = SYSTEM_PROMPT;
    systemPrompt += '\n\n' + [
      '--- MULTI-AGENT COMPILER ACTIVE ---',
      'You are now executing as an integrated tier of specialized subagents:',
      '1. Data Ingestion Subagent: Ingest and use actual data. If the user has uploaded documents or images containing real values, tables, lists, dates, or names, you MUST use those EXACT real values as-is. Do NOT substitute them with mock/synthetic/fake data.',
      '2. Stats & Formula Subagent: Apply standard Excel formulas and custom descriptive/inferential statistical tests.',
      '3. UX Design Subagent: Ensure clean styling, borders, and professional grid spacing.',
      '4. Assembler Agent: Assemble the output sheets into a single, valid JSON spreadsheet structure matching the schema.',
      '',
      'Use the following planner blueprint to generate the final workbook:',
      planText,
      searchContext ? '\nIncorporate the following real-time research facts:\n' + searchContext : '',
      '-----------------------------------'
    ].join('\n');

    const workerUserContent = buildAgentUserContent(prompt, attachedFiles);
    const workerMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: workerUserContent }
    ];

    let resultPayload = '';
    try {
      const streamResult = await callQuaasxAPIStream(
        effectiveApiKey,
        workerMessages,
        (thinkingChunk) => {
          sendSSE('thinking', thinkingChunk);
        },
        (contentChunk) => {
          sendSSE('content', contentChunk);
        },
        temperature
      );
      resultPayload = streamResult.content;
    } catch (err) {
      sendSSE('telemetry', { text: 'Workers generation failed: ' + err.message, class: 'error-line' });
      throw err;
    }

    // ==========================================
    // STEP 4: SANDBOXED VALIDATOR & SELF-HEALING
    // ==========================================
    sendSSE('status', { statusText: 'Auditing sheet calculations...', agentName: 'Validator Agent 📐' });
    sendSSE('telemetry', { text: '[VALIDATOR_AGENT] Running sandboxed compilation audit on workbook...', class: 'system' });

    let parsedJSON = tryParseJSON(resultPayload);
    if (!parsedJSON) {
      sendSSE('telemetry', { text: '[VALIDATOR_AGENT] Output is plain text or invalid JSON. Verification skipped.', class: 'system' });
      sendSSE('done', { content: resultPayload });
      res.end();
      return;
    }

    // Load sandbox contexts
    let validationError = null;
    let FormulaEngine = null;
    try {
      const statFunctionsCode = fs.readFileSync(path.join(process.cwd(), 'js/stat-functions.js'), 'utf8');
      const formulaEngineCode = fs.readFileSync(path.join(process.cwd(), 'js/formula-engine.js'), 'utf8');

      const sandboxContext = {
        jStat: require('jstat').jStat,
        console: { log: () => {}, warn: () => {}, error: () => {} }, // Silence console in sandbox
        window: {}
      };

      vm.createContext(sandboxContext);
      vm.runInContext(formulaEngineCode, sandboxContext);
      vm.runInContext(statFunctionsCode, sandboxContext);

      FormulaEngine = sandboxContext.window.FormulaEngine;

      if (FormulaEngine) {
        parsedJSON.sheets.forEach(function (sheet) {
          FormulaEngine.evaluateSheet(sheet);
        });
        sendSSE('telemetry', { text: '[VALIDATOR_AGENT] Formula sandbox audit: 100% OK. Zero errors registered.', class: 'success-line' });
      }
    } catch (err) {
      validationError = err.message;
      sendSSE('telemetry', { text: '[VALIDATOR_AGENT] Circular reference or formula compile error detected: ' + validationError, class: 'error-line' });
    }

    // ==========================================
    // STEP 5: SELF-HEALING AUDITOR
    // ==========================================
    if (validationError) {
      sendSSE('status', { statusText: 'Self-healing failed formulas...', agentName: 'Self-Healing Auditor 🩺' });
      sendSSE('telemetry', { text: '[SELF-HEALING] Initiating automated auditor loop to correct formulas...', class: 'api-info' });

      const selfHealPrompt = [
        'You are the quaasx-excel Self-Healing Auditor.',
        'The spreadsheet engine encountered a formula compilation error upon evaluating the workbook JSON:',
        'Error: ' + validationError,
        '',
        'Review the spreadsheet JSON and correct the faulty formulas.',
        'Ensure column reference syntax matches correctly (e.g. col_id = current row value, @col_id = column array).',
        'Output only the corrected, complete, and valid JSON spreadsheet workbook. No explanations.',
        '',
        'Failing Spreadsheet JSON:',
        resultPayload
      ].join('\n');

      const selfHealMessages = [
        { role: 'system', content: 'You are a spreadsheet parser. You respond with ONLY corrected valid JSON sheet schema.' },
        { role: 'user', content: selfHealPrompt }
      ];

      try {
        const correctedContent = await callQuaasxAPI(effectiveApiKey, selfHealMessages, temperature);
        const parsedCorrected = tryParseJSON(correctedContent);
        if (parsedCorrected) {
          sendSSE('telemetry', { text: '[SELF-HEALING] Corrections applied successfully. Re-evaluating formulas...', class: 'success-line' });
          if (FormulaEngine) {
            parsedCorrected.sheets.forEach(function (sh) {
              FormulaEngine.evaluateSheet(sh);
            });
          }
          resultPayload = JSON.stringify(parsedCorrected);
        } else {
          sendSSE('telemetry', { text: '[SELF-HEALING] Self-healing returned malformed JSON, using original draft.', class: 'error-line' });
        }
      } catch (err) {
        sendSSE('telemetry', { text: '[SELF-HEALING] Auditor call failed: ' + err.message + '. Retaining original workbook.', class: 'error-line' });
      }
    }

    sendSSE('status', { statusText: 'Workbook validated successfully! 🚀', agentName: 'System Core 🌐' });
    sendSSE('done', { content: resultPayload });
  } catch (err) {
    sendSSE('error', { message: err.message });
  } finally {
    res.end();
  }
};
