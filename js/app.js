/**
 * App.js — Main Orchestrator
 * Wires up all UI interactions, manages state, and coordinates between
 * AIService, TableRenderer, and ExcelExport modules.
 */
(function () {
  'use strict';

  // ========== STATE ==========
  var spreadsheetState = null;   // The JSON source of truth
  var chatHistory = [];           // Array of { role, content } for AI context
  var attachedFiles = [];         // Array of processed file objects
  var activeSheetIndex = 0;       // Currently visible sheet tab
  var currentMode = 'build';      // 'build' | 'plan' | 'ask'
  var abortController = null;     // AbortController for stopping generation
  var isGenerating = false;       // Whether AI is currently generating
  var chatDisplayMessages = [];   // Track displayed messages for persistence
  var currentViewMode = 'table';  // 'table' | 'charts' | 'split'

  // ========== SUPABASE STATE ==========
  var supabase = null;
  var isOfflineMode = true;
  var dirtyProjectIds = new Set(); // Keep track of projects to sync background

  // ========== SUBSCRIPTION & TOKEN STATE ==========
  var subscriptionPlan = localStorage.getItem('quaasx_subscription_plan') || 'free';
  var tokensUsed = parseInt(localStorage.getItem('quaasx_tokens_used') || '0', 10);
  var tokenLimit = 100000; // 100k tokens

  // ========== PROJECT MANAGEMENT STATE ==========
  var projects = [];              // All saved projects
  var activeProjectId = null;     // Currently active project ID
  var STORAGE_KEY = 'ai_spreadsheet_projects';
  var ACTIVE_KEY = 'ai_spreadsheet_active_id';

  // Mode-specific system prompts
  var MODE_PROMPTS = {
    build: window.AIService.SYSTEM_PROMPT,
    plan: 'You are an AI spreadsheet planning assistant. The user will describe what they want. Analyze their request and provide a detailed, numbered step-by-step plan of EXACTLY what changes you would make to create or modify the spreadsheet. Do NOT output JSON. Format your response as a clear, actionable plan with numbered steps. Reference specific columns, rows, styles, and values. If the user provides existing spreadsheet state, reference its current data in your plan.',
    ask: 'You are a helpful spreadsheet and data analysis expert. Answer the user\'s question about spreadsheets, data analysis, formulas, best practices, or their current data. Do NOT output JSON. Respond in plain, conversational text. Be concise and helpful. If the user has a current spreadsheet, you can reference its data in your answer.'
  };

  // Icon SVG constants
  var SEND_ICON_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  var STOP_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>';

  // ========== DOM REFERENCES ==========
  var apiKeyInput;
  var saveKeyBtn;
  var apiKeyStatus;
  var chatMessages;
  var fileInput;
  var fileUploadLabel;
  var filePreview;
  var userInput;
  var sendBtn;
  var sheetTabs;
  var downloadBtn;
  var spreadsheetContainer;
  var emptyState;
  var loadingIndicator;
  var chartsContainer;
  var viewToggle;
  var spreadsheetWorkspace;
  var sidebarToggleBtn;
  var projectSidebar;
  var btnHistory;
  var btnChat;
  var btnRegistry;
  var btnConsole;
  var btnSettings;
  var settingsModal;
  var closeSettingsBtn;
  var modelSelector;
  var clearDataBtn;
  var settingsApiKeyStatus;
  var apiKeyStatusText;
  var refreshBtn;
  var btnThinkingReasoning;
  var btnThinkingCompilation;
  var btnCompilerViewType;
  var btnScrollLock;
  var compilationPane;
  var compilationRaw;
  var compilationTree;
  var compilingOverlay;

  var isScrollLocked = false;
  var compilerViewType = 'tree';
  
  // Subscription UI references
  var headerSubscriptionStatus;
  var settingsTokenMeterContainer;
  var settingsTokenCountText;
  var settingsTokenMeterFill;

  // Helper to resolve the active API key (with fallbacks)
  function getSavedApiKey() {
    return localStorage.getItem('quaasx_api_key') || 
           localStorage.getItem('moonshot_api_key') || 
           localStorage.getItem('nvidia_api_key');
  }

  // ========== INITIALIZATION ==========
  document.addEventListener('DOMContentLoaded', function () {
    // Cache DOM references
    apiKeyInput = document.getElementById('api-key-input');
    saveKeyBtn = document.getElementById('save-key-btn');
    apiKeyStatus = document.getElementById('api-key-status');
    chatMessages = document.getElementById('chat-messages');
    fileInput = document.getElementById('file-input');
    fileUploadLabel = document.getElementById('file-upload-label');
    filePreview = document.getElementById('file-preview');
    userInput = document.getElementById('user-input');
    sendBtn = document.getElementById('send-btn');
    sheetTabs = document.getElementById('sheet-tabs');
    downloadBtn = document.getElementById('download-btn');
    spreadsheetContainer = document.getElementById('spreadsheet-container');
    emptyState = document.getElementById('empty-state');
    loadingIndicator = document.getElementById('loading-indicator');
    chartsContainer = document.getElementById('charts-container');
    viewToggle = document.getElementById('view-toggle');
    spreadsheetWorkspace = document.getElementById('spreadsheet-workspace');
    sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    projectSidebar = document.getElementById('project-sidebar');
    btnHistory = document.getElementById('btn-activity-history');
    btnChat = document.getElementById('btn-activity-chat');
    btnRegistry = document.getElementById('btn-activity-registry');
    btnConsole = document.getElementById('btn-activity-console');
    btnSettings = document.getElementById('btn-activity-settings');
    settingsModal = document.getElementById('settings-modal');
    closeSettingsBtn = document.getElementById('close-settings-btn');
    modelSelector = document.getElementById('model-selector');
    clearDataBtn = document.getElementById('clear-data-btn');
    settingsApiKeyStatus = document.getElementById('settings-api-key-status');
    apiKeyStatusText = document.getElementById('api-key-status-text');
    refreshBtn = document.getElementById('refresh-btn');
    btnThinkingReasoning = document.getElementById('btn-thinking-reasoning');
    btnThinkingCompilation = document.getElementById('btn-thinking-compilation');
    btnCompilerViewType = document.getElementById('btn-compiler-view-type');
    btnScrollLock = document.getElementById('btn-scroll-lock');
    compilationPane = document.getElementById('compilation-pane');
    compilationRaw = document.getElementById('compilation-raw');
    compilationTree = document.getElementById('compilation-tree');
    compilingOverlay = document.getElementById('compiling-overlay');

    // Subscription DOM Cache
    headerSubscriptionStatus = document.getElementById('header-subscription-status');
    settingsTokenMeterContainer = document.getElementById('settings-token-meter-container');
    settingsTokenCountText = document.getElementById('settings-token-count-text');
    settingsTokenMeterFill = document.getElementById('settings-token-meter-fill');

    // Load saved API key (with fallback for legacy key)
    var savedKey = getSavedApiKey();
    if (savedKey) {
      if (apiKeyInput) apiKeyInput.value = savedKey;
      updateApiKeyStatus(true);
    }

    // Load saved theme and model settings
    var savedTheme = localStorage.getItem('quaasx_visual_theme') || 'default';
    applyTheme(savedTheme);

    // Initial subscription UI sync
    updateSubscriptionUI();

    var savedModel = localStorage.getItem('quaasx_cognitive_model') || 'quaasx-cognitive-4';
    if (modelSelector) {
      modelSelector.value = savedModel;
    }
    if (window.AIService && window.AIService.setModelId) {
      window.AIService.setModelId(savedModel);
    }

    // Restore sidebar state
    var isSidebarCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
    if (isSidebarCollapsed && sidebarToggleBtn && projectSidebar) {
      projectSidebar.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
      if (btnHistory) btnHistory.classList.remove('active');
      sidebarToggleBtn.title = 'Expand Sidebar';
    }

    // Wire up all event listeners
    wireEventListeners();

    // Initialize resizable dividers, toggles, formula popup, and telemetry console
    initFuturisticWorkspace();

    // Load API key from local .env or cache, then boot projects
    loadEnvApiKey().then(function () {
      loadProjectsFromStorage();
      wireAuthEventListeners();
    });

    // Initial textarea auto-resize setup
    autoResizeTextarea();
  });

  // ========== EVENT LISTENERS ==========
  function wireEventListeners() {
    // Save API key
    if (saveKeyBtn) {
      saveKeyBtn.addEventListener('click', function () {
        var key = apiKeyInput ? apiKeyInput.value.trim() : '';
        if (key) {
          localStorage.setItem('quaasx_api_key', key);
          updateApiKeyStatus(true);
        } else {
          localStorage.removeItem('quaasx_api_key');
          localStorage.removeItem('moonshot_api_key'); // Clean up legacy key
          updateApiKeyStatus(false);
        }
      });
    }

    // File upload trigger
    fileUploadLabel.addEventListener('click', function () {
      fileInput.click();
    });

    // File input change
    fileInput.addEventListener('change', async function () {
      var files = fileInput.files;
      if (!files || files.length === 0) return;

      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          addChatMessage('PDF file upload is unsupported. Please upload Word documents (.doc, .docx) or images instead.', 'error');
          continue;
        }
        try {
          var processed = await window.AIService.processFile(file);
          
          // Upload to Supabase Storage if connected
          if (supabase && window.supabaseLoggedIn) {
            var cloudUrl = await uploadFileToSupabase(file);
            if (cloudUrl) {
              if (processed.type === 'image') {
                processed.content = cloudUrl; // Replace Base64 Data URL with Cloud URL
              }
              processed.cloudUrl = cloudUrl;
            }
          }
          
          attachedFiles.push(processed);
        } catch (err) {
          console.error('Error processing file:', err);
          addChatMessage('Failed to process file: ' + file.name + ' — ' + err.message, 'error');
        }
      }

      renderFileChips();
      updateSendBtnState();

      // Reset file input so the same file can be re-uploaded
      fileInput.value = '';
    });
    // Send button click (doubles as stop button during generation)
    sendBtn.addEventListener('click', function () {
      if (isGenerating) {
        if (abortController) abortController.abort();
      } else {
        handleSend();
      }
    });

    // Enter key (without shift) on textarea
    userInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isGenerating) handleSend();
      }
    });

    // Paste handler for copy-pasting images directly into the chat area
    userInput.addEventListener('paste', async function (e) {
      var clipboardData = e.clipboardData || window.clipboardData;
      if (!clipboardData) return;

      var items = clipboardData.items;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.type.indexOf('image') !== -1) {
          e.preventDefault(); // Prevent pasting raw base64 or characters if it's an image
          var file = item.getAsFile();
          if (!file) continue;

          var pastedName = 'pasted_image_' + Math.floor(Date.now() / 1000) + '.png';
          var renamedFile = new File([file], pastedName, { type: file.type });

          try {
            var processed = await window.AIService.processFile(renamedFile);
            
            // Upload to Supabase Storage if connected
            if (supabase && window.supabaseLoggedIn) {
              var cloudUrl = await uploadFileToSupabase(renamedFile);
              if (cloudUrl) {
                processed.content = cloudUrl;
                processed.cloudUrl = cloudUrl;
              }
            }
            
            attachedFiles.push(processed);
            renderFileChips();
            updateSendBtnState();
          } catch (err) {
            console.error('Error processing pasted image:', err);
            addChatMessage('Failed to process pasted image: ' + err.message, 'error');
          }
        }
      }
    });
    // Mode selector buttons
    document.querySelectorAll('.mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentMode = btn.dataset.mode;
        updateModeButtons();
      });
    });

    // Thinking window toggle
    var thinkingToggleBtn = document.getElementById('thinking-toggle');
    if (thinkingToggleBtn) {
      thinkingToggleBtn.addEventListener('click', function () {
        var content = document.getElementById('thinking-content');
        if (content) content.classList.toggle('collapsed');
        thinkingToggleBtn.classList.toggle('collapsed');
      });
    }

    // Textarea auto-resize on input
    userInput.addEventListener('input', function () {
      autoResizeTextarea();
      updateSendBtnState();
    });

    // Download button
    downloadBtn.addEventListener('click', function () {
      if (spreadsheetState) {
        window.ExcelExport.exportToExcel(spreadsheetState);
      }
    });

    // View toggle buttons
    if (viewToggle) {
      var viewBtns = viewToggle.querySelectorAll('.view-btn');
      viewBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var view = btn.dataset.view;
          setViewMode(view);
        });
      });
    }

    // Refresh calculations and views
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        handleRefresh();
      });
    }

    // Thinking tabs and controls wiring
    if (btnThinkingReasoning) {
      btnThinkingReasoning.addEventListener('click', function () {
        focusReasoningTab();
      });
    }

    if (btnThinkingCompilation) {
      btnThinkingCompilation.addEventListener('click', function () {
        focusCompilationTab();
      });
    }

    if (btnCompilerViewType) {
      btnCompilerViewType.addEventListener('click', function () {
        compilerViewType = (compilerViewType === 'tree') ? 'raw' : 'tree';
        updateCompilerViewMode();
      });
    }

    if (btnScrollLock) {
      btnScrollLock.addEventListener('click', function () {
        isScrollLocked = !isScrollLocked;
        btnScrollLock.textContent = isScrollLocked ? 'Scroll Lock 🔒' : 'Scroll Lock 🔓';
        btnScrollLock.classList.toggle('active', isScrollLocked);
      });
    }

    // Suggestion chip clicks (event delegation with holographic flash)
    chatMessages.addEventListener('click', function (e) {
      var chip = e.target.closest('.suggestion-chip');
      if (chip && chip.dataset.prompt) {
        chip.style.transform = 'scale(0.96)';
        chip.style.borderColor = 'var(--accent-primary)';
        chip.style.boxShadow = '0 0 16px rgba(124, 58, 237, 0.6)';
        chip.style.background = 'rgba(124, 58, 237, 0.15)';
        
        setTimeout(function() {
          chip.style.transform = '';
          chip.style.borderColor = '';
          chip.style.boxShadow = '';
          chip.style.background = '';
          
          userInput.value = chip.dataset.prompt;
          autoResizeTextarea();
          handleSend();
        }, 250);
      }
    });

    // Sidebar collapse toggle coordinated with Activity Bar
    if (sidebarToggleBtn && projectSidebar) {
      sidebarToggleBtn.addEventListener('click', function () {
        toggleProjectSidebar();
      });
    }

    // Settings Modal toggles
    if (btnSettings) {
      btnSettings.addEventListener('click', function () {
        openSettingsModal();
      });
    }
    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', function () {
        closeSettingsModal();
      });
    }
    if (settingsModal) {
      settingsModal.addEventListener('click', function (e) {
        if (e.target === settingsModal) {
          closeSettingsModal();
        }
      });
    }

    // Model select change
    if (modelSelector) {
      modelSelector.addEventListener('change', function () {
        var selectedModel = modelSelector.value;
        localStorage.setItem('quaasx_cognitive_model', selectedModel);
        if (window.AIService && window.AIService.setModelId) {
          window.AIService.setModelId(selectedModel);
        }
        if (window.logTelemetry) {
          window.logTelemetry('[SYS] Switched cognitive model core to: ' + selectedModel, 'system');
        }
      });
    }

    // Theme option clicks
    document.querySelectorAll('.theme-option-btn, .landing-theme-btn, .theme-dot').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var selectedTheme = btn.dataset.theme;
        applyTheme(selectedTheme);
      });
    });

    // Settings pricing options click
    document.querySelectorAll('.settings-pricing-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var plan = card.dataset.plan;
        if (plan) {
          changePlan(plan);
        }
      });
    });

    // Landing page pricing action buttons click
    document.querySelectorAll('.pricing-card .pricing-action-btn').forEach(function (btn) {
      if (btn.id === 'landing-btn-enterprise') return;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var plan = btn.dataset.plan;
        if (plan) {
          changePlan(plan);
          var enterBtn = document.getElementById('enter-app-btn');
          if (enterBtn) {
            enterBtn.click();
          }
        }
      });
    });

    // Clear data button
    if (clearDataBtn) {
      clearDataBtn.addEventListener('click', function () {
        if (confirm('Are you sure you want to clear all chat history, projects, and saved data? This action is irreversible.')) {
          localStorage.clear();
          location.reload();
        }
      });
    }
  }

  // ========== PROMPT CHARACTER COUNTER HELPER ==========
  function calculateMessageChars(msgs) {
    var total = 0;
    msgs.forEach(function (msg) {
      if (typeof msg.content === 'string') {
        total += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        msg.content.forEach(function (part) {
          if (part.type === 'text' && typeof part.text === 'string') {
            total += part.text.length;
          }
        });
      }
    });
    return total;
  }

  // ========== SEND MESSAGE HANDLER ==========
  async function handleSend() {
    var messageText = userInput.value.trim();

    // Nothing to send
    if (!messageText && attachedFiles.length === 0) return;

    // Capture copy of attachedFiles before clearing
    var attachedFilesCopy = [].concat(attachedFiles);

    // Verify token exhaustion blocker
    if (subscriptionPlan === 'free' && tokensUsed >= tokenLimit) {
      displayTokenBlocker();
      
      var statusEl = document.getElementById('header-subscription-status');
      if (statusEl) {
        statusEl.style.boxShadow = '0 0 20px #ef4444';
        statusEl.style.borderColor = '#ef4444';
        statusEl.style.background = 'rgba(239, 68, 68, 0.2)';
        setTimeout(function() {
          statusEl.style.boxShadow = '';
          statusEl.style.borderColor = '';
          statusEl.style.background = '';
        }, 1000);
      }
      return;
    }

    var apiKey = getSavedApiKey();
    if (!apiKey) {
      addChatMessage('Please save your API key first.', 'error');
      return;
    }

    // Set generating state
    isGenerating = true;
    abortController = new AbortController();
    updateSendButton();

    // Show user message in chat
    var displayText = messageText;
    if (attachedFiles.length > 0) {
      var fileNames = attachedFiles.map(function (f) { return f.name; }).join(', ');
      displayText = (messageText ? messageText + '\n' : '') + '📎 ' + fileNames;
    }
    addChatMessage(displayText, 'user', attachedFilesCopy);

    // Build messages array with mode-appropriate system prompt
    var systemPrompt = MODE_PROMPTS[currentMode] || MODE_PROMPTS.build;

    // Dynamically append clarification rules for uploaded documents/images
    if (attachedFiles.length > 0) {
      systemPrompt += '\n\n' + [
        '--- UPLOADED FILE HANDLER SYSTEM RULES ---',
        'The user has uploaded one or more files (images or text/Word documents) to guide this request.',
        '1. Inspect the contents of the uploaded files carefully.',
        '2. If you determine that the uploaded document or image is UNREADABLE, garbled, empty, or completely lacks the necessary context/information to generate a meaningful spreadsheet (in build mode), step-by-step plan (in plan mode), or answer (in ask mode):',
        '   - DO NOT output a spreadsheet JSON schema (in build mode) or a complete plan (in plan mode).',
        '   - Instead, respond in plain, friendly conversational text asking the user specific, clear clarifying questions about what data or features they need to create, so they can clarify before you build.',
        '3. FLEXIBILITY RULE: Do not ask for clarification all the time. Be extremely flexible and lenient. If the document/image is mostly readable, or if you can make reasonable, intelligent assumptions based on the domain (e.g. standard finance metrics, common medical scores, standard academic datasets), proceed with creating the spreadsheet/plan/answer directly with a helpful note. Only ask questions when you are genuinely unable to proceed or when key details are totally missing.',
        '-------------------------------------------'
      ].join('\n');
    }

    // Inject semantic search results from other workbooks if in Ask Mode
    if (currentMode === 'ask' && supabase && window.supabaseLoggedIn) {
      if (window.logTelemetry) window.logTelemetry('[SYS] Performing semantic RAG query across sheets...', 'api-info');
      try {
        var matches = await searchWorkbookEmbeddings(messageText);
        if (matches && matches.length > 0) {
          systemPrompt += "\n\nCONTEXT FROM OTHER WORKBOOKS (use this data to answer the query if relevant):\n" +
            matches.map(function (m) {
              return "[Workbook Match] " + m.content;
            }).join('\n');
          if (window.logTelemetry) {
            window.logTelemetry('[SYS] Semantic search matched ' + matches.length + ' sheet segment(s).', 'success-line');
          }
        }
      } catch (err) {
        console.warn('RAG embedding search skipped:', err.message);
      }
    }

    var messages = [{ role: 'system', content: systemPrompt }];

    // Add chat history
    chatHistory.forEach(function (msg) {
      messages.push({ role: msg.role, content: msg.content });
    });

    // Build the new user message content
    var userMessageContent = buildUserMessageContent(messageText);
    messages.push({ role: 'user', content: userMessageContent });

    // Clear input UI and state immediately so user sees message sent
    userInput.value = '';
    attachedFiles = [];
    if (filePreview) filePreview.innerHTML = '';
    autoResizeTextarea();
    updateSendBtnState();

    // Show thinking window, hide empty state
    if (emptyState) emptyState.style.display = 'none';
    showThinkingWindow();

    // Show streaming assistant bubble in chat
    var streamingBubble = addStreamingAssistantBubble();
    var hasClearedThinkingIndicator = false;

    try {
      var responseContent = '';

      if (currentMode === 'build' || currentMode === 'plan') {
        var requiresResearch = window.ResearchAgent && window.ResearchAgent.detectSearchIntent(messageText);
        initializeAgenticBubble(streamingBubble, currentMode, requiresResearch);

        var response = await fetch('/api/generate-sheet', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            apiKey: (apiKey === 'server-managed') ? null : apiKey,
            prompt: messageText,
            mode: currentMode,
            attachedFiles: attachedFilesCopy
          }),
          signal: abortController.signal
        });

        if (!response.ok) {
          var errData = {};
          try { errData = await response.json(); } catch (_) {}
          throw new Error(errData.message || 'Server returned status ' + response.status);
        }

        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        var fullThinking = '';
        var fullContent = '';
        var finalContent = '';

        while (true) {
          var readResult = await reader.read();
          if (readResult.done) break;

          buffer += decoder.decode(readResult.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;

            if (line.startsWith('event: ')) {
              var eventType = line.slice(7);
              // Read next line for data
              i++;
              if (i < lines.length && lines[i].startsWith('data: ')) {
                var dataStr = lines[i].slice(6);
                var data;
                try {
                  data = JSON.parse(dataStr);
                } catch (e) {
                  continue;
                }

                if (eventType === 'status') {
                  updateThinkingStatus(data.statusText);
                  updateAgenticStep(streamingBubble, data.agentName, data.statusText, currentMode, requiresResearch);
                } else if (eventType === 'thinking') {
                  fullThinking += data;
                  updateThinkingText(fullThinking);
                  updateThinkingStatus('AI is reasoning...');
                  focusReasoningTab();
                } else if (eventType === 'content') {
                  fullContent += data;
                  updateThinkingStatus('AI is generating response...');
                  if (currentMode === 'build') {
                    focusCompilationTab();
                    updateCompilationText(fullContent);
                    if (compilingOverlay && compilingOverlay.style.display === 'none') {
                      compilingOverlay.style.display = 'flex';
                    }
                  }
                } else if (eventType === 'telemetry') {
                  if (window.logTelemetry) {
                    window.logTelemetry(data.text, data.class);
                  }
                } else if (eventType === 'done') {
                  finalContent = data.content;
                } else if (eventType === 'error') {
                  throw new Error(data.message);
                }
              }
            }
          }
        }
        responseContent = finalContent;
      } else {
        // Ask mode - call standard streaming API with real-time research scraper context check
        var searchContext = '';
        if (window.ResearchAgent && window.ResearchAgent.detectSearchIntent(messageText)) {
          updateThinkingStatus('Conducting real-time web research...');
          var label = streamingBubble.querySelector('.thinking-label');
          if (label) label.textContent = 'Web Researching...';

          if (window.logTelemetry) window.logTelemetry('[RESEARCH_AGENT] Query requires live data. Executing web search proxy...', 'api-info');
          searchContext = await window.ResearchAgent.conductResearch(messageText);
          if (searchContext) {
            if (window.logTelemetry) window.logTelemetry('[RESEARCH_AGENT] Web search completed. Injected live context facts.', 'success-line');
            systemPrompt += '\n\n' + searchContext;
            messages[0].content = systemPrompt;
          } else {
            if (window.logTelemetry) window.logTelemetry('[RESEARCH_AGENT] No live search results returned, proceeding with static intelligence.', 'system');
          }
        }

        var result = await window.AIService.callQuaasxAPIStream(
          apiKey,
          messages,
          {
            onThinking: function (chunk, full) {
              updateThinkingText(full);
              updateThinkingStatus('AI is reasoning...');
              focusReasoningTab();
              var label = streamingBubble.querySelector('.thinking-label');
              if (label) label.textContent = 'Reasoning...';
            },
            onContent: function (chunk, full) {
              updateThinkingStatus('AI is generating response...');
              if (!hasClearedThinkingIndicator) {
                streamingBubble.innerHTML = '';
                hasClearedThinkingIndicator = true;
              }
              streamingBubble.textContent = full;
              chatMessages.scrollTop = chatMessages.scrollHeight;
            }
          },
          abortController.signal
        );
        responseContent = result.content;
      }

      // Clean up streaming bubble before adding final formatted bubble
      if (streamingBubble && streamingBubble.parentNode) {
        streamingBubble.parentNode.removeChild(streamingBubble);
        streamingBubble = null;
      }

      // Hide compiling scanner overlay
      if (compilingOverlay) {
        compilingOverlay.style.display = 'none';
      }

      // Estimate and record token usage
      var promptChars = calculateMessageChars(messages);
      var responseChars = responseContent.length;
      var consumedTokens = Math.ceil((promptChars + responseChars) / 4);
      
      tokensUsed += consumedTokens;
      localStorage.setItem('quaasx_tokens_used', tokensUsed);
      syncTokenUsageToCloud(consumedTokens);

      updateSubscriptionUI();
      
      if (window.logTelemetry) {
        var remainingTokens = Math.max(0, tokenLimit - tokensUsed);
        window.logTelemetry('[SYS] Consumed ' + consumedTokens.toLocaleString() + ' tokens. Free credits remaining: ' + remainingTokens.toLocaleString() + ' tokens.', 'api-info');
      }

      // Process based on current mode
      if (currentMode === 'ask') {
        // Ask mode: show response as plain chat message
        addChatMessage(responseContent, 'assistant');
        chatHistory.push({ role: 'user', content: typeof userMessageContent === 'string' ? userMessageContent : messageText });
        chatHistory.push({ role: 'assistant', content: responseContent });
        saveCurrentProject();

      } else if (currentMode === 'plan') {
        // Plan mode: show plan with execute button
        addPlanMessage(responseContent, messageText);
        chatHistory.push({ role: 'user', content: typeof userMessageContent === 'string' ? userMessageContent : messageText });
        chatHistory.push({ role: 'assistant', content: responseContent });
        saveCurrentProject();

      } else {
        // Build mode: try to parse as JSON spreadsheet
        var parsed = tryParseSpreadsheetJSON(responseContent);
        if (parsed) {
          // Evaluate formulas on all sheets
          if (window.FormulaEngine) {
            parsed.sheets.forEach(function (sh) {
              window.FormulaEngine.evaluateSheet(sh);
            });
          }
          spreadsheetState = parsed;
          activeSheetIndex = 0;
          renderSheetTabs();
          renderActiveSheet();
          if (downloadBtn) downloadBtn.disabled = false;
          if (viewToggle) viewToggle.style.display = 'flex';
          setViewMode(currentViewMode);
          addChatMessage('\u2728 Spreadsheet generated with live formulas! Edit any data cell and computed values will recalculate.', 'assistant');
        } else {
          addChatMessage(responseContent, 'assistant');
        }
        chatHistory.push({ role: 'user', content: typeof userMessageContent === 'string' ? userMessageContent : messageText });
        chatHistory.push({ role: 'assistant', content: responseContent });
        saveCurrentProject();
      }

    } catch (err) {
      if (streamingBubble && streamingBubble.parentNode) {
        streamingBubble.parentNode.removeChild(streamingBubble);
        streamingBubble = null;
      }
      if (compilingOverlay) {
        compilingOverlay.style.display = 'none';
      }
      if (err.name === 'AbortError') {
        addChatMessage('\u23f9 Generation stopped.', 'error');
      } else {
        console.error('API error:', err);
        addChatMessage('Error: ' + err.message, 'error');
      }
    }

    // Cleanup
    hideThinkingWindow();
    isGenerating = false;
    abortController = null;
    if (streamingBubble && streamingBubble.parentNode) {
      streamingBubble.parentNode.removeChild(streamingBubble);
    }
    if (compilingOverlay) {
      compilingOverlay.style.display = 'none';
    }
    autoResizeTextarea();
    updateSendBtnState();
    updateSendButton();
  }

  // ========== BUILD USER MESSAGE ==========
  function buildUserMessageContent(messageText) {
    var hasTextFiles = attachedFiles.some(function (f) { return f.type === 'text'; });
    var hasImageFiles = attachedFiles.some(function (f) { return f.type === 'image'; });

    var textParts = [];

    // Prepend text-type file contents
    attachedFiles.forEach(function (f) {
      if (f.type === 'text') {
        textParts.push('Content from ' + f.name + ':\n' + f.content);
      }
    });

    // If there's existing spreadsheet state and the user is making a modification
    if (spreadsheetState && messageText) {
      textParts.push('Current spreadsheet JSON state:\n' + JSON.stringify(spreadsheetState));
    }

    // Add the user's actual message
    if (messageText) {
      textParts.push(messageText);
    }

    var combinedText = textParts.join('\n\n');

    // If there are image files, use multi-content format
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

  // ========== PARSE SPREADSHEET JSON ==========
  function tryParseSpreadsheetJSON(text) {
    if (!text) return null;

    // Strip markdown code fences if present
    var cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();

    try {
      var parsed = JSON.parse(cleaned);

      // Validate structure
      if (!parsed.sheets || !Array.isArray(parsed.sheets)) return null;

      for (var i = 0; i < parsed.sheets.length; i++) {
        var sheet = parsed.sheets[i];
        if (!sheet.columns || !Array.isArray(sheet.columns)) return null;
        if (!sheet.rows || !Array.isArray(sheet.rows)) return null;
      }

      return parsed;
    } catch (e) {
      return null;
    }
  }

  // ========== CHAT HELPERS ==========
  function addChatMessage(text, type, files) {
    var div = document.createElement('div');
    div.className = 'chat-message ' + type;
    div.textContent = text || '';

    // Render attachments if any
    if (files && files.length > 0) {
      var attachmentsDiv = document.createElement('div');
      attachmentsDiv.className = 'message-attachments';
      
      files.forEach(function (file) {
        if (file.type === 'image') {
          var img = document.createElement('img');
          img.className = 'message-attachment-image';
          img.src = file.content;
          img.addEventListener('click', function () {
            var win = window.open();
            if (win) {
              win.document.write('<iframe src="' + file.content + '" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>');
            }
          });
          attachmentsDiv.appendChild(img);
        } else {
          var docChip = document.createElement('div');
          docChip.className = 'message-attachment-file';
          docChip.innerHTML = '📄 <span style="font-weight: 500;">' + file.name + '</span>';
          attachmentsDiv.appendChild(docChip);
        }
      });
      div.appendChild(attachmentsDiv);
    }

    // Add Convert to Plan button for assistant messages
    if (type === 'assistant') {
      var btn = document.createElement('button');
      btn.className = 'convert-plan-btn';
      btn.innerHTML = '💡 Convert this conversation to a structured plan';
      btn.addEventListener('click', function () {
        currentMode = 'plan';
        updateModeButtons();
        userInput.value = 'Based on our discussion, convert this conversation to a structured plan to build the spreadsheet.';
        autoResizeTextarea();
        handleSend();
      });
      div.appendChild(btn);
    }

    chatMessages.appendChild(div);

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Remove welcome message if it exists
    if (type === 'user' || type === 'assistant') {
      var welcome = document.querySelector('.welcome-message');
      if (welcome) {
        welcome.remove();
      }
    }

    // Track for persistence
    chatDisplayMessages.push({ text: text, type: type, files: files || null });

    // Auto-name project from first user message
    if (type === 'user' && chatDisplayMessages.filter(function (m) { return m.type === 'user'; }).length === 1) {
      autoNameProject(text);
    }

    saveCurrentProject();
  }

  // ========== SHEET TABS ==========
  function renderSheetTabs() {
    if (!sheetTabs || !spreadsheetState) return;

    sheetTabs.innerHTML = '';

    spreadsheetState.sheets.forEach(function (sheet, index) {
      var btn = document.createElement('button');
      btn.className = 'sheet-tab';
      btn.textContent = sheet.name;

      if (index === activeSheetIndex) {
        btn.classList.add('active');
      }

      btn.addEventListener('click', function () {
        activeSheetIndex = index;

        // Update all tab active states
        var allTabs = sheetTabs.querySelectorAll('.sheet-tab');
        allTabs.forEach(function (tab) { tab.classList.remove('active'); });
        btn.classList.add('active');

        // Re-render the active sheet
        renderActiveSheet();

        if (currentViewMode === 'charts' || currentViewMode === 'split') {
          renderCharts();
        }
      });

      sheetTabs.appendChild(btn);
    });
  }

  // ========== RENDER ACTIVE SHEET ==========
  function renderActiveSheet() {
    if (!spreadsheetState || !spreadsheetState.sheets[activeSheetIndex]) return;

    var sheet = spreadsheetState.sheets[activeSheetIndex];
    window.TableRenderer.renderTable(sheet, spreadsheetContainer, onCellEdit);

    // Update Formula Inspector if it is visible
    var registrySidebar = document.getElementById('registry-sidebar');
    if (registrySidebar && registrySidebar.style.display !== 'none') {
      updateFormulaInspector();
    }
  }

  // ========== CELL EDIT HANDLER ==========
  function onCellEdit(rowId, colId, newValue) {
    if (!spreadsheetState || !spreadsheetState.sheets[activeSheetIndex]) return;

    var sheet = spreadsheetState.sheets[activeSheetIndex];
    var rows = sheet.rows;
    var row = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === rowId) {
        row = rows[i];
        break;
      }
    }

    if (!row) return;

    if (!row.cells) {
      row.cells = {};
    }

    if (!row.cells[colId]) {
      row.cells[colId] = { value: newValue };
    } else {
      row.cells[colId].value = newValue;
      // Clear any previous computed value so the raw value is used
      delete row.cells[colId]._cv;
    }

    // Try to parse as number if it looks numeric
    if (newValue !== '' && !isNaN(newValue) && newValue.trim() !== '') {
      row.cells[colId].value = Number(newValue);
    }

    // Re-evaluate all formulas on this sheet and re-render
    if (window.FormulaEngine) {
      window.FormulaEngine.evaluateSheet(sheet);
      renderActiveSheet();
    }
    if (currentViewMode === 'charts' || currentViewMode === 'split') {
      renderCharts();
    }
    saveCurrentProject();
  }

  // ========== FILE CHIPS ==========
  function renderFileChips() {
    if (!filePreview) return;
    filePreview.innerHTML = '';

    attachedFiles.forEach(function (file, index) {
      var chip = document.createElement('div');
      chip.className = 'file-chip';

      if (file.type === 'image') {
        var img = document.createElement('img');
        img.className = 'file-chip-thumb';
        img.src = file.content;
        chip.appendChild(img);
      }

      var nameSpan = document.createElement('span');
      nameSpan.className = 'file-chip-name';
      nameSpan.textContent = file.name;

      var removeBtn = document.createElement('button');
      removeBtn.className = 'file-chip-remove';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', function () {
        attachedFiles.splice(index, 1);
        renderFileChips();
        updateSendBtnState();
      });

      chip.appendChild(nameSpan);
      chip.appendChild(removeBtn);
      filePreview.appendChild(chip);
    });
  }

  // ========== API KEY STATUS ==========
  function updateApiKeyStatus(connected) {
    if (apiKeyStatus) {
      if (connected) {
        apiKeyStatus.classList.add('connected');
      } else {
        apiKeyStatus.classList.remove('connected');
      }
    }
    if (settingsApiKeyStatus) {
      if (connected) {
        settingsApiKeyStatus.classList.add('connected');
      } else {
        settingsApiKeyStatus.classList.remove('connected');
      }
    }
    if (apiKeyStatusText) {
      apiKeyStatusText.textContent = connected ? 'Connected' : 'Disconnected';
      apiKeyStatusText.className = 'status-text ' + (connected ? 'connected' : 'disconnected');
    }
  }

  // ========== LOAD API KEY FROM LOCAL .ENV ==========
  async function loadEnvApiKey() {
    if (window.logTelemetry) {
      window.logTelemetry('[SYS] Contacting local environment configuration...', 'system');
    }

    // Try fetching Vercel production environment configs first
    try {
      var configResponse = await fetch('/api/config');
      if (configResponse.ok) {
        var configData = await configResponse.json();
        if (configData.supabaseUrl) {
          localStorage.setItem('supabase_url', configData.supabaseUrl);
        }
        if (configData.supabaseAnonKey) {
          localStorage.setItem('supabase_anon_key', configData.supabaseAnonKey);
        }

        // If server has an API key configured, store a sentinel value so the
        // UI knows AI features are available without exposing the real key.
        if (configData.hasServerApiKey) {
          var providerLabel = configData.serverProvider === 'nvidia' ? 'NVIDIA API Catalog' : 'Moonshot AI';
          // Use 'server-managed' sentinel — api/generate-sheet uses process.env key directly
          if (!localStorage.getItem('nvidia_api_key') && !localStorage.getItem('quaasx_api_key')) {
            if (configData.serverProvider === 'nvidia') {
              localStorage.setItem('nvidia_api_key', 'server-managed');
            } else {
              localStorage.setItem('quaasx_api_key', 'server-managed');
            }
          }
          if (window.logTelemetry) {
            window.logTelemetry('[SYS] Server-side API key detected. Provider: ' + providerLabel + '. AI features enabled.', 'success-line');
          }
        }
      }
    } catch (err) {
      console.log('Production config check skipped:', err.message);
    }

    var isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    var moonshotKey = null;
    var nvidiaKey = null;
    if (!isProduction) {
      try {
        var response = await fetch('.env');
        if (response.ok) {
          var text = await response.text();
          
          // Parse Moonshot Key
          var moonshotMatch = text.match(/MOONSHOT_API_KEY\s*=\s*(.*)/) || text.match(/QUAASX_API_KEY\s*=\s*(.*)/);
          if (moonshotMatch && moonshotMatch[1]) {
            var cleanMoonshot = moonshotMatch[1].trim().replace(/['"]/g, '');
            if (cleanMoonshot !== 'your_actual_moonshot_api_key_here') {
              moonshotKey = cleanMoonshot;
            }
          }

          // Parse NVIDIA Key
          var nvidiaMatch = text.match(/NVIDIA_API_KEY\s*=\s*(.*)/);
          if (nvidiaMatch && nvidiaMatch[1]) {
            var cleanNvidia = nvidiaMatch[1].trim().replace(/['"]/g, '');
            if (cleanNvidia !== 'nvapi-your_actual_nvidia_api_key_here') {
              nvidiaKey = cleanNvidia;
            }
          }

          // Parse Supabase Credentials
          var supabaseUrlMatch = text.match(/SUPABASE_URL\s*=\s*(.*)/);
          var supabaseKeyMatch = text.match(/SUPABASE_ANON_KEY\s*=\s*(.*)/);
          if (supabaseUrlMatch && supabaseUrlMatch[1]) {
            localStorage.setItem('supabase_url', supabaseUrlMatch[1].trim().replace(/['"]/g, ''));
          }
          if (supabaseKeyMatch && supabaseKeyMatch[1]) {
            localStorage.setItem('supabase_anon_key', supabaseKeyMatch[1].trim().replace(/['"]/g, ''));
          }
        }
      } catch (e) {
        if (window.logTelemetry) {
          window.logTelemetry('[SYS] Local .env file could not be fetched (CORS or file:// restriction).', 'system');
        }
      }
    }

    // Save configurations
    if (moonshotKey) {
      localStorage.setItem('quaasx_api_key', moonshotKey);
    }
    if (nvidiaKey) {
      localStorage.setItem('nvidia_api_key', nvidiaKey);
    }

    // Initialize Supabase Client
    initSupabaseClient();

    var activeKey = getSavedApiKey();
    if (activeKey) {
      // Don't show the sentinel value in the input box
      if (activeKey === 'server-managed') {
        if (apiKeyInput) {
          apiKeyInput.value = '';
          apiKeyInput.placeholder = '🔒 Server Key Active (NVIDIA)';
        }
      } else {
        if (apiKeyInput) apiKeyInput.value = activeKey;
      }
      updateApiKeyStatus(true);
      if (window.logTelemetry && activeKey !== 'server-managed') {
        var providerName = activeKey.startsWith('nvapi-') ? 'NVIDIA API Catalog' : 'Moonshot AI';
        window.logTelemetry('[SYS] API configuration resolved. Active provider: ' + providerName + '.', 'success-line');
      }
    } else {
      updateApiKeyStatus(false);
      if (window.logTelemetry) {
        window.logTelemetry('[WARNING] No API key configured. Enter your NVIDIA or Moonshot key in the settings panel to enable AI workbook generation.', 'error-line');
      }
    }
  }

  // ========== TEXTAREA AUTO-RESIZE ==========
  function autoResizeTextarea() {
    if (!userInput) return;
    userInput.style.height = 'auto';
    var newHeight = Math.min(userInput.scrollHeight, 120);
    userInput.style.height = newHeight + 'px';
  }

  // ========== SEND BUTTON STATE ==========
  function updateSendBtnState() {
    if (!sendBtn || !userInput) return;
    if (isGenerating) return; // Don't change during generation
    var hasText = userInput.value.trim().length > 0;
    var hasFiles = attachedFiles.length > 0;
    sendBtn.disabled = !(hasText || hasFiles);
  }

  // ========== SEND / STOP BUTTON TOGGLE ==========
  function updateSendButton() {
    if (!sendBtn) return;
    if (isGenerating) {
      sendBtn.innerHTML = STOP_ICON_SVG;
      sendBtn.classList.add('stop-btn');
      sendBtn.disabled = false;
    } else {
      sendBtn.innerHTML = SEND_ICON_SVG;
      sendBtn.classList.remove('stop-btn');
      updateSendBtnState();
    }
  }

  // ========== MODE BUTTONS ==========
  function updateModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.mode === currentMode);
    });
  }

  // ========== THINKING WINDOW ==========
  function showThinkingWindow() {
    var el = document.getElementById('thinking-window');
    var textEl = document.getElementById('thinking-text');
    var rawEl = document.getElementById('compilation-raw');
    var treeEl = document.getElementById('compilation-tree');
    var contentEl = document.getElementById('thinking-content');
    var toggleBtn = document.getElementById('thinking-toggle');
    if (el) el.style.display = 'block';
    if (textEl) textEl.textContent = '';
    if (rawEl) rawEl.textContent = '';
    if (treeEl) treeEl.textContent = 'Awaiting spreadsheet compilation stream...';
    if (contentEl) contentEl.classList.remove('collapsed');
    if (toggleBtn) toggleBtn.classList.remove('collapsed');
    
    // Reset tabs
    focusReasoningTab();
    updateThinkingStatus('AI is reasoning...');
  }

  function hideThinkingWindow() {
    var el = document.getElementById('thinking-window');
    if (el) el.style.display = 'none';
  }

  function focusReasoningTab() {
    if (btnThinkingReasoning) btnThinkingReasoning.classList.add('active');
    if (btnThinkingCompilation) btnThinkingCompilation.classList.remove('active');
    
    var textEl = document.getElementById('thinking-text');
    if (textEl) textEl.style.display = 'block';
    if (compilationPane) compilationPane.style.display = 'none';
    
    // Auto-scroll to bottom of active tab
    var container = document.getElementById('thinking-content');
    if (container && !isScrollLocked) container.scrollTop = container.scrollHeight;
  }

  function focusCompilationTab() {
    if (btnThinkingCompilation) btnThinkingCompilation.classList.add('active');
    if (btnThinkingReasoning) btnThinkingReasoning.classList.remove('active');
    
    var textEl = document.getElementById('thinking-text');
    if (textEl) textEl.style.display = 'none';
    if (compilationPane) compilationPane.style.display = 'block';
    
    updateCompilerViewMode();
    
    // Auto-scroll to bottom of active tab
    var container = document.getElementById('thinking-content');
    if (container && !isScrollLocked) container.scrollTop = container.scrollHeight;
  }

  function updateCompilerViewMode() {
    if (!compilationRaw || !compilationTree || !btnCompilerViewType) return;
    if (compilerViewType === 'tree') {
      compilationRaw.style.display = 'none';
      compilationTree.style.display = 'block';
      btnCompilerViewType.textContent = 'Raw JSON';
      btnCompilerViewType.classList.remove('active');
    } else {
      compilationRaw.style.display = 'block';
      compilationTree.style.display = 'none';
      btnCompilerViewType.textContent = 'Visual Tree';
      btnCompilerViewType.classList.add('active');
    }
  }

  function updateThinkingText(text) {
    var el = document.getElementById('thinking-text');
    if (el) {
      el.textContent = text;
      if (!isScrollLocked) {
        var container = document.getElementById('thinking-content');
        if (container) container.scrollTop = container.scrollHeight;
      }
    }
  }

  function updateCompilationText(text) {
    if (compilationRaw) {
      compilationRaw.textContent = text;
      if (!isScrollLocked) {
        var container = document.getElementById('thinking-content');
        if (container) container.scrollTop = container.scrollHeight;
      }
    }
    parseIncomingSpreadsheetJSON(text);
  }

  function updateThinkingStatus(status) {
    var el = document.getElementById('thinking-status-text');
    if (el) el.textContent = status;
  }

  // ========== LIVE PARTIAL JSON PARSER (VISUAL COMPILER TREE) ==========
  function parseIncomingSpreadsheetJSON(text) {
    if (!compilationTree) return;

    // Extract title
    var titleMatch = text.match(/"title"\s*:\s*"([^"\r\n]*)"?/) || text.match(/"title"\s*:\s*([^,}\s]*)/);
    var title = titleMatch ? titleMatch[1].replace(/['"]/g, '').trim() : "";
    title = title || "Analyzing schema...";

    // Extract sheet definitions
    var sheets = [];
    var sheetRegex = /"name"\s*:\s*"([^"\r\n]*)"?/g;
    var match;
    while ((match = sheetRegex.exec(text)) !== null) {
      var sheetName = match[1].trim();
      if (sheetName) {
        sheets.push({ name: sheetName, columns: [], pos: match.index });
      }
    }

    // Segment text by sheet boundaries to distribute columns accurately
    if (sheets.length > 0) {
      for (var i = 0; i < sheets.length; i++) {
        var startPos = sheets[i].pos;
        var endPos = (i + 1 < sheets.length) ? sheets[i + 1].pos : text.length;
        var sheetSegment = text.slice(startPos, endPos);

        // Find columns in this segment.
        // We match all complete and incomplete curly brace blocks
        var colBlocks = sheetSegment.match(/\{[^{}]*\}/g) || [];
        var lastIncompleteBlock = sheetSegment.match(/\{[^{}]*$/);
        if (lastIncompleteBlock) {
          colBlocks.push(lastIncompleteBlock[0]);
        }

        colBlocks.forEach(function (block) {
          var idMatch = block.match(/"id"\s*:\s*"([^"\r\n]*)"?/) || block.match(/"id"\s*:\s*([^,}\s]*)/);
          var titleMatch = block.match(/"title"\s*:\s*"([^"\r\n]*)"?/) || block.match(/"title"\s*:\s*([^,}\s]*)/);
          var formulaMatch = block.match(/"formula"\s*:\s*"([^"\r\n]*)"?/) || block.match(/"formula"\s*:\s*([^,}\s]*)/);

          if (idMatch || titleMatch) {
            var id = idMatch ? idMatch[1].replace(/['"]/g, '').trim() : '';
            var colTitle = titleMatch ? titleMatch[1].replace(/['"]/g, '').trim() : '';
            var formula = formulaMatch ? formulaMatch[1].replace(/['"]/g, '').trim() : null;

            // Only add if it looks like a column (columns have ids starting with 'col_', or at least a title)
            // We ignore blocks that are actually sheet level definitions
            if (id.indexOf('col_') === 0 || id.length === 0 || colTitle.length > 0) {
              // Avoid duplicates
              var isDuplicate = sheets[i].columns.some(function (c) {
                return (id && c.id === id) || (colTitle && c.title === colTitle);
              });
              if (!isDuplicate) {
                sheets[i].columns.push({
                  id: id,
                  title: colTitle || id || "Column",
                  formula: formula
                });
              }
            }
          }
        });
      }
    }

    // Generate Visual Tree HTML
    var html = '';
    html += '<div class="compiler-node" style="margin-bottom:10px; font-weight:600;">';
    html += '<span class="compiler-branch">⚙️</span> <span style="color:var(--accent-primary); text-transform:uppercase; letter-spacing:0.5px;">Live Spreadsheet Compiler Tree</span>';
    html += '</div>';

    html += '<div class="compiler-node" style="padding-left:14px; margin-bottom:12px;">';
    html += '<span class="compiler-branch">📁</span> Workbook: <span style="color:var(--text-primary); font-weight:600;">' + title + '</span>';
    html += '</div>';

    if (sheets.length === 0) {
      html += '<div class="compiler-node" style="padding-left:28px; color:var(--text-muted); font-style:italic;">';
      html += 'Scanning for sheets schema...';
      html += '</div>';
    } else {
      sheets.forEach(function (sheet, sIdx) {
        var isLastSheet = (sIdx === sheets.length - 1);
        var sheetBranch = isLastSheet ? '└──' : '├──';
        html += '<div class="compiler-node" style="padding-left:14px; margin-bottom:4px;">';
        html += '<span class="compiler-branch" style="color:var(--accent-primary);">' + sheetBranch + '</span> <span class="compiler-sheet">📂 Sheet: ' + sheet.name + '</span>';
        html += '</div>';

        if (sheet.columns.length === 0) {
          var colBranch = isLastSheet ? '&nbsp;&nbsp;&nbsp;&nbsp;└──' : '│&nbsp;&nbsp;&nbsp;└──';
          html += '<div class="compiler-node" style="padding-left:28px; color:var(--text-muted); font-style:italic;">';
          html += '<span class="compiler-branch">' + colBranch + '</span> Compiling column schema...';
          html += '</div>';
        } else {
          sheet.columns.forEach(function (col, cIdx) {
            var isLastCol = (cIdx === sheet.columns.length - 1);
            var sheetIndent = isLastSheet ? '&nbsp;&nbsp;&nbsp;&nbsp;' : '│&nbsp;&nbsp;&nbsp;';
            var colBranch = isLastCol ? '└──' : '├──';

            html += '<div class="compiler-node" style="padding-left:28px; margin: 2px 0;">';
            html += '<span class="compiler-branch" style="color:var(--border-color);">' + sheetIndent + colBranch + '</span> ';
            html += '<span class="compiler-column">📊 ' + col.title + '</span>';
            if (col.formula) {
              html += ' <span class="compiler-formula">ƒ: ' + col.formula + '</span>';
            } else {
              html += ' <span class="compiler-badge">Static</span>';
            }
            html += '</div>';
          });
        }
      });
    }

    compilationTree.innerHTML = html;
  }

  // ========== STREAMING CHAT BUBBLE HELPERS ==========
  function addStreamingAssistantBubble() {
    var welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    var div = document.createElement('div');
    div.className = 'chat-message assistant streaming-bubble';

    var indicator = document.createElement('div');
    indicator.className = 'thinking-indicator';
    indicator.innerHTML = '<div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div><span class="thinking-label">Synthesizing...</span>';

    div.appendChild(indicator);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return div;
  }

  function updateThinkingStatus(status) {
    var el = document.getElementById('thinking-status-text');
    if (el) el.textContent = status;
  }

  function initializeAgenticBubble(bubbleEl, mode, requiresResearch) {
    bubbleEl.innerHTML = '';
    
    // Create Agent Badge
    var badge = document.createElement('div');
    badge.className = 'agent-badge';
    badge.innerHTML = '<span class="agent-badge-dot"></span><span class="agent-badge-name">Initializing Agent...</span>';
    bubbleEl.appendChild(badge);

    // Create Agent Steps Checklist
    var stepsContainer = document.createElement('div');
    stepsContainer.className = 'agent-steps';
    
    var steps = [];
    steps.push({ id: 'research', label: 'Web Research Scraper', icon: '🔍' });
    steps.push({ id: 'planning', label: 'Layout Blueprinting', icon: '📋' });

    if (mode === 'plan') {
      steps.push({ id: 'finalizing', label: 'Finalizing Blueprint', icon: '✨' });
    } else {
      steps.push({ id: 'assembly', label: 'Synthesis & Assembly', icon: '⚡' });
      steps.push({ id: 'audit', label: 'Sandbox Formula Audit', icon: '📐' });
    }

    steps.forEach(function (step) {
      var stepDiv = document.createElement('div');
      stepDiv.className = 'agent-step';
      stepDiv.id = 'agent-step-' + step.id;
      stepDiv.innerHTML = '<span class="agent-step-icon">' + step.icon + '</span><span class="agent-step-label">' + step.label + '</span>';
      stepsContainer.appendChild(stepDiv);
    });

    bubbleEl.appendChild(stepsContainer);
  }

  function updateAgenticStep(bubbleEl, agentName, statusText, mode, requiresResearch) {
    var badgeNameEl = bubbleEl.querySelector('.agent-badge-name');
    if (badgeNameEl) {
      badgeNameEl.textContent = agentName;
    }

    function setStepState(stepId, state) {
      var el = bubbleEl.querySelector('#agent-step-' + stepId);
      if (!el) return;
      
      el.className = 'agent-step'; // reset
      var iconEl = el.querySelector('.agent-step-icon');
      var labelEl = el.querySelector('.agent-step-label');
      
      if (state === 'active') {
        el.classList.add('active');
        if (iconEl) iconEl.textContent = '⚡';
      } else if (state === 'completed') {
        el.classList.add('completed');
        if (iconEl) iconEl.textContent = '✔';
      } else if (state === 'skipped') {
        el.classList.add('completed');
        el.style.opacity = '0.4';
        if (iconEl) iconEl.textContent = '⏭';
        if (labelEl && !labelEl.textContent.includes('(Skipped)')) {
          labelEl.textContent += ' (Skipped)';
        }
      }
    }

    var agent = agentName.toLowerCase();
    if (agent.includes('research')) {
      setStepState('research', 'active');
    } else if (agent.includes('planner')) {
      if (requiresResearch) {
        setStepState('research', 'completed');
      } else {
        setStepState('research', 'skipped');
      }
      setStepState('planning', 'active');
    } else if (agent.includes('worker') || agent.includes('assembler')) {
      if (requiresResearch) {
        setStepState('research', 'completed');
      } else {
        setStepState('research', 'skipped');
      }
      setStepState('planning', 'completed');
      if (mode !== 'plan') {
        setStepState('assembly', 'active');
      }
    } else if (agent.includes('validator')) {
      if (requiresResearch) {
        setStepState('research', 'completed');
      } else {
        setStepState('research', 'skipped');
      }
      setStepState('planning', 'completed');
      setStepState('assembly', 'completed');
      setStepState('audit', 'active');
    } else if (agent.includes('healing') || agent.includes('auditor')) {
      var stepsContainer = bubbleEl.querySelector('.agent-steps');
      var healStep = bubbleEl.querySelector('#agent-step-healing');
      if (stepsContainer && !healStep) {
        healStep = document.createElement('div');
        healStep.className = 'agent-step active';
        healStep.id = 'agent-step-healing';
        healStep.innerHTML = '<span class="agent-step-icon">⚡</span><span class="agent-step-label">Self-Healing Optimization</span>';
        stepsContainer.appendChild(healStep);
      }
      
      if (requiresResearch) {
        setStepState('research', 'completed');
      } else {
        setStepState('research', 'skipped');
      }
      setStepState('planning', 'completed');
      setStepState('assembly', 'completed');
      setStepState('audit', 'completed');
      if (healStep) {
        healStep.className = 'agent-step active';
        var icon = healStep.querySelector('.agent-step-icon');
        if (icon) icon.textContent = '⚡';
      }
    } else if (agent.includes('system') || agent.includes('core')) {
      if (requiresResearch) {
        setStepState('research', 'completed');
      } else {
        setStepState('research', 'skipped');
      }
      setStepState('planning', 'completed');
      if (mode === 'plan') {
        setStepState('finalizing', 'completed');
      } else {
        setStepState('assembly', 'completed');
        setStepState('audit', 'completed');
        var healStep = bubbleEl.querySelector('#agent-step-healing');
        if (healStep) {
          healStep.className = 'agent-step completed';
          var icon = healStep.querySelector('.agent-step-icon');
          if (icon) icon.textContent = '✔';
        }
      }
    }
  }


  // ========== PLAN MESSAGE WITH EXECUTE BUTTON ==========
  function addPlanMessage(planText, originalRequest) {
    var welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    var div = document.createElement('div');
    div.className = 'chat-message assistant plan-message';

    var contentDiv = document.createElement('div');
    contentDiv.className = 'plan-content';
    contentDiv.textContent = planText;

    var executeBtn = document.createElement('button');
    executeBtn.className = 'execute-plan-btn';
    executeBtn.innerHTML = '\u25b6 Execute this plan';
    executeBtn.addEventListener('click', function () {
      currentMode = 'build';
      updateModeButtons();
      userInput.value = 'Execute this plan exactly as described:\n\n' + planText + '\n\nOriginal request: ' + originalRequest;
      autoResizeTextarea();
      handleSend();
      executeBtn.disabled = true;
      executeBtn.textContent = '\u2713 Executing...';
    });

    div.appendChild(contentDiv);
    div.appendChild(executeBtn);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Track for persistence
    chatDisplayMessages.push({ type: 'plan', planText: planText, originalRequest: originalRequest });
    saveCurrentProject();
  }

  // ================================================================
  //  PROJECT MANAGEMENT
  // ================================================================

  function createProject(name) {
    var proj = {
      id: 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: name || 'New Chat',
      spreadsheetState: null,
      chatHistory: [],
      chatDisplayMessages: [],
      activeSheetIndex: 0,
      currentMode: 'build',
      currentViewMode: 'table',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    projects.unshift(proj); // Add to top
    return proj;
  }

  function saveCurrentProject() {
    if (!activeProjectId) return;
    var proj = projects.find(function (p) { return p.id === activeProjectId; });
    if (!proj) return;

    proj.spreadsheetState = spreadsheetState;
    proj.chatHistory = chatHistory;
    proj.chatDisplayMessages = chatDisplayMessages;
    proj.activeSheetIndex = activeSheetIndex;
    proj.currentMode = currentMode;
    proj.currentViewMode = currentViewMode;
    proj.updatedAt = Date.now();

    saveProjectsToStorage();

    // Mark as dirty for Supabase background sync
    if (supabase && window.supabaseLoggedIn) {
      dirtyProjectIds.add(activeProjectId);
    }
  }

  function switchToProject(projectId) {
    if (isGenerating) return; // Don't switch while generating
    if (projectId === activeProjectId) return;

    // Save current project first
    saveCurrentProject();

    // Find and load the target project
    var proj = projects.find(function (p) { return p.id === projectId; });
    if (!proj) return;

    activeProjectId = proj.id;
    spreadsheetState = proj.spreadsheetState || null;
    chatHistory = proj.chatHistory || [];
    chatDisplayMessages = proj.chatDisplayMessages || [];
    activeSheetIndex = proj.activeSheetIndex || 0;
    currentMode = proj.currentMode || 'build';
    currentViewMode = proj.currentViewMode || 'table';

    // Update UI
    renderChatFromDisplayMessages();
    updateModeButtons();
    updateSubscriptionUI();

    if (spreadsheetState) {
      if (window.FormulaEngine) {
        spreadsheetState.sheets.forEach(function (sh) {
          window.FormulaEngine.evaluateSheet(sh);
        });
      }
      renderSheetTabs();
      renderActiveSheet();
      if (downloadBtn) downloadBtn.disabled = false;
      if (emptyState) emptyState.style.display = 'none';
      if (viewToggle) viewToggle.style.display = 'flex';
      setViewMode(currentViewMode);
    } else {
      if (spreadsheetContainer) spreadsheetContainer.innerHTML = '<div id="empty-state" class="empty-state"><div class="empty-icon">\uD83D\uDCCA</div><h3>Welcome to quaasx-excel</h3><p>Powered by Quaasx Computers. Describe what you need in the chat, and the AI will generate it for you.</p></div>';
      emptyState = document.getElementById('empty-state');
      if (sheetTabs) sheetTabs.innerHTML = '';
      if (downloadBtn) downloadBtn.disabled = true;
      if (viewToggle) viewToggle.style.display = 'none';
      setViewMode('table');
    }

    localStorage.setItem(ACTIVE_KEY, activeProjectId);
    renderProjectSidebar();
  }

  function handleNewProject() {
    if (isGenerating) return;
    saveCurrentProject();

    var proj = createProject();
    activeProjectId = proj.id;

    // Reset state
    spreadsheetState = null;
    chatHistory = [];
    chatDisplayMessages = [];
    activeSheetIndex = 0;
    currentMode = 'build';
    currentViewMode = 'table';
    attachedFiles = [];

    // Reset UI
    renderChatFromDisplayMessages();
    updateModeButtons();
    updateSubscriptionUI();
    if (spreadsheetContainer) spreadsheetContainer.innerHTML = '<div id="empty-state" class="empty-state"><div class="empty-icon">\uD83D\uDCCA</div><h3>Welcome to quaasx-excel</h3><p>Powered by Quaasx Computers. Describe what you need in the chat, and the AI will generate it for you.</p></div>';
    emptyState = document.getElementById('empty-state');
    if (sheetTabs) sheetTabs.innerHTML = '';
    if (downloadBtn) downloadBtn.disabled = true;
    if (filePreview) filePreview.innerHTML = '';
    if (userInput) { userInput.value = ''; autoResizeTextarea(); }
    if (viewToggle) viewToggle.style.display = 'none';
    setViewMode('table');
    updateSendBtnState();

    saveProjectsToStorage();
    localStorage.setItem(ACTIVE_KEY, activeProjectId);
    renderProjectSidebar();
  }

  function deleteProject(projectId) {
    if (projects.length <= 1) return; // Keep at least one project
    projects = projects.filter(function (p) { return p.id !== projectId; });

    if (activeProjectId === projectId) {
      // Switch to first remaining project
      switchToProject(projects[0].id);
    }

    saveProjectsToStorage();
    renderProjectSidebar();
  }

  function autoNameProject(userMessage) {
    var proj = projects.find(function (p) { return p.id === activeProjectId; });
    if (!proj || proj.name !== 'New Chat') return;
    // Take first 40 chars of user message
    proj.name = userMessage.substring(0, 40) + (userMessage.length > 40 ? '...' : '');
    saveProjectsToStorage();
    renderProjectSidebar();
  }

  // ========== RENDER CHAT FROM SAVED DISPLAY MESSAGES ==========
  function renderChatFromDisplayMessages() {
    if (!chatMessages) return;

    // Show welcome if no messages
    if (chatDisplayMessages.length === 0) {
      chatMessages.innerHTML = '<div class="welcome-message"><h3>Welcome to quaasx-excel!</h3><p>Powered by Quaasx Computers. Describe the spreadsheet you want to create, or upload a file to extract data from.</p><div class="suggestions"><button class="suggestion-chip" data-prompt="Create a monthly budget tracker with categories, planned vs actual spending, and a summary row">\uD83D\uDCCB Budget Tracker</button><button class="suggestion-chip" data-prompt="Create a project timeline with tasks, assignees, start dates, end dates, status, and priority">\uD83D\uDCC5 Project Timeline</button><button class="suggestion-chip" data-prompt="Create a sales report with product names, quantities, unit prices, totals, and regional breakdown across 2 sheets">\uD83D\uDCCA Sales Report</button></div></div>';
      return;
    }

    chatMessages.innerHTML = '';
    chatDisplayMessages.forEach(function (msg) {
      if (msg.type === 'plan') {
        // Re-create plan message (without re-tracking)
        var div = document.createElement('div');
        div.className = 'chat-message assistant plan-message';
        var contentDiv = document.createElement('div');
        contentDiv.className = 'plan-content';
        contentDiv.textContent = msg.planText;
        var executeBtn = document.createElement('button');
        executeBtn.className = 'execute-plan-btn';
        executeBtn.innerHTML = '\u25b6 Execute this plan';
        executeBtn.addEventListener('click', function () {
          currentMode = 'build';
          updateModeButtons();
          userInput.value = 'Execute this plan exactly as described:\n\n' + msg.planText + '\n\nOriginal request: ' + msg.originalRequest;
          autoResizeTextarea();
          handleSend();
          executeBtn.disabled = true;
          executeBtn.textContent = '\u2713 Executing...';
        });
        div.appendChild(contentDiv);
        div.appendChild(executeBtn);
        chatMessages.appendChild(div);
      } else {
        var div = document.createElement('div');
        div.className = 'chat-message ' + msg.type;
        div.textContent = msg.text || '';

        // Render attachments if any
        if (msg.files && msg.files.length > 0) {
          var attachmentsDiv = document.createElement('div');
          attachmentsDiv.className = 'message-attachments';
          
          msg.files.forEach(function (file) {
            if (file.type === 'image') {
              var img = document.createElement('img');
              img.className = 'message-attachment-image';
              img.src = file.content;
              img.addEventListener('click', function () {
                var win = window.open();
                if (win) {
                  win.document.write('<iframe src="' + file.content + '" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>');
                }
              });
              attachmentsDiv.appendChild(img);
            } else {
              var docChip = document.createElement('div');
              docChip.className = 'message-attachment-file';
              docChip.innerHTML = '📄 <span style="font-weight: 500;">' + file.name + '</span>';
              attachmentsDiv.appendChild(docChip);
            }
          });
          div.appendChild(attachmentsDiv);
        }
        
        // Add Convert to Plan button for assistant messages
        if (msg.type === 'assistant') {
          var btn = document.createElement('button');
          btn.className = 'convert-plan-btn';
          btn.innerHTML = '💡 Convert this conversation to a structured plan';
          btn.addEventListener('click', function () {
            currentMode = 'plan';
            updateModeButtons();
            userInput.value = 'Based on our discussion, convert this conversation to a structured plan to build the spreadsheet.';
            autoResizeTextarea();
            handleSend();
          });
          div.appendChild(btn);
        }
        
        chatMessages.appendChild(div);
      }
    });

    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // ========== PROJECT SIDEBAR RENDERING ==========
  function renderProjectSidebar() {
    var list = document.getElementById('project-list');
    if (!list) return;
    list.innerHTML = '';

    projects.forEach(function (proj) {
      var item = document.createElement('div');
      item.className = 'project-item' + (proj.id === activeProjectId ? ' active' : '');
      item.dataset.id = proj.id;

      var icon = document.createElement('div');
      icon.className = 'project-icon';
      icon.textContent = proj.spreadsheetState ? '\uD83D\uDCCA' : '\uD83D\uDCAC';

      var info = document.createElement('div');
      info.className = 'project-info';

      var name = document.createElement('span');
      name.className = 'project-name';
      name.textContent = proj.name;

      var date = document.createElement('span');
      date.className = 'project-date';
      date.textContent = relativeTime(proj.updatedAt);

      info.appendChild(name);
      info.appendChild(date);

      item.appendChild(icon);
      item.appendChild(info);

      // Delete button (only if more than 1 project)
      if (projects.length > 1) {
        var delBtn = document.createElement('button');
        delBtn.className = 'project-delete';
        delBtn.textContent = '\u00d7';
        delBtn.title = 'Delete';
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          deleteProject(proj.id);
        });
        item.appendChild(delBtn);
      }

      item.addEventListener('click', function () {
        switchToProject(proj.id);
      });

      list.appendChild(item);
    });
  }

  // ========== RELATIVE TIME ==========
  function relativeTime(timestamp) {
    var diff = Date.now() - timestamp;
    var seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'Just now';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.floor(hours / 24);
    if (days < 7) return days + 'd ago';
    return new Date(timestamp).toLocaleDateString();
  }

  // ========== LOCAL STORAGE ==========
  function saveProjectsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {
      console.warn('Failed to save projects:', e.message);
    }
  }

  function loadProjectsFromStorage() {
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        projects = JSON.parse(data);
      }
    } catch (e) {
      projects = [];
    }

    // Ensure at least one project exists
    if (!projects.length) {
      createProject();
    }

    // Restore active project
    var savedActiveId = localStorage.getItem(ACTIVE_KEY);
    if (savedActiveId && projects.find(function (p) { return p.id === savedActiveId; })) {
      activeProjectId = savedActiveId;
    } else {
      activeProjectId = projects[0].id;
    }

    // Load active project state
    var proj = projects.find(function (p) { return p.id === activeProjectId; });
    if (proj) {
      spreadsheetState = proj.spreadsheetState || null;
      chatHistory = proj.chatHistory || [];
      chatDisplayMessages = proj.chatDisplayMessages || [];
      activeSheetIndex = proj.activeSheetIndex || 0;
      currentMode = proj.currentMode || 'build';
      currentViewMode = proj.currentViewMode || 'table';
    }

    // Render UI
    renderChatFromDisplayMessages();
    updateModeButtons();
    updateSubscriptionUI();

    if (spreadsheetState) {
      if (window.FormulaEngine) {
        spreadsheetState.sheets.forEach(function (sh) {
          window.FormulaEngine.evaluateSheet(sh);
        });
      }
      renderSheetTabs();
      renderActiveSheet();
      if (downloadBtn) downloadBtn.disabled = false;
      if (emptyState) emptyState.style.display = 'none';
      if (viewToggle) viewToggle.style.display = 'flex';
      setViewMode(currentViewMode);
    } else {
      if (viewToggle) viewToggle.style.display = 'none';
      setViewMode('table');
    }

    renderProjectSidebar();

    // Wire sidebar new-project button
    var newBtn = document.getElementById('new-project-btn');
    if (newBtn) {
      newBtn.addEventListener('click', handleNewProject);
    }

    // Wire chat header new-chat (keep spreadsheet) button
    var newChatKeepSheetBtn = document.getElementById('new-chat-keep-sheet-btn');
    if (newChatKeepSheetBtn) {
      newChatKeepSheetBtn.addEventListener('click', function () {
        if (isGenerating) return;
        if (confirm('Start a new chat session? This will clear the chat history but keep your current spreadsheet.')) {
          // Clear history
          chatHistory = [];
          chatDisplayMessages = [];
          
          // Re-render chat display (shows welcome screen)
          renderChatFromDisplayMessages();
          
          // Save project
          saveCurrentProject();
          
          if (window.logTelemetry) {
            window.logTelemetry('[SYS] Started a new chat session. Spreadsheet preserved.', 'system');
          }
        }
      });
    }
  }

  // ========== VIEW TOGGLE HANDLER ==========
  function setViewMode(view) {
    currentViewMode = view;

    // Update active class on view buttons
    if (viewToggle) {
      var viewBtns = viewToggle.querySelectorAll('.view-btn');
      viewBtns.forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.view === view);
      });
    }

    // Reset layouts
    if (spreadsheetWorkspace) {
      spreadsheetWorkspace.classList.toggle('split-view', view === 'split');
    }

    if (spreadsheetContainer) {
      if (view === 'charts') {
        spreadsheetContainer.style.display = 'none';
      } else {
        spreadsheetContainer.style.display = 'block';
      }
    }

    if (chartsContainer) {
      if (view === 'table') {
        chartsContainer.style.display = 'none';
        window.ChartRenderer.destroyAll();
      } else {
        chartsContainer.style.display = 'grid';
        renderCharts();
      }
    }

    saveCurrentProject();
  }

  // ========== FORCE REFRESH HANDLER ==========
  function handleRefresh() {
    if (!spreadsheetState) {
      if (window.logTelemetry) {
        window.logTelemetry('[WARNING] No active spreadsheet state to refresh.', 'error-line');
      }
      return;
    }

    // Trigger rotate animation on the refresh icon
    if (refreshBtn) {
      var svg = refreshBtn.querySelector('svg');
      if (svg) {
        svg.classList.remove('rotate-animation');
        // Trigger reflow to restart animation
        void svg.offsetWidth;
        svg.classList.add('rotate-animation');
      }
    }

    if (window.logTelemetry) {
      window.logTelemetry('[SYS] Force recalculation stream requested...', 'system');
    }

    var startTime = performance.now();

    // Evaluate all sheets
    if (spreadsheetState.sheets) {
      spreadsheetState.sheets.forEach(function (sheet) {
        if (window.FormulaEngine) {
          window.FormulaEngine.evaluateSheet(sheet);
        }
      });
    }

    // Re-render spreadsheet active sheet
    renderActiveSheet();

    // Re-render charts if in chart/split view
    if (currentViewMode === 'charts' || currentViewMode === 'split') {
      renderCharts();
    }

    var duration = (performance.now() - startTime).toFixed(2);
    if (window.logTelemetry) {
      window.logTelemetry('[SYS] Force recalculation completed in ' + duration + 'ms. Visual interfaces updated.', 'success-line');
    }
  }

  // ========== RENDER CHARTS ==========
  function renderCharts() {
    if (!spreadsheetState || !spreadsheetState.sheets[activeSheetIndex] || !chartsContainer) return;
    var sheet = spreadsheetState.sheets[activeSheetIndex];
    if (window.ChartEngine && window.ChartRenderer) {
      var configs = window.ChartEngine.generateCharts(sheet);
      window.ChartRenderer.renderAll(configs, chartsContainer);
    }
  }

  // ================================================================
  //  FUTURISTIC SCI-FI IDE ENGINE INTERACTION HANDLERS (Added by Antigravity)
  // ================================================================

  function initFuturisticWorkspace() {
    // 1. Setup window.logTelemetry
    window.logTelemetry = function (msg, type) {
      var consoleLogLines = document.getElementById('console-log-lines');
      if (!consoleLogLines) return;
      var div = document.createElement('div');
      div.className = 'console-line ' + (type || 'system');
      var timestamp = new Date().toLocaleTimeString();
      div.textContent = '[' + timestamp + '] ' + msg;
      consoleLogLines.appendChild(div);
      consoleLogLines.scrollTop = consoleLogLines.scrollHeight;
      
      // clamp history size to 100 entries
      while (consoleLogLines.children.length > 100) {
        consoleLogLines.removeChild(consoleLogLines.firstChild);
      }
    };

    // Log boot telemetry
    window.logTelemetry('Scientific IDE Frontend Workspace core online.', 'system');

    // 2. Setup Activity Bar buttons and original sidebar collapse button
    btnHistory = document.getElementById('btn-activity-history');
    btnChat = document.getElementById('btn-activity-chat');
    btnRegistry = document.getElementById('btn-activity-registry');
    btnConsole = document.getElementById('btn-activity-console');

    if (btnHistory) btnHistory.addEventListener('click', function () { toggleProjectSidebar(); });
    if (btnChat) btnChat.addEventListener('click', function () { toggleChatPanel(); });
    if (btnRegistry) btnRegistry.addEventListener('click', function () { toggleRegistrySidebar(); });
    if (btnConsole) btnConsole.addEventListener('click', function () { toggleConsoleDrawer(); });

    // 3. Draggable Pane Dividers Resizing Logic
    makeResizableColumn('divider-sidebar', '#project-sidebar', 'left-to-right');
    makeResizableColumn('divider-chat', '.chat-panel', 'left-to-right');
    makeResizableRegistry();
    makeResizableConsole();

    // 4. Keyboard shortcuts
    window.addEventListener('keydown', function (e) {
      if (e.altKey) {
        var handled = true;
        if (e.key === 'h' || e.key === 'H') {
          toggleProjectSidebar();
        } else if (e.key === 'c' || e.key === 'C') {
          toggleChatPanel();
        } else if (e.key === 'f' || e.key === 'F') {
          toggleRegistrySidebar();
        } else if (e.key === 'l' || e.key === 'L') {
          toggleConsoleDrawer();
        } else {
          handled = false;
        }
        if (handled) e.preventDefault();
      }
    });

    // 5. Setup cell focus and input delegates for headers highlighting and Formula Helper popover
    if (spreadsheetContainer) {
      spreadsheetContainer.addEventListener('focusin', function (e) {
        var td = e.target.closest('td');
        if (!td || td.parentNode.parentNode.tagName === 'THEAD') return;

        // Row index & column index
        var tr = td.parentNode;
        var tbody = tr.parentNode;
        var rows = Array.from(tbody.children);
        var cells = Array.from(tr.children);
        var colIndex = cells.indexOf(td);

        // Highlight matching column header in thead
        var thead = spreadsheetContainer.querySelector('thead tr');
        if (thead && thead.children[colIndex]) {
          thead.children[colIndex].classList.add('header-highlight');
        }
        
        // Highlight row header (the first cell of this row)
        if (cells[0]) {
          cells[0].classList.add('header-highlight');
        }

        // Show formula helper popover above cell
        showFormulaHelper(td);
      });

      spreadsheetContainer.addEventListener('focusout', function (e) {
        var td = e.target.closest('td');
        if (!td) return;

        // Clear highlights
        spreadsheetContainer.querySelectorAll('.header-highlight').forEach(function (el) {
          el.classList.remove('header-highlight');
        });

        // Hide helper
        hideFormulaHelper();
      });

      spreadsheetContainer.addEventListener('input', function (e) {
        var td = e.target.closest('td');
        if (td) {
          showFormulaHelper(td);
        }
      });
    }

    // Console Action Buttons (Clear & Minimize)
    var clearConsoleBtn = document.getElementById('console-clear-btn');
    if (clearConsoleBtn) {
      clearConsoleBtn.addEventListener('click', function () {
        var lines = document.getElementById('console-log-lines');
        if (lines) {
          lines.innerHTML = '<div class="console-line system">> CONSOLE LOGS CLEARED</div>';
        }
      });
    }

    var toggleConsoleBtn = document.getElementById('console-toggle-btn');
    if (toggleConsoleBtn) {
      toggleConsoleBtn.addEventListener('click', function () {
        toggleConsoleDrawer();
      });
    }
  }

  function makeResizableColumn(dividerId, leftPanelSelector, direction) {
    var divider = document.getElementById(dividerId);
    var leftPanel = document.querySelector(leftPanelSelector);
    if (!divider || !leftPanel) return;

    divider.addEventListener('mousedown', function (e) {
      e.preventDefault();
      divider.classList.add('dragging');
      var startWidth = leftPanel.offsetWidth;
      var startX = e.clientX;

      function onMouseMove(moveEvent) {
        var delta = moveEvent.clientX - startX;
        var newWidth = direction === 'left-to-right' ? startWidth + delta : startWidth - delta;
        
        var minWidth = 150;
        var maxWidth = 600;
        if (leftPanelSelector === '.chat-panel') {
          minWidth = 250;
          maxWidth = 800;
        }
        
        if (newWidth >= minWidth && newWidth <= maxWidth) {
          leftPanel.style.width = newWidth + 'px';
          leftPanel.style.minWidth = newWidth + 'px';
        }
      }

      function onMouseUp() {
        divider.classList.remove('dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (window.dispatchEvent) {
          window.dispatchEvent(new Event('resize'));
        }
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  function makeResizableRegistry() {
    var divider = document.getElementById('divider-registry');
    var panel = document.getElementById('registry-sidebar');
    if (!divider || !panel) return;

    divider.addEventListener('mousedown', function (e) {
      e.preventDefault();
      divider.classList.add('dragging');
      var startWidth = panel.offsetWidth;
      var startX = e.clientX;

      function onMouseMove(moveEvent) {
        var delta = startX - moveEvent.clientX; // drag left to make bigger
        var newWidth = startWidth + delta;
        
        var minWidth = 200;
        var maxWidth = 600;
        
        if (newWidth >= minWidth && newWidth <= maxWidth) {
          panel.style.width = newWidth + 'px';
          panel.style.minWidth = newWidth + 'px';
        }
      }

      function onMouseUp() {
        divider.classList.remove('dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (window.dispatchEvent) {
          window.dispatchEvent(new Event('resize'));
        }
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  function makeResizableConsole() {
    var divider = document.getElementById('divider-console');
    var panel = document.getElementById('ide-console');
    if (!divider || !panel) return;

    divider.addEventListener('mousedown', function (e) {
      e.preventDefault();
      divider.classList.add('dragging');
      var startHeight = panel.offsetHeight;
      var startY = e.clientY;

      function onMouseMove(moveEvent) {
        var delta = startY - moveEvent.clientY; // drag up to increase height
        var newHeight = startHeight + delta;
        
        var minHeight = 40;
        var maxHeight = window.innerHeight * 0.8;
        
        if (newHeight >= minHeight && newHeight <= maxHeight) {
          panel.style.height = newHeight + 'px';
          if (newHeight > 40) {
            panel.classList.remove('collapsed');
          }
        }
      }

      function onMouseUp() {
        divider.classList.remove('dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (window.dispatchEvent) {
          window.dispatchEvent(new Event('resize'));
        }
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  function toggleProjectSidebar(forceState) {
    var isCollapsed = projectSidebar.classList.contains('collapsed');
    var nextState = (typeof forceState === 'boolean') ? !forceState : !isCollapsed;
    
    projectSidebar.classList.toggle('collapsed', nextState);
    document.body.classList.toggle('sidebar-collapsed', nextState);
    
    var sidebarDivider = document.getElementById('divider-sidebar');
    if (sidebarDivider) {
      sidebarDivider.style.display = nextState ? 'none' : 'block';
    }
    
    if (btnHistory) {
      btnHistory.classList.toggle('active', !nextState);
    }
    if (sidebarToggleBtn) {
      sidebarToggleBtn.title = nextState ? 'Expand Sidebar' : 'Collapse Sidebar';
    }
    localStorage.setItem('sidebar_collapsed', nextState ? 'true' : 'false');
    
    if (window.dispatchEvent) {
      window.dispatchEvent(new Event('resize'));
    }
  }

  function toggleChatPanel(forceState) {
    var chatPanel = document.querySelector('.chat-panel');
    var chatDivider = document.getElementById('divider-chat');
    if (!chatPanel) return;
    
    var isHidden = chatPanel.style.display === 'none';
    var nextState = (typeof forceState === 'boolean') ? !forceState : !isHidden;
    
    chatPanel.style.display = nextState ? 'none' : 'flex';
    if (chatDivider) {
      chatDivider.style.display = nextState ? 'none' : 'block';
    }
    
    if (btnChat) {
      btnChat.classList.toggle('active', !nextState);
    }
    
    if (window.dispatchEvent) {
      window.dispatchEvent(new Event('resize'));
    }
  }

  function toggleRegistrySidebar(forceState) {
    var registrySidebar = document.getElementById('registry-sidebar');
    var registryDivider = document.getElementById('divider-registry');
    if (!registrySidebar) return;
    
    var isHidden = registrySidebar.style.display === 'none';
    var nextState = (typeof forceState === 'boolean') ? !forceState : !isHidden;
    
    registrySidebar.style.display = nextState ? 'none' : 'flex';
    registrySidebar.classList.toggle('collapsed', nextState);
    if (registryDivider) {
      registryDivider.style.display = nextState ? 'none' : 'block';
    }
    
    if (btnRegistry) {
      btnRegistry.classList.toggle('active', !nextState);
    }
    
    if (!nextState) {
      updateFormulaInspector();
    }
    
    if (window.dispatchEvent) {
      window.dispatchEvent(new Event('resize'));
    }
  }

  function toggleConsoleDrawer(forceState) {
    var consolePanel = document.getElementById('ide-console');
    var consoleDivider = document.getElementById('divider-console');
    if (!consolePanel) return;
    
    var isCollapsed = consolePanel.classList.contains('collapsed');
    var nextState = (typeof forceState === 'boolean') ? !forceState : !isCollapsed;
    
    if (nextState) {
      consolePanel.classList.add('collapsed');
      if (btnConsole) btnConsole.classList.remove('active');
    } else {
      consolePanel.classList.remove('collapsed');
      if (btnConsole) btnConsole.classList.add('active');
    }
    
    if (window.dispatchEvent) {
      window.dispatchEvent(new Event('resize'));
    }
  }

  function updateFormulaInspector() {
    var registryList = document.getElementById('registry-list');
    if (!registryList) return;

    if (!spreadsheetState || !spreadsheetState.sheets[activeSheetIndex]) {
      registryList.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">No active sheet variables.</div>';
      return;
    }

    var sheet = spreadsheetState.sheets[activeSheetIndex];
    var columns = sheet.columns || [];
    var rows = sheet.rows || [];

    if (columns.length === 0) {
      registryList.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">No columns found.</div>';
      return;
    }

    registryList.innerHTML = '';

    // Create a section container
    var section = document.createElement('div');
    section.className = 'inspector-section';
    
    var h3 = document.createElement('h3');
    h3.className = 'inspector-h3';
    h3.textContent = 'Variables & Schema (' + columns.length + ')';
    section.appendChild(h3);

    columns.forEach(function (col) {
      var card = document.createElement('div');
      card.className = 'variable-card';

      var nameDiv = document.createElement('div');
      nameDiv.className = 'variable-name';
      nameDiv.style.fontWeight = '600';
      nameDiv.textContent = col.title || col.id;

      // Extract types & properties
      var values = [];
      var computedCount = 0;
      rows.forEach(function (r) {
        if (!r.cells || !r.cells[col.id]) return;
        var cell = r.cells[col.id];
        var val = cell._cv !== undefined ? cell._cv : cell.value;
        if (val !== undefined && val !== null && val !== '') {
          values.push(val);
        }
        if (cell.formula || col.formula) {
          computedCount++;
        }
      });

      var isComputed = col.formula || computedCount > 0;
      var format = col.format || 'text';
      var badgeClass = 'badge-text';
      var badgeText = 'Text';
      
      // Look for format type
      var numericVals = values.filter(function (v) { return !isNaN(Number(v)) && v !== ''; }).map(Number);
      var isNumeric = numericVals.length > 0 && numericVals.length === values.length;
      
      if (isComputed) {
        badgeClass = 'badge-computed';
        badgeText = 'Computed';
      } else if (isNumeric) {
        badgeClass = 'badge-number';
        badgeText = 'Number';
        if (format === 'currency') {
          badgeClass = 'badge-currency';
          badgeText = 'USD';
        } else if (format === 'percentage') {
          badgeClass = 'badge-percentage';
          badgeText = 'Pct';
        }
      }

      var metaDiv = document.createElement('div');
      metaDiv.className = 'variable-meta';
      
      var badgeSpan = document.createElement('span');
      badgeSpan.className = 'badge ' + badgeClass;
      badgeSpan.textContent = badgeText;
      metaDiv.appendChild(badgeSpan);

      var countSpan = document.createElement('span');
      countSpan.textContent = 'n = ' + values.length;
      metaDiv.appendChild(countSpan);
      
      card.appendChild(nameDiv);
      card.appendChild(metaDiv);

      // Numeric stats: Mean, Standard Deviation, significance
      if (isNumeric && numericVals.length > 0) {
        var meanVal = numericVals.reduce(function (sum, v) { return sum + v; }, 0) / numericVals.length;
        
        // Variance and STDEV
        var stdevVal = 0;
        if (numericVals.length > 1) {
          var varianceVal = numericVals.reduce(function (sum, v) { return sum + Math.pow(v - meanVal, 2); }, 0) / (numericVals.length - 1);
          stdevVal = Math.sqrt(varianceVal);
        }

        // Standard Error (SEM)
        var semVal = stdevVal / Math.sqrt(numericVals.length);

        var statsDiv = document.createElement('div');
        statsDiv.className = 'variable-stats';
        
        var displayMean = meanVal.toFixed(2).replace(/\.?0+$/, '');
        var displayStdev = stdevVal.toFixed(2).replace(/\.?0+$/, '');
        var displaySem = semVal.toFixed(2).replace(/\.?0+$/, '');
        
        statsDiv.innerHTML = 'Mean: ' + displayMean + ' | SD: ±' + displayStdev + '<br>SEM: ' + displaySem;
        card.appendChild(statsDiv);
      }

      // Check if this column represents a p-value or has a statistical significance marker
      var hasSigMarker = false;
      var maxSig = '';
      if (col.title && (col.title.toLowerCase().indexOf('p-value') !== -1 || col.title.toLowerCase().indexOf('sig') !== -1 || col.title.toLowerCase() === 'p')) {
        // Look at the values to see if any are significant
        values.forEach(function (v) {
          var num = Number(v);
          if (!isNaN(num) && num > 0) {
            if (num < 0.001) { hasSigMarker = true; maxSig = '***'; }
            else if (num < 0.01) { hasSigMarker = true; if (maxSig !== '***') maxSig = '**'; }
            else if (num < 0.05) { hasSigMarker = true; if (maxSig !== '***' && maxSig !== '**') maxSig = '*'; }
          }
        });
      }

      if (hasSigMarker) {
        var sigDiv = document.createElement('div');
        sigDiv.className = 'variable-stats';
        sigDiv.style.color = '#e1b12c'; // golden signifier
        sigDiv.style.fontWeight = 'bold';
        sigDiv.innerHTML = 'Significance: ' + maxSig + ' (p < 0.05)';
        card.appendChild(sigDiv);
      }

      section.appendChild(card);
    });

    registryList.appendChild(section);
  }

  function showFormulaHelper(td) {
    var popover = document.getElementById('formula-helper-popover');
    if (!popover) return;

    var rowId = td.dataset.rowId;
    var colId = td.dataset.colId;
    if (!rowId || !colId || !spreadsheetState || !spreadsheetState.sheets[activeSheetIndex]) return;

    var sheet = spreadsheetState.sheets[activeSheetIndex];
    var row = sheet.rows.find(function (r) { return r.id === rowId; });
    var cellData = (row && row.cells && row.cells[colId]) ? row.cells[colId] : null;

    var formulaText = '';
    if (cellData && cellData.formula) {
      formulaText = cellData.formula;
    } else {
      var col = sheet.columns.find(function (c) { return c.id === colId; });
      if (col && col.formula) {
        formulaText = col.formula;
      }
    }

    var cellText = td.textContent.trim();
    if (!formulaText && cellText.startsWith('=')) {
      formulaText = cellText.substring(1);
    }

    if (!formulaText) {
      popover.classList.remove('active');
      return;
    }

    var match = formulaText.match(/^([A-Za-z0-9_]+)/);
    var funcName = match ? match[1].toUpperCase() : '';
    
    var def = STATS_FUNCTION_DEFS[funcName];
    if (!def) {
      popover.querySelector('.formula-helper-title').textContent = funcName || 'Formula';
      popover.querySelector('.formula-helper-syntax').textContent = '=' + formulaText;
      popover.querySelector('.formula-helper-desc').textContent = 'Custom calculation expression.';
    } else {
      popover.querySelector('.formula-helper-title').textContent = funcName;
      popover.querySelector('.formula-helper-syntax').textContent = '=' + def.syntax;
      popover.querySelector('.formula-helper-desc').textContent = def.desc;
    }

    var rect = td.getBoundingClientRect();
    var popoverHeight = popover.offsetHeight || 80;
    var popoverWidth = popover.offsetWidth || 260;
    
    var top = rect.top - popoverHeight - 8 + window.scrollY;
    var left = rect.left + (rect.width - popoverWidth) / 2 + window.scrollX;
    
    if (top < 0) {
      top = rect.bottom + 8 + window.scrollY;
    }
    if (left < 0) left = 8;
    if (left + popoverWidth > window.innerWidth) {
      left = window.innerWidth - popoverWidth - 8;
    }

    popover.style.top = top + 'px';
    popover.style.left = left + 'px';
    popover.classList.add('active');
  }

  function hideFormulaHelper() {
    var popover = document.getElementById('formula-helper-popover');
    if (popover) {
      popover.classList.remove('active');
    }
  }

  // ========== SETTINGS HANDLERS ==========
  function openSettingsModal() {
    if (settingsModal) {
      settingsModal.style.display = 'flex';
      
      // Update active state of settings btn
      if (btnSettings) btnSettings.classList.add('active');
      
      // Sync API key input and status
      var savedKey = getSavedApiKey();
      if (apiKeyInput) {
        apiKeyInput.value = savedKey || '';
      }
      updateApiKeyStatus(!!savedKey);
    }
  }

  function closeSettingsModal() {
    if (settingsModal) {
      settingsModal.style.display = 'none';
      if (btnSettings) btnSettings.classList.remove('active');
    }
  }

  function applyTheme(themeName) {
    // Remove all existing themes from body
    document.body.classList.remove('theme-cyberpunk-neon', 'theme-matrix-green', 'theme-arctic-steel');
    
    // Add theme class if not default
    if (themeName !== 'default' && themeName !== '') {
      document.body.classList.add('theme-' + themeName);
    }
    
    // Persist to storage
    localStorage.setItem('quaasx_visual_theme', themeName);
    
    // Update theme selection buttons and dots active state
    document.querySelectorAll('.theme-option-btn, .theme-dot').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.theme === themeName);
    });
    
    document.querySelectorAll('.landing-theme-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.theme === themeName);
    });
    
    if (window.logTelemetry) {
      window.logTelemetry('[SYS] Visual environment theme set to: ' + themeName, 'system');
    }
  }

  function displayTokenBlocker() {
    if (!chatMessages) return;
    var existingBlocker = chatMessages.querySelector('.token-blocker-message');
    if (existingBlocker) {
      return;
    }

    var div = document.createElement('div');
    div.className = 'token-blocker-message';
    div.innerHTML = 
      '<h4>⚡ Token Allocation Exhausted</h4>' +
      '<p>You have consumed all 100,000 free token credits. Upgrade to a Pro plan to unlock unlimited scientific calculations, high-fidelity charting, and advanced statistical analysis.</p>' +
      '<button id="blocker-upgrade-btn">Upgrade to Pro</button>';

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    var upgradeBtn = div.querySelector('#blocker-upgrade-btn');
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', function () {
        openSettingsModal();
      });
    }
  }

  function updateSubscriptionUI() {
    if (!headerSubscriptionStatus) return;

    // 1. Update Header subscription element
    if (subscriptionPlan === 'free') {
      var remainingTokens = Math.max(0, tokenLimit - tokensUsed);
      var percentUsed = (tokensUsed / tokenLimit) * 100;
      
      headerSubscriptionStatus.innerHTML = 
        '<span class="plan-badge plan-badge-free">Free Tier</span>' +
        '<span class="tokens-remaining-info">Tokens: ' + remainingTokens.toLocaleString() + ' left</span>' +
        '<a class="header-upgrade-link" id="header-upgrade-trigger" style="margin-left: 6px;">Upgrade to Pro for Max Benefits ⚡</a>';

      // Attach upgrade event listener to the header link
      var trigger = document.getElementById('header-upgrade-trigger');
      if (trigger) {
        trigger.addEventListener('click', function(e) {
          e.preventDefault();
          openSettingsModal();
        });
      }

      // Show settings token meter
      if (settingsTokenMeterContainer) {
        settingsTokenMeterContainer.style.display = 'block';
      }
      if (settingsTokenCountText) {
        settingsTokenCountText.textContent = tokensUsed.toLocaleString() + ' / ' + tokenLimit.toLocaleString() + ' tokens used';
      }
      if (settingsTokenMeterFill) {
        settingsTokenMeterFill.style.width = Math.min(percentUsed, 100) + '%';
        if (percentUsed >= 80) {
          settingsTokenMeterFill.classList.add('warning');
        } else {
          settingsTokenMeterFill.classList.remove('warning');
        }
      }
    } else {
      var badgeClass = subscriptionPlan === 'pro-plus' ? 'plan-badge-pro-plus' : 'plan-badge-pro';
      var planLabel = subscriptionPlan === 'pro-plus' ? 'Pro-Plus Plan' : 'Pro Plan';
      headerSubscriptionStatus.innerHTML = 
        '<span class="plan-badge ' + badgeClass + '">' + planLabel + '</span>' +
        '<span class="tokens-remaining-info" style="color: var(--success);">Unlimited Credits</span>';

      // Hide settings token meter
      if (settingsTokenMeterContainer) {
        settingsTokenMeterContainer.style.display = 'none';
      }
    }

    // 2. Update Settings pricing options grid buttons
    document.querySelectorAll('.settings-pricing-card').forEach(function (card) {
      var plan = card.dataset.plan;
      var btn = card.querySelector('button');
      if (plan === subscriptionPlan) {
        card.classList.add('active');
        if (btn) btn.textContent = 'Active';
      } else {
        card.classList.remove('active');
        if (btn) btn.textContent = plan === 'free' ? 'Select' : 'Upgrade';
      }
    });

    // 3. Update Landing Page pricing card active state (if elements exist)
    document.querySelectorAll('.pricing-card').forEach(function (card) {
      var btn = card.querySelector('.pricing-action-btn');
      if (!btn) return;
      var plan = btn.dataset.plan;
      if (plan) {
        if (plan === subscriptionPlan) {
          btn.classList.add('active-plan');
          btn.textContent = 'Active Plan';
        } else {
          btn.classList.remove('active-plan');
          btn.textContent = plan === 'free' ? 'Activate Free' : 'Upgrade to ' + (plan === 'pro-plus' ? 'Pro-Plus' : 'Pro');
        }
      }
    });

    // 4. Manage Blocker Alert Visibility in Chat Messages
    var existingBlocker = chatMessages ? chatMessages.querySelector('.token-blocker-message') : null;
    if (existingBlocker && (subscriptionPlan !== 'free' || tokensUsed < tokenLimit)) {
      existingBlocker.remove();
    }
    if (subscriptionPlan === 'free' && tokensUsed >= tokenLimit) {
      displayTokenBlocker();
    }
  }

  function changePlan(newPlan) {
    if (newPlan === subscriptionPlan) return;
    
    subscriptionPlan = newPlan;
    localStorage.setItem('quaasx_subscription_plan', newPlan);
    
    // Switch token counter status
    if (newPlan !== 'free') {
      if (window.logTelemetry) {
        window.logTelemetry('[SYS] Subscription upgraded successfully to: ' + newPlan.toUpperCase() + ' (GST Invoiced). Unlimited computations enabled.', 'success-line');
      }
    } else {
      if (window.logTelemetry) {
        window.logTelemetry('[SYS] Subscription switched to Free Tier. 100k token allocations applied.', 'system');
      }
    }
    
    updateSubscriptionUI();
    
    // Add visual flash confirmation to Settings Modal if open
    var modalContent = document.querySelector('.settings-modal-card');
    if (modalContent) {
      modalContent.style.boxShadow = '0 0 40px rgba(34, 197, 94, 0.4)';
      setTimeout(function() {
        modalContent.style.boxShadow = '';
      }, 500);
    }
  }

  var STATS_FUNCTION_DEFS = {
    'SUM': { syntax: 'SUM(range)', desc: 'Sums a range of cells, e.g. SUM(A1:A10)' },
    'AVERAGE': { syntax: 'AVERAGE(range)', desc: 'Calculates the arithmetic mean of a range of cells, e.g. AVERAGE(A1:A10)' },
    'STDEV': { syntax: 'STDEV(range)', desc: 'Calculates the sample standard deviation, e.g. STDEV(B1:B10)' },
    'STDEVP': { syntax: 'STDEVP(range)', desc: 'Calculates the population standard deviation, e.g. STDEVP(B1:B10)' },
    'VAR': { syntax: 'VAR(range)', desc: 'Calculates the sample variance, e.g. VAR(C1:C10)' },
    'VARP': { syntax: 'VARP(range)', desc: 'Calculates the population variance, e.g. VARP(C1:C10)' },
    'MEDIAN': { syntax: 'MEDIAN(range)', desc: 'Finds the median value in a range, e.g. MEDIAN(C1:C10)' },
    'MODE': { syntax: 'MODE(range)', desc: 'Finds the mode (most common value) in a range, e.g. MODE(C1:C10)' },
    'SKEW': { syntax: 'SKEW(range)', desc: 'Calculates the distribution skewness, e.g. SKEW(C1:C10)' },
    'KURT': { syntax: 'KURT(range)', desc: 'Calculates the distribution excess kurtosis, e.g. KURT(C1:C10)' },
    'TTEST_P': { syntax: 'TTEST_P(pre_range, post_range)', desc: 'Returns p-value for Student\'s paired t-test.' },
    'TTEST_T': { syntax: 'TTEST_T(pre_range, post_range)', desc: 'Returns t-statistic for Student\'s paired t-test.' },
    'ANOVA_F': { syntax: 'ANOVA_F(g1, g2, ...)', desc: 'Returns F-statistic for one-way ANOVA across columns.' },
    'ANOVA_P': { syntax: 'ANOVA_P(g1, g2, ...)', desc: 'Returns p-value for one-way ANOVA across columns.' },
    'CORREL': { syntax: 'CORREL(rangeX, rangeY)', desc: 'Calculates the Pearson correlation coefficient between two columns.' },
    'CORREL_P': { syntax: 'CORREL_P(rangeX, rangeY)', desc: 'Calculates p-value for Pearson correlation.' },
    'SLOPE': { syntax: 'SLOPE(rangeY, rangeX)', desc: 'Calculates the slope of the linear regression line.' },
    'INTERCEPT': { syntax: 'INTERCEPT(rangeY, rangeX)', desc: 'Calculates the intercept of the linear regression line.' },
    'WILCOXON_P': { syntax: 'WILCOXON_P(pre, post)', desc: 'Calculates p-value for Wilcoxon signed-rank test.' },
    'WILCOXON_T': { syntax: 'WILCOXON_T(pre, post)', desc: 'Calculates T statistic for Wilcoxon signed-rank test.' },
    'MANN_WHITNEY_P': { syntax: 'MANN_WHITNEY_P(col1, col2)', desc: 'Calculates p-value for Mann-Whitney U test.' },
    'MANN_WHITNEY_U': { syntax: 'MANN_WHITNEY_U(col1, col2)', desc: 'Calculates U statistic for Mann-Whitney U test.' },
    'SENSITIVITY': { syntax: 'SENSITIVITY(tp, fn)', desc: 'Calculates diagnostic sensitivity (True Positives / (True Positives + False Negatives))' },
    'SPECIFICITY': { syntax: 'SPECIFICITY(tn, fp)', desc: 'Calculates diagnostic specificity (True Negatives / (True Negatives + False Positives))' },
    'ODDS_RATIO': { syntax: 'ODDS_RATIO(a, b, c, d)', desc: 'Calculates odds ratio for 2x2 contingency table: (a*d)/(b*c)' },
    'RELATIVE_RISK': { syntax: 'RELATIVE_RISK(a, b, c, d)', desc: 'Calculates relative risk ratio: (a/(a+b)) / (c/(c+d))' },
    'PPV': { syntax: 'PPV(tp, fp)', desc: 'Calculates positive predictive value' },
    'NPV_CLINICAL': { syntax: 'NPV_CLINICAL(tn, fn)', desc: 'Calculates negative predictive value' },
    'BMI': { syntax: 'BMI(weight_kg, height_m)', desc: 'Calculates body mass index' },
    'BSA': { syntax: 'BSA(weight_kg, height_cm)', desc: 'Calculates body surface area' },
    'NPV_FIN': { syntax: 'NPV_FIN(rate, cash_flows)', desc: 'Calculates Net Present Value for a series of cash flows' },
    'IRR': { syntax: 'IRR(cash_flows)', desc: 'Calculates Internal Rate of Return' },
    'CAGR': { syntax: 'CAGR(start_val, end_val, periods)', desc: 'Calculates compound annual growth rate' },
    'ROI': { syntax: 'ROI(gains, cost)', desc: 'Calculates Return on Investment: (gains - cost) / cost' },
    'PMT': { syntax: 'PMT(rate, nper, pv)', desc: 'Calculates monthly payment for loan' },
    'FV': { syntax: 'FV(rate, nper, pmt, [pv])', desc: 'Calculates future value of an investment' },
    'PV': { syntax: 'PV(rate, nper, pmt, [fv])', desc: 'Calculates present value of an investment' },
    'BREAKEVEN': { syntax: 'BREAKEVEN(fixed, price, variable)', desc: 'Calculates breakeven units' },
    'MARGIN': { syntax: 'MARGIN(price, cost)', desc: 'Calculates margin percentage: (price - cost) / price' },
    'PROCESS_CP': { syntax: 'PROCESS_CP(range, usl, lsl)', desc: 'Calculates Process Capability index Cp' },
    'PROCESS_CPK': { syntax: 'PROCESS_CPK(range, usl, lsl)', desc: 'Calculates Process Capability index Cpk' },
    'UCL': { syntax: 'UCL(range)', desc: 'Calculates Upper Control Limit (Mean + 3*StDev)' },
    'LCL': { syntax: 'LCL(range)', desc: 'Calculates Lower Control Limit (Mean - 3*StDev)' },
    'RMSE': { syntax: 'RMSE(actual, forecast)', desc: 'Calculates Root Mean Squared Error' },
    'MAPE': { syntax: 'MAPE(actual, forecast)', desc: 'Calculates Mean Absolute Percentage Error' },
    'MAE': { syntax: 'MAE(actual, forecast)', desc: 'Calculates Mean Absolute Error' },
    'IF': { syntax: 'IF(cond, true_val, false_val)', desc: 'Evaluates logical check and returns corresponding outcome.' },
    'IFERROR': { syntax: 'IFERROR(val, fallback)', desc: 'Executes val, and if it fails, falls back to fallback value.' },
    'AND': { syntax: 'AND(c1, c2, ...)', desc: 'Logical AND operator' },
    'OR': { syntax: 'OR(c1, c2, ...)', desc: 'Logical OR operator' },
    'NOT': { syntax: 'NOT(c)', desc: 'Logical NOT operator' },
    'ROUND': { syntax: 'ROUND(val, decimals)', desc: 'Rounds number to specified decimal places' },
    'CEILING': { syntax: 'CEILING(val, [sig])', desc: 'Rounds number up to nearest significance step' },
    'FLOOR': { syntax: 'FLOOR(val, [sig])', desc: 'Rounds number down to nearest significance step' }
  };

  // ================================================================
  //  SUPABASE CORE & OFFLINE-FIRST SYNC ENGINE
  // ================================================================

  function initSupabaseClient() {
    var url = localStorage.getItem('supabase_url');
    var key = localStorage.getItem('supabase_anon_key');

    // Fallback to default public credentials if not available via API or localStorage
    if (!url || !key) {
      url = 'https://zleyyfdyguvtmthoizha.supabase.co';
      key = 'sb_publishable_HHocZZbF1h16BshOh3A4aw_uH-3j3d9';
      localStorage.setItem('supabase_url', url);
      localStorage.setItem('supabase_anon_key', key);
    }

    if (!url || !key || !window.supabase || url.includes('your_supabase_project_url_here') || key.includes('your_supabase_anon_key_here')) {
      isOfflineMode = true;
      window.supabaseActive = false;
      updateSyncBadgeStatus('offline', 'Local Guest Mode');
      if (window.logTelemetry) {
        window.logTelemetry('[SYS] Supabase Credentials missing or placeholder. Operating in Local Offline Guest Mode.', 'system');
      }
      return;
    }

    try {
      supabase = window.supabase.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        }
      });
      window.supabaseActive = true;
      isOfflineMode = false;
      
      setupSupabaseAuth();
      
      // Start background synchronization polling (every 5 seconds)
      setInterval(syncDirtyProjects, 5000);

      // Setup window network state listeners
      window.addEventListener('online', function() {
        isOfflineMode = false;
        updateSyncBadgeStatus('synced', 'Synced');
        if (window.logTelemetry) window.logTelemetry('[SYS] Connection restored. Synchronizer active.', 'success-line');
        syncDirtyProjects();
      });
      window.addEventListener('offline', function() {
        isOfflineMode = true;
        updateSyncBadgeStatus('offline', 'Offline');
        if (window.logTelemetry) window.logTelemetry('[WARNING] Network dropped. Sync paused, caching changes locally.', 'error-line');
      });

    } catch (e) {
      console.error('Supabase initialization failed:', e);
      window.supabaseActive = false;
      isOfflineMode = true;
      updateSyncBadgeStatus('offline', 'Local Guest Mode');
    }
  }

  async function syncTokenUsageToCloud(amount) {
    if (!supabase || !window.supabaseLoggedIn || !amount || amount <= 0) return;
    try {
      var { data, error } = await supabase.rpc('increment_tokens_used', { p_amount: amount });
      if (error) throw error;
      if (data) {
        tokensUsed = data.tokens_used || tokensUsed;
        subscriptionPlan = data.subscription_plan || subscriptionPlan;
        tokenLimit = data.token_limit || tokenLimit;
        localStorage.setItem('quaasx_tokens_used', tokensUsed);
        localStorage.setItem('quaasx_subscription_plan', subscriptionPlan);
        updateSubscriptionUI();
      }
    } catch (err) {
      console.warn('Token sync failed:', err.message);
    }
  }

  function setupSupabaseAuth() {
    if (!supabase) return;
    
    supabase.auth.onAuthStateChange(async function(event, session) {
      if (event === 'PASSWORD_RECOVERY' && session) {
        if (window.showAuthResetPanel) {
          window.showAuthResetPanel();
        }
        return;
      }

      if (session) {
        window.supabaseLoggedIn = true;
        
        // Sync user info inside UI
        var user = session.user;
        var initials = user.email ? user.email.charAt(0).toUpperCase() : 'U';
        
        var avatarEl = document.getElementById('user-avatar-initials');
        var emailEl = document.getElementById('user-dropdown-email');
        var widgetEl = document.getElementById('user-profile-widget');
        
        if (avatarEl) avatarEl.textContent = initials;
        if (emailEl) emailEl.textContent = user.email;
        if (widgetEl) widgetEl.style.display = 'block';
        
        updateSyncBadgeStatus('synced', 'Synced');
        if (window.logTelemetry) {
          window.logTelemetry('[SYS] Authenticated with Cloud Node. Active user: ' + user.email, 'success-line');
        }

        // Pull Profile Subscription plan & usage
        try {
          var { data: profile, error } = await supabase
            .from('user_profiles')
            .select('subscription_plan, tokens_used, token_limit, display_name')
            .eq('user_id', user.id)
            .single();

          if (profile && !error) {
            subscriptionPlan = profile.subscription_plan || 'free';
            tokensUsed = profile.tokens_used || 0;
            tokenLimit = profile.token_limit || tokenLimit;
            localStorage.setItem('quaasx_subscription_plan', subscriptionPlan);
            localStorage.setItem('quaasx_tokens_used', tokensUsed);
            updateSubscriptionUI();
          }
        } catch (err) {
          console.warn('Profile fetch failed:', err.message);
        }

        // Load projects from Cloud Database
        await loadProjectsFromSupabase();

        // Merge any guest spreadsheets
        await mergeGuestProjects();

        if (event === 'SIGNED_IN' && sessionStorage.getItem('quaasx_pending_boot') === '1') {
          sessionStorage.removeItem('quaasx_pending_boot');
          var authOverlay = document.getElementById('auth-modal-overlay');
          if (authOverlay) authOverlay.style.display = 'none';
          if (window.startQuaasxBootSequence) {
            window.startQuaasxBootSequence();
          } else if (window.triggerBootSequence) {
            window.triggerBootSequence();
            window.triggerBootSequence = null;
          }
        }

      } else {
        window.supabaseLoggedIn = false;
        var widgetEl = document.getElementById('user-profile-widget');
        if (widgetEl) widgetEl.style.display = 'none';
        updateSyncBadgeStatus('offline', 'Local Guest Mode');
      }
    });
  }

  function updateSyncBadgeStatus(status, text) {
    var badge = document.getElementById('sync-status-badge');
    if (!badge) return;
    
    badge.className = 'sync-badge ' + status;
    var textEl = badge.querySelector('.sync-text');
    if (textEl) textEl.textContent = text;
  }

  async function syncDirtyProjects() {
    if (isOfflineMode || !supabase || !window.supabaseLoggedIn || dirtyProjectIds.size === 0) return;

    var idsToSync = Array.from(dirtyProjectIds);
    for (var i = 0; i < idsToSync.length; i++) {
      var id = idsToSync[i];
      var localProj = projects.find(function(p) { return p.id === id; });
      if (localProj) {
        updateSyncBadgeStatus('syncing', 'Syncing cloud...');
        try {
          var user = (await supabase.auth.getUser()).data.user;
          if (!user) continue;

          var { error } = await supabase
            .from('projects')
            .upsert({
              id: localProj.id,
              user_id: user.id,
              name: localProj.name,
              state: localProj.spreadsheetState,
              chat_history: localProj.chatHistory,
              chat_display: localProj.chatDisplayMessages,
              updated_at: new Date(localProj.updatedAt).toISOString()
            });

          if (!error) {
            dirtyProjectIds.delete(id);
            // Index the workbook for semantic search after syncing
            if (localProj.spreadsheetState) {
              await indexWorkbookForSearch(localProj.id, localProj.spreadsheetState);
            }
          } else {
            console.error('Project sync error:', error.message);
          }
        } catch (e) {
          console.error('Background sync failed for project:', id, e);
        }
      }
    }
    
    if (dirtyProjectIds.size === 0) {
      updateSyncBadgeStatus('synced', 'Synced');
    }
  }

  async function loadProjectsFromSupabase() {
    if (!supabase || !window.supabaseLoggedIn) return;
    try {
      updateSyncBadgeStatus('syncing', 'Loading projects...');
      var { data: remoteProjects, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      if (remoteProjects && remoteProjects.length > 0) {
        // Map database schema values to local project keys
        projects = remoteProjects.map(function(rp) {
          return {
            id: rp.id,
            name: rp.name,
            spreadsheetState: rp.state,
            chatHistory: rp.chat_history || [],
            chatDisplayMessages: rp.chat_display || [],
            activeSheetIndex: 0,
            currentMode: 'build',
            currentViewMode: 'table',
            createdAt: new Date(rp.updated_at).getTime(),
            updatedAt: new Date(rp.updated_at).getTime()
          };
        });

        // Set active project
        var savedActiveId = localStorage.getItem(ACTIVE_KEY);
        if (savedActiveId && projects.find(function(p) { return p.id === savedActiveId; })) {
          activeProjectId = savedActiveId;
        } else {
          activeProjectId = projects[0].id;
        }

        // Restore active project sheet/chat view
        var activeProj = projects.find(function(p) { return p.id === activeProjectId; });
        if (activeProj) {
          spreadsheetState = activeProj.spreadsheetState;
          chatHistory = activeProj.chatHistory;
          chatDisplayMessages = activeProj.chatDisplayMessages;
          renderChatFromDisplayMessages();
          renderSheetTabs();
          renderActiveSheet();
          if (spreadsheetState && downloadBtn) downloadBtn.disabled = false;
          if (spreadsheetState && viewToggle) viewToggle.style.display = 'flex';
          if (emptyState && spreadsheetState) emptyState.style.display = 'none';
        }
        
        renderProjectSidebar();
      }
      updateSyncBadgeStatus('synced', 'Synced');
    } catch (e) {
      console.error('Failed loading cloud projects:', e);
      updateSyncBadgeStatus('offline', 'Offline (Local Cache)');
    }
  }

  async function mergeGuestProjects() {
    if (!supabase || !window.supabaseLoggedIn) return;
    var guestData = localStorage.getItem(STORAGE_KEY);
    if (!guestData) return;

    try {
      var guestProjects = JSON.parse(guestData);
      if (!guestProjects || guestProjects.length === 0) return;

      if (confirm('Would you like to import your local guest projects to your new cloud account?')) {
        updateSyncBadgeStatus('syncing', 'Migrating guest data...');
        var user = (await supabase.auth.getUser()).data.user;
        if (!user) return;

        for (var i = 0; i < guestProjects.length; i++) {
          var gp = guestProjects[i];
          await supabase.from('projects').upsert({
            id: gp.id,
            user_id: user.id,
            name: gp.name,
            state: gp.spreadsheetState,
            chat_history: gp.chatHistory,
            chat_display: gp.chatDisplayMessages,
            updated_at: new Date(gp.updatedAt || Date.now()).toISOString()
          });
        }

        // Clean local cache key to prevent repeated migrations
        localStorage.removeItem(STORAGE_KEY);
        
        // Reload combined database projects
        await loadProjectsFromSupabase();
        if (window.logTelemetry) {
          window.logTelemetry('[SYS] Local guest data migrated successfully to Supabase Cloud Node.', 'success-line');
        }
      }
    } catch (err) {
      console.warn('Failed merging guest data:', err.message);
    }
  }

  // ================================================================
  //  SUPABASE CLOUD STORAGE FILE HANDLER
  // ================================================================

  async function uploadFileToSupabase(file) {
    if (!supabase || !window.supabaseLoggedIn) return null;
    try {
      var user = (await supabase.auth.getUser()).data.user;
      if (!user) return null;

      var name = Date.now() + '_' + file.name.replace(/\s+/g, '_');
      var path = user.id + '/' + name;

      updateSyncBadgeStatus('syncing', 'Uploading file...');
      var { data, error } = await supabase.storage
        .from('user-attachments')
        .upload(path, file);

      if (error) throw error;

      var signed = await supabase.storage
        .from('user-attachments')
        .createSignedUrl(path, 60 * 60 * 24 * 7);

      if (signed.error) throw signed.error;

      updateSyncBadgeStatus('synced', 'Synced');
      return signed.data.signedUrl;

    } catch (e) {
      console.error('Storage upload failed:', e);
      if (window.logTelemetry) {
        window.logTelemetry('[WARNING] Cloud storage upload failed: ' + e.message + '. Defaulting to in-browser storage.', 'error-line');
      }
      return null;
    }
  }

  // ================================================================
  //  VECTOR EMBEDDING & SEMANTIC SEARCH (RAG)
  // ================================================================

  async function generateVectorEmbeddings(text) {
    if (!supabase || !window.supabaseLoggedIn) return null;
    try {
      var { data, error } = await supabase.functions.invoke('embed', {
        body: { text: text }
      });
      if (error) throw error;
      return data.embedding;
    } catch (e) {
      console.warn('Vector embedding generation failed:', e.message);
      return null;
    }
  }

  async function searchWorkbookEmbeddings(query) {
    if (!supabase || !window.supabaseLoggedIn) return null;
    try {
      var queryEmbedding = await generateVectorEmbeddings(query);
      if (!queryEmbedding) return null;

      var user = (await supabase.auth.getUser()).data.user;
      if (!user) return null;

      var { data, error } = await supabase.rpc('match_document_embeddings', {
        query_embedding: queryEmbedding,
        match_threshold: 0.45,
        match_count: 4,
        p_user_id: user.id
      });

      if (error) throw error;
      return data;
    } catch (e) {
      console.warn('Semantic vector search failed:', e.message);
      return null;
    }
  }

  async function indexWorkbookForSearch(projectId, sheetState) {
    if (!supabase || !window.supabaseLoggedIn || !sheetState) return;
    try {
      // Clear legacy index
      await supabase.from('document_embeddings').delete().eq('project_id', projectId);

      var user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      for (var i = 0; i < sheetState.sheets.length; i++) {
        var sheet = sheetState.sheets[i];
        var content = 'Spreadsheet Sheet: ' + sheet.name + '. ';
        content += 'Columns: ' + sheet.columns.map(function(c) { return c.title + (c.formula ? ' ƒ: ' + c.formula : ''); }).join(', ') + '. ';
        
        sheet.rows.forEach(function(row, idx) {
          var rowData = [];
          for (var colId in row.cells) {
            var val = row.cells[colId].value;
            if (val !== undefined && val !== null && val !== '') {
              rowData.push(colId + ': ' + val);
            }
          }
          if (rowData.length > 0) {
            content += 'Row ' + (idx + 1) + ': {' + rowData.join(', ') + '}. ';
          }
        });

        // Generate edge embeddings
        var embedding = await generateVectorEmbeddings(content);
        if (embedding) {
          await supabase.from('document_embeddings').insert({
            project_id: projectId,
            user_id: user.id,
            content: content,
            embedding: embedding,
            metadata: { sheetName: sheet.name }
          });
        }
      }
    } catch (err) {
      console.warn('Failed building search indexes:', err.message);
    }
  }

  // ================================================================
  //  AUTH PORTAL FORM & UI LISTENERS
  // ================================================================

  function validateAuthPassword(password) {
    return {
      valid: password.length >= 8 &&
        /[a-z]/.test(password) &&
        /[A-Z]/.test(password) &&
        /[0-9]/.test(password),
      length: password.length >= 8,
      lower: /[a-z]/.test(password),
      upper: /[A-Z]/.test(password),
      number: /[0-9]/.test(password)
    };
  }

  function updatePasswordRuleIndicators(checks, prefix) {
    var map = {
      length: prefix + '-rule-length',
      lower: prefix + '-rule-lower',
      upper: prefix + '-rule-upper',
      number: prefix + '-rule-number'
    };
    Object.keys(map).forEach(function (key) {
      var el = document.getElementById(map[key]);
      if (el) el.classList.toggle('valid', !!checks[key]);
    });
  }

  function wireAuthEventListeners() {
    var overlay = document.getElementById('auth-modal-overlay');
    var tabSignIn = document.getElementById('auth-tab-signin');
    var tabSignUp = document.getElementById('auth-tab-signup');
    var authTabs = document.getElementById('auth-tabs');
    var panelMain = document.getElementById('auth-panel-main');
    var panelConfirm = document.getElementById('auth-panel-confirm');
    var panelReset = document.getElementById('auth-panel-reset');
    var guestDivider = document.getElementById('auth-guest-divider');
    var title = document.getElementById('auth-title');
    var subtitle = document.getElementById('auth-subtitle');
    var form = document.getElementById('auth-form');
    var resetForm = document.getElementById('auth-reset-form');
    var emailInput = document.getElementById('auth-email');
    var passwordInput = document.getElementById('auth-password');
    var passwordConfirmInput = document.getElementById('auth-password-confirm');
    var confirmGroup = document.getElementById('auth-confirm-group');
    var passwordRules = document.getElementById('auth-password-rules');
    var submitBtn = document.getElementById('auth-submit-btn');
    var oauthSection = document.getElementById('auth-oauth-section');
    var googleBtn = document.getElementById('auth-google-btn');
    var guestBtn = document.getElementById('auth-guest-btn');
    var forgotBtn = document.getElementById('auth-forgot-btn');
    var resendBtn = document.getElementById('auth-resend-btn');
    var resendConfirmBtn = document.getElementById('auth-resend-confirm-btn');
    var backToSignInBtn = document.getElementById('auth-back-to-signin-btn');
    var confirmEmailText = document.getElementById('auth-confirm-email-text');
    var togglePasswordBtn = document.getElementById('auth-toggle-password');
    var toggleNewPasswordBtn = document.getElementById('auth-toggle-new-password');
    var newPasswordInput = document.getElementById('auth-new-password');
    var newPasswordConfirmInput = document.getElementById('auth-new-password-confirm');
    var resetErrorMsg = document.getElementById('auth-reset-error-msg');
    var resetSuccessMsg = document.getElementById('auth-reset-success-msg');
    var errorMsg = document.getElementById('auth-error-msg');
    var successMsg = document.getElementById('auth-success-msg');
    var pendingConfirmEmail = '';
    
    var userWidget = document.getElementById('user-profile-widget');
    var userLogout = document.getElementById('user-logout-btn');

    if (!overlay) return;

    var activeTab = 'signin';

    function showAuthPanel(panel) {
      if (panelMain) panelMain.style.display = panel === 'main' ? 'block' : 'none';
      if (panelConfirm) panelConfirm.style.display = panel === 'confirm' ? 'flex' : 'none';
      if (panelReset) panelReset.style.display = panel === 'reset' ? 'flex' : 'none';
      if (authTabs) authTabs.style.display = panel === 'main' ? 'flex' : 'none';
      if (oauthSection) oauthSection.style.display = panel === 'main' ? 'block' : 'none';
      
      var isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      if (isProduction) {
        if (guestDivider) guestDivider.style.display = 'none';
        if (guestBtn) guestBtn.style.display = 'none';
      } else {
        if (guestDivider) guestDivider.style.display = panel === 'main' ? 'flex' : 'none';
        if (guestBtn) guestBtn.style.display = panel === 'main' ? 'block' : 'none';
      }
    }

    window.showAuthResetPanel = function () {
      overlay.style.display = 'flex';
      showAuthPanel('reset');
      if (title) title.textContent = 'Reset Password';
      if (subtitle) subtitle.textContent = 'Create a new secure password for your account.';
    };

    function showAuthError(message) {
      if (successMsg) successMsg.style.display = 'none';
      if (errorMsg) {
        errorMsg.textContent = message || 'Authentication error';
        errorMsg.style.display = 'block';
      }
    }

    function showAuthSuccess(message) {
      if (errorMsg) errorMsg.style.display = 'none';
      if (successMsg) {
        successMsg.textContent = message;
        successMsg.style.display = 'block';
      }
    }

    function showResetError(message) {
      if (resetSuccessMsg) resetSuccessMsg.style.display = 'none';
      if (resetErrorMsg) {
        resetErrorMsg.textContent = message || 'Could not update password';
        resetErrorMsg.style.display = 'block';
      }
    }

    function showResetSuccess(message) {
      if (resetErrorMsg) resetErrorMsg.style.display = 'none';
      if (resetSuccessMsg) {
        resetSuccessMsg.textContent = message;
        resetSuccessMsg.style.display = 'block';
      }
    }

    function setSignInMode() {
      activeTab = 'signin';
      showAuthPanel('main');
      tabSignIn.classList.add('active');
      tabSignUp.classList.remove('active');
      title.textContent = 'Sign In';
      subtitle.textContent = 'Access your secure cloud workspace.';
      submitBtn.querySelector('.btn-text').textContent = 'Sign In';
      passwordInput.autocomplete = 'current-password';
      if (confirmGroup) confirmGroup.style.display = 'none';
      if (passwordRules) passwordRules.style.display = 'none';
      if (resendBtn) resendBtn.style.display = 'none';
      if (forgotBtn) forgotBtn.style.display = 'inline-block';
      if (errorMsg) errorMsg.style.display = 'none';
      if (successMsg) successMsg.style.display = 'none';
    }

    function setSignUpMode() {
      activeTab = 'signup';
      showAuthPanel('main');
      tabSignUp.classList.add('active');
      tabSignIn.classList.remove('active');
      title.textContent = 'Create Account';
      subtitle.textContent = 'Register to sync projects, usage, and subscriptions.';
      submitBtn.querySelector('.btn-text').textContent = 'Create Account';
      passwordInput.autocomplete = 'new-password';
      if (confirmGroup) confirmGroup.style.display = 'flex';
      if (passwordRules) passwordRules.style.display = 'grid';
      if (resendBtn) resendBtn.style.display = 'none';
      if (forgotBtn) forgotBtn.style.display = 'none';
      if (errorMsg) errorMsg.style.display = 'none';
      if (successMsg) successMsg.style.display = 'none';
      updatePasswordRuleIndicators(validateAuthPassword(passwordInput.value || ''), 'auth');
    }

    function showConfirmEmailPanel(email) {
      pendingConfirmEmail = email;
      showAuthPanel('confirm');
      if (title) title.textContent = 'Check Your Email';
      if (subtitle) subtitle.textContent = 'One more step to activate your account.';
      if (confirmEmailText) {
        confirmEmailText.textContent = 'We sent a confirmation link to ' + email + '. Open it to activate your account, then return here to sign in.';
      }
    }

    async function resendConfirmationEmail(email) {
      if (!supabase || !email) return;
      var { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });
      if (error) throw error;
    }

    function bindPasswordToggle(button, input) {
      if (!button || !input) return;
      button.addEventListener('click', function () {
        var isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        button.textContent = isHidden ? 'Hide' : 'Show';
      });
    }

    bindPasswordToggle(togglePasswordBtn, passwordInput);
    bindPasswordToggle(toggleNewPasswordBtn, newPasswordInput);

    if (passwordInput) {
      passwordInput.addEventListener('input', function () {
        if (activeTab === 'signup') {
          updatePasswordRuleIndicators(validateAuthPassword(passwordInput.value || ''), 'auth');
        }
      });
    }

    if (newPasswordInput) {
      newPasswordInput.addEventListener('input', function () {
        updatePasswordRuleIndicators(validateAuthPassword(newPasswordInput.value || ''), 'auth-reset');
      });
    }

    tabSignIn.addEventListener('click', setSignInMode);
    tabSignUp.addEventListener('click', setSignUpMode);

    if (googleBtn) {
      googleBtn.addEventListener('click', async function () {
        if (!supabase) {
          showAuthError('Cloud authentication is not configured.');
          return;
        }

        sessionStorage.setItem('quaasx_pending_boot', '1');
        googleBtn.disabled = true;
        if (errorMsg) errorMsg.style.display = 'none';
        if (successMsg) successMsg.style.display = 'none';

        try {
          var { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: window.location.origin + window.location.pathname,
              queryParams: {
                access_type: 'offline',
                prompt: 'select_account'
              }
            }
          });
          if (error) throw error;
        } catch (err) {
          sessionStorage.removeItem('quaasx_pending_boot');
          showAuthError(err.message || 'Google sign-in failed.');
          googleBtn.disabled = false;
        }
      });
    }

    if (backToSignInBtn) {
      backToSignInBtn.addEventListener('click', setSignInMode);
    }

    if (forgotBtn) {
      forgotBtn.addEventListener('click', async function (e) {
        e.preventDefault();
        if (!supabase) return;

        var email = emailInput.value.trim();
        if (!email) {
          showAuthError('Enter your email address first.');
          return;
        }

        forgotBtn.disabled = true;
        try {
          var { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname
          });
          if (error) throw error;
          showAuthSuccess('Password reset link sent. Check your inbox.');
        } catch (err) {
          showAuthError(err.message || 'Could not send reset email.');
        } finally {
          forgotBtn.disabled = false;
        }
      });
    }

    if (resendBtn) {
      resendBtn.addEventListener('click', async function (e) {
        e.preventDefault();
        var email = pendingConfirmEmail || emailInput.value.trim();
        if (!email) {
          showAuthError('Enter your email address first.');
          return;
        }
        resendBtn.disabled = true;
        try {
          await resendConfirmationEmail(email);
          showAuthSuccess('Confirmation email sent again.');
        } catch (err) {
          showAuthError(err.message || 'Could not resend confirmation email.');
        } finally {
          resendBtn.disabled = false;
        }
      });
    }

    if (resendConfirmBtn) {
      resendConfirmBtn.addEventListener('click', async function () {
        var email = pendingConfirmEmail || emailInput.value.trim();
        if (!email) {
          showAuthError('Missing email address.');
          return;
        }
        resendConfirmBtn.disabled = true;
        try {
          await resendConfirmationEmail(email);
          showAuthSuccess('Confirmation email sent. Check your inbox.');
        } catch (err) {
          showAuthError(err.message || 'Could not resend confirmation email.');
        } finally {
          resendConfirmBtn.disabled = false;
        }
      });
    }

    if (resetForm) {
      resetForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!supabase) return;

        var nextPassword = newPasswordInput.value;
        var confirmPassword = newPasswordConfirmInput.value;
        var checks = validateAuthPassword(nextPassword);

        if (!checks.valid) {
          showResetError('Password must be at least 8 characters and include upper, lower, and a number.');
          return;
        }
        if (nextPassword !== confirmPassword) {
          showResetError('Passwords do not match.');
          return;
        }

        var resetSubmitBtn = document.getElementById('auth-reset-submit-btn');
        resetSubmitBtn.disabled = true;
        try {
          var { error } = await supabase.auth.updateUser({ password: nextPassword });
          if (error) throw error;
          showResetSuccess('Password updated successfully. You can now sign in.');
          setTimeout(function () {
            showAuthPanel('main');
            setSignInMode();
            overlay.style.display = 'none';
            if (window.triggerBootSequence) {
              window.triggerBootSequence();
              window.triggerBootSequence = null;
            }
          }, 900);
        } catch (err) {
          showResetError(err.message || 'Could not update password.');
        } finally {
          resetSubmitBtn.disabled = false;
        }
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!supabase) return;

      var email = emailInput.value.trim();
      var password = passwordInput.value;

      if (errorMsg) errorMsg.style.display = 'none';
      if (successMsg) successMsg.style.display = 'none';
      submitBtn.disabled = true;
      var originalBtnText = submitBtn.querySelector('.btn-text').textContent;
      submitBtn.querySelector('.btn-text').textContent = 'Processing...';

      try {
        if (activeTab === 'signup') {
          var checks = validateAuthPassword(password);
          if (!checks.valid) {
            throw new Error('Password must be at least 8 characters and include upper, lower, and a number.');
          }
          if (password !== passwordConfirmInput.value) {
            throw new Error('Passwords do not match.');
          }
        }

        var res;
        if (activeTab === 'signin') {
          res = await supabase.auth.signInWithPassword({ email: email, password: password });
        } else {
          res = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
              emailRedirectTo: window.location.origin + window.location.pathname,
              data: {
                display_name: email.split('@')[0]
              }
            }
          });
        }

        if (res.error) {
          var message = res.error.message || 'Authentication error';
          if (/confirm/i.test(message)) {
            pendingConfirmEmail = email;
            if (resendBtn) resendBtn.style.display = 'inline-block';
          }
          throw new Error(message);
        }

        if (activeTab === 'signup' && res.data.user && !res.data.session) {
          showConfirmEmailPanel(email);
          return;
        }

        overlay.style.display = 'none';
        if (window.triggerBootSequence) {
          window.triggerBootSequence();
          window.triggerBootSequence = null;
        }
      } catch (err) {
        showAuthError(err.message || 'Authentication error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-text').textContent = originalBtnText;
      }
    });

    guestBtn.addEventListener('click', function () {
      var isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      if (isProduction) {
        showAuthError('Guest mode is disabled in production. Please sign in or create an account.');
        return;
      }
      overlay.style.display = 'none';
      if (window.triggerBootSequence) {
        window.triggerBootSequence();
        window.triggerBootSequence = null;
      }
    });

    // Toggle user dropdown
    if (userWidget) {
      userWidget.addEventListener('click', function (e) {
        e.stopPropagation();
        userWidget.classList.toggle('active');
      });
      document.addEventListener('click', function () {
        userWidget.classList.remove('active');
      });
    }

    if (userLogout) {
      userLogout.addEventListener('click', async function () {
        if (supabase) {
          await supabase.auth.signOut();
          localStorage.removeItem('quaasx_subscription_plan');
          localStorage.removeItem('quaasx_tokens_used');
          location.reload();
        }
      });
    }

    setSignInMode();
  }
})();


