'use client';

import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    const scripts = [
      '/js/formula-engine.js',
      '/js/stat-functions.js',
      '/js/excel-export.js',
      '/js/chart-renderer.js',
      '/js/chart-engine.js',
      '/js/table-renderer.js',
      '/js/ai-service.js',
      '/js/research-agent.js',
      '/js/agent-orchestrator.js',
      '/js/app.js',
    ];

    scripts.forEach((src) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      document.body.appendChild(script);
    });
  }, []);

  return (
    <div className="app-container">
      <header className="topbar">
        <div className="topbar-left">
          <img src="/favicon-192.png" alt="Q108 Sheets Logo" className="brand-logo" />
          <div>
            <h1 className="brand-title">Q108 Sheets</h1>
            <span className="sub-badge">AI Spreadsheet & Data Studio</span>
          </div>
        </div>
        <div className="topbar-right">
          <button className="btn-primary" id="new-sheet-btn">
            <i className="fa-solid fa-plus"></i> New Sheet
          </button>
          <button className="btn-secondary" id="export-sheet-btn">
            <i className="fa-solid fa-download"></i> Export XLSX
          </button>
        </div>
      </header>

      <main className="main-content">
        <div id="grid-container" className="grid-container"></div>
      </main>
    </div>
  );
}
