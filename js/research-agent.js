/**
 * ResearchAgent Module
 * Handles web research intent detection and queries backend scraper route to integrate live facts.
 * Exposes: window.ResearchAgent = { detectSearchIntent, conductResearch }
 */
(function () {
  'use strict';

  // Keywords that trigger web research automatically
  var RESEARCH_KEYWORDS = [
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

  /**
   * Detect if a user query requires web research.
   * @param {string} query - User prompt
   * @returns {boolean}
   */
  function detectSearchIntent(query) {
    if (!query) return false;
    var q = query.toLowerCase();
    
    // Check if prompt contains any keyword
    for (var i = 0; i < RESEARCH_KEYWORDS.length; i++) {
      if (q.indexOf(RESEARCH_KEYWORDS[i]) !== -1) {
        return true;
      }
    }
    return false;
  }

  /**
   * Conduct live research via our server endpoint and format the results as prompt context.
   * @param {string} query - Query to search
   * @returns {Promise<string>} - Context fact-sheet for prompt injection
   */
  async function conductResearch(query) {
    var response;
    try {
      response = await fetch('/api/research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: query })
      });
    } catch (err) {
      console.warn('Research fetch failed, continuing without search context:', err);
      return '';
    }

    if (!response.ok) {
      console.warn('Research endpoint returned status:', response.status);
      return '';
    }

    var data;
    try {
      data = await response.json();
    } catch (err) {
      console.warn('Failed to parse research data:', err);
      return '';
    }

    if (!data.results || data.results.length === 0) {
      return '';
    }

    // Format research findings beautifully
    var factSheet = [
      '=================================================================',
      'REAL-TIME WEB RESEARCH FINDINGS (INJECTED VERIFIED LIVE CONTEXT):',
      'The Research Agent scraped the web and found the following facts. Use them as the definitive truth to build the spreadsheet data:',
      ''
    ];

    data.results.forEach(function (res, index) {
      factSheet.push((index + 1) + '. [' + res.title + ']');
      factSheet.push('   Snippet: ' + res.snippet);
      factSheet.push('');
    });

    factSheet.push('=================================================================');
    return factSheet.join('\n');
  }

  // Expose module on window
  window.ResearchAgent = {
    detectSearchIntent: detectSearchIntent,
    conductResearch: conductResearch
  };
})();
