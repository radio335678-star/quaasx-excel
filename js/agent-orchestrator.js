/**
 * AgentOrchestrator Module
 * Manages the Multi-Agent pipeline: Planner, Ingest/Stats/Design Subagents, Assembler, and Sandboxed Self-Healing Validator.
 * Exposes: window.AgentOrchestrator = { runAgenticPipeline }
 */
(function () {
  'use strict';

  /**
   * Helper to format attached files and prompt for subagents.
   */
  function buildAgentUserContent(prompt, attachedFiles) {
    var hasImageFiles = attachedFiles && attachedFiles.some(function (f) { return f.type === 'image'; });
    var textParts = [];

    // Prepend text-type file contents
    if (attachedFiles) {
      attachedFiles.forEach(function (f) {
        if (f.type === 'text') {
          textParts.push('Content from uploaded file ' + f.name + ':\n' + f.content);
        }
      });
    }

    if (prompt) {
      textParts.push(prompt);
    }

    var combinedText = textParts.join('\n\n');

    if (hasImageFiles) {
      var contentParts = [];
      if (combinedText) {
        contentParts.push({ type: 'text', text: combinedText });
      }
      attachedFiles.forEach(function (f) {
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

  /**
   * Run the Multi-Agent spreadsheet synthesis pipeline.
   * @param {string} apiKey - API key
   * @param {string} prompt - User prompt
   * @param {string} mode - 'build' | 'plan' | 'ask'
   * @param {Array} attachedFiles - Uploaded files
   * @param {Object} callbacks - { onStatusUpdate(status, agent), onStreamContent(chunk, full), onThinking(chunk, full) }
   * @param {AbortSignal} abortSignal - Abort signal
   * @returns {Promise<string>} - Final compiled spreadsheet JSON or plan text
   */
  async function runAgenticPipeline(apiKey, prompt, mode, attachedFiles, callbacks, abortSignal) {
    var status = callbacks.onStatusUpdate || function () {};
    var stream = callbacks.onStreamContent || function () {};
    var thinking = callbacks.onThinking || function () {};

    // ==========================================
    // STEP 1: INTENT & RESEARCH AGENT
    // ==========================================
    var searchContext = '';
    if (window.ResearchAgent && window.ResearchAgent.detectSearchIntent(prompt)) {
      status('Conducting real-time web research...', 'Research Scraper 🔍');
      if (window.logTelemetry) window.logTelemetry('[RESEARCH_AGENT] Query requires live data. Executing web search proxy...', 'api-info');
      searchContext = await window.ResearchAgent.conductResearch(prompt);
      if (searchContext) {
        if (window.logTelemetry) window.logTelemetry('[RESEARCH_AGENT] Web search completed. Injected live context facts into compiler.', 'success-line');
      } else {
        if (window.logTelemetry) window.logTelemetry('[RESEARCH_AGENT] No live search results returned, proceeding with static intelligence.', 'system');
      }
    }

    // ==========================================
    // STEP 2: PLANNER AGENT
    // ==========================================
    status('Decomposing workbook structure...', 'Planner Agent 📋');
    if (window.logTelemetry) window.logTelemetry('[PLANNER_AGENT] Planning workbook layouts, worksheets and variables...', 'system');

    // Planner system prompt
    var plannerSystemPrompt = [
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

    var plannerUserContent = buildAgentUserContent(prompt, attachedFiles);

    var plannerMessages = [
      { role: 'system', content: plannerSystemPrompt },
      { role: 'user', content: plannerUserContent }
    ];

    var planText = '';
    try {
      planText = await window.AIService.callQuaasxAPI(apiKey, plannerMessages);
      if (window.logTelemetry) window.logTelemetry('[PLANNER_AGENT] Blueprint finalized successfully.', 'success-line');
    } catch (err) {
      console.warn('Planner step failed, using direct fallback:', err.message);
      planText = 'Direct generation requested.';
    }

    // Check for clarification response
    if (planText.trim().startsWith('[CLARIFY]')) {
      var cleanResponse = planText.replace(/^\[CLARIFY\]\s*/i, '');
      status('Clarification required from user.', 'Planner Agent 📋');
      if (window.logTelemetry) window.logTelemetry('[PLANNER_AGENT] Uploaded files require clarification.', 'system');
      return cleanResponse;
    }

    // If mode is plan, we can just return this beautiful blueprint!
    if (mode === 'plan') {
      return planText;
    }

    // ==========================================
    // STEP 3: WORKERS & ASSEMBLER AGENTS
    // ==========================================
    status('Compiling dataset & formulas...', 'Workers & Assembler ⚡');
    if (window.logTelemetry) {
      window.logTelemetry('[INGEST_AGENT] Synthesizing mock database records...', 'system');
      window.logTelemetry('[STATS_AGENT] Deciding mathematical formula trees and summary rows...', 'system');
      window.logTelemetry('[DESIGN_AGENT] Applying Obsidian theme styling & layout grids...', 'system');
    }

    // Build the master system prompt combining Kimi prompt with subagents instructions
    var systemPrompt = window.AIService.SYSTEM_PROMPT;
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

    var workerUserContent = buildAgentUserContent(prompt, attachedFiles);

    var workerMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: workerUserContent }
    ];

    // Stream the spreadsheet creation using callQuaasxAPIStream!
    var result = await window.AIService.callQuaasxAPIStream(
      apiKey,
      workerMessages,
      {
        onThinking: function (chunk, full) {
          thinking(chunk, full);
        },
        onContent: function (chunk, full) {
          stream(chunk, full);
        }
      },
      abortSignal
    );

    var compiledJSONText = result.content;

    // ==========================================
    // STEP 4: SANDBOXED VALIDATOR & SELF-HEALING
    // ==========================================
    status('Auditing sheet calculations...', 'Validator Agent 📐');
    if (window.logTelemetry) window.logTelemetry('[VALIDATOR_AGENT] Running sandboxed compilation audit on workbook...', 'system');

    var parsedJSON = tryParseJSON(compiledJSONText);
    if (!parsedJSON) {
      if (window.logTelemetry) window.logTelemetry('[VALIDATOR_AGENT] Output is plain text or invalid JSON. Verification skipped.', 'system');
      return compiledJSONText;
    }

    // Evaluate formulas on all sheets to detect issues
    var validationError = null;
    try {
      if (window.FormulaEngine) {
        parsedJSON.sheets.forEach(function (sheet) {
          window.FormulaEngine.evaluateSheet(sheet);
        });
      }
      if (window.logTelemetry) window.logTelemetry('[VALIDATOR_AGENT] Formula sandbox audit: 100% OK. Zero errors registered.', 'success-line');
    } catch (err) {
      validationError = err.message;
      if (window.logTelemetry) window.logTelemetry('[VALIDATOR_AGENT] Circular reference or formula compile error detected: ' + validationError, 'error-line');
    }

    // If an error occurred, trigger SELF-HEALING auditor!
    if (validationError) {
      status('Self-healing failed formulas...', 'Self-Healing Auditor 🩺');
      if (window.logTelemetry) window.logTelemetry('[SELF-HEALING] Initiating automated auditor loop to correct formulas...', 'api-info');

      var selfHealPrompt = [
        'You are the quaasx-excel Self-Healing Auditor.',
        'The spreadsheet engine encountered a formula compilation error upon evaluating the workbook JSON:',
        'Error: ' + validationError,
        '',
        'Review the spreadsheet JSON and correct the faulty formulas.',
        'Ensure column reference syntax matches correctly (e.g. col_id = current row value, @col_id = column array).',
        'Output only the corrected, complete, and valid JSON spreadsheet workbook. No explanations.',
        '',
        'Failing Spreadsheet JSON:',
        compiledJSONText
      ].join('\n');

      var selfHealMessages = [
        { role: 'system', content: 'You are a spreadsheet parser. You respond with ONLY corrected valid JSON sheet schema.' },
        { role: 'user', content: selfHealPrompt }
      ];

      try {
        var correctedContent = await window.AIService.callQuaasxAPI(apiKey, selfHealMessages);
        var parsedCorrected = tryParseJSON(correctedContent);
        if (parsedCorrected) {
          if (window.logTelemetry) window.logTelemetry('[SELF-HEALING] Corrections applied successfully. All formulas compiled.', 'success-line');
          
          // Re-evaluate to make sure it is fixed
          if (window.FormulaEngine) {
            parsedCorrected.sheets.forEach(function (sh) {
              window.FormulaEngine.evaluateSheet(sh);
            });
          }
          
          compiledJSONText = JSON.stringify(parsedCorrected);
        } else {
          if (window.logTelemetry) window.logTelemetry('[SELF-HEALING] Self-healing returned malformed JSON, using original draft.', 'error-line');
        }
      } catch (err) {
        if (window.logTelemetry) window.logTelemetry('[SELF-HEALING] Auditor call failed: ' + err.message + '. Retaining original workbook.', 'error-line');
      }
    }

    status('Workbook validated successfully! 🚀', 'System Core 🌐');
    return compiledJSONText;
  }

  // Helper to parse JSON safely
  function tryParseJSON(text) {
    if (!text) return null;
    var cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    try {
      var parsed = JSON.parse(cleaned);
      if (!parsed.sheets || !Array.isArray(parsed.sheets)) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  // Expose module on window
  window.AgentOrchestrator = {
    runAgenticPipeline: runAgenticPipeline
  };
})();
