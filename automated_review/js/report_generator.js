/**
 * CFBench Report Generator
 * Generates formatted review reports from validation results
 */

class ReportGenerator {
    constructor() {
        this.parsed = null;
        this.validatorResults = null;
        this.apiResults = null;
    }

    /**
     * Set data for report generation
     */
    setData(parsed, validatorResults, apiResults = null) {
        this.parsed = parsed;
        this.validatorResults = validatorResults;
        this.apiResults = apiResults;
    }

    /**
     * Generate full HTML report
     */
    generateHTMLReport() {
        const status = this.getOverallStatus();
        const statusClass = status === 'PASS' ? 'status-pass' :
                           status === 'NEEDS_REVIEW' ? 'status-needs-review' :
                           status === 'MINOR_REVISION' ? 'status-minor' : 'status-major';

        let html = `
<div class="review-report">
    <div class="report-header">
        <h2>CFBench Task Review Report</h2>
        <div class="report-meta">
            <span class="meta-item"><strong>Domain:</strong> ${this.parsed?.metadata?.domain || 'N/A'}</span>
            <span class="meta-item"><strong>Language:</strong> ${this.parsed?.metadata?.language || 'N/A'}</span>
            <span class="meta-item"><strong>Turns:</strong> ${this.parsed?.turns?.length || 0}</span>
            <span class="meta-item"><strong>Model Passes:</strong> ${this.parsed?.modelPasses?.length || 0}</span>
        </div>
        <div class="overall-status ${statusClass}">
            ${status}
        </div>
    </div>

    ${this.generatePhaseSection('Phase 1: Structure', this.validatorResults?.phase1 || [])}
    ${this.generatePhaseSection('Phase 2: Content', this.validatorResults?.phase2 || [])}
    ${this.generatePhaseSection('Phase 3: Metadata', this.validatorResults?.phase3 || [])}
    ${this.generatePhaseSection('Phase 4: Model Passes', this.validatorResults?.phase4 || [])}

    ${this.apiResults ? this.generateAPISection() : ''}

    ${this.generateFeedbackSection()}
</div>`;

        return html;
    }

    /**
     * Generate phase section HTML - IMPROVED with detailed tables
     */
    generatePhaseSection(title, checks) {
        if (!checks || checks.length === 0) return '';

        const checksHTML = checks.map(check => {
            const statusIcon = check.status === 'passed' ? '&#10004;' :
                              check.status === 'failed' ? '&#10008;' :
                              check.status === 'needs_review' ? '&#63;' :
                              check.status === 'warning' ? '&#9888;' : '&#8226;';
            const statusClass = `check-${check.status}`;

            let detailsHTML = '';

            // Issues
            if (check.issues && check.issues.length > 0) {
                detailsHTML += `<ul class="check-issues">
                    ${check.issues.map(i => `<li class="issue-item">${this.escapeHTML(i)}</li>`).join('')}
                </ul>`;
            }

            // Warnings
            if (check.warnings && check.warnings.length > 0) {
                detailsHTML += `<ul class="check-warnings">
                    ${check.warnings.map(w => `<li class="warning-item">${this.escapeHTML(w)}</li>`).join('')}
                </ul>`;
            }

            // Special detailed views for specific checks
            detailsHTML += this.generateCheckDetails(check);

            return `
            <div class="check-item ${statusClass}">
                <div class="check-header">
                    <span class="check-status">${statusIcon}</span>
                    <span class="check-id">${check.id}</span>
                    <span class="check-name">${check.name}</span>
                </div>
                ${detailsHTML}
            </div>`;
        }).join('');

        return `
        <div class="report-phase">
            <h3 class="phase-title">${title}</h3>
            <div class="phase-checks">
                ${checksHTML}
            </div>
        </div>`;
    }

    /**
     * Generate detailed view for specific checks
     */
    generateCheckDetails(check) {
        let html = '';

        // Check 1.5 - Golden Response Sanity
        if (check.id === '1.5' && check.details) {
            html += `<div class="check-details-box">
                <div class="detail-row"><strong>Golden Response Length:</strong> ${check.details.goldenLength || 0} chars</div>
                <div class="detail-row"><strong>User Query Length:</strong> ${check.details.queryLength || 0} chars</div>
                <div class="detail-row"><strong>Similarity:</strong> ${Math.round((check.details.similarity || 0) * 100)}%</div>
            </div>`;
        }

        // Check 2.3 - Value Consistency (Constraint Verification Table)
        if (check.id === '2.3') {
            // Show final user query info for debugging
            html += `<div class="check-details-box" style="margin-bottom: 12px;">
                <h5>Final User Query (analyzed)</h5>
                <div class="detail-row"><strong>Length:</strong> ${check.details?.finalUserQueryLength || 0} chars</div>
                <div class="detail-row"><strong>Preview:</strong> <span style="color: var(--text-muted); font-size: 0.75rem;">${this.escapeHTML(check.details?.finalUserQueryPreview || 'N/A')}</span></div>
                <div class="detail-row" style="margin-top: 8px;">
                    <strong>Instructions breakdown:</strong>
                    <span style="color: var(--accent);">${check.details?.userSourceCount || 0} source:user</span> |
                    <span style="color: var(--text-muted);">${check.details?.systemSourceCount || 0} source:system</span>
                </div>
            </div>`;

            if (check.details?.verificationResults?.length > 0) {
                const isAIVerified = check.details.verificationMethod === 'AI';
                html += `<div class="verification-table-container">
                    <h5>Constraints with source: "user" (must be in user query) ${isAIVerified ? '<span class="ai-badge">AI Verified</span>' : ''}</h5>
                    <table class="verification-table">
                        <thead>
                            <tr>
                                <th>Constraint</th>
                                <th>Exact Quote from User Query</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${check.details.verificationResults.map(r => {
                                // Determine status based on found and method
                                let statusClass, statusText, statusIcon;
                                if (r.found === true) {
                                    statusClass = 'row-pass';
                                    statusText = 'PASS';
                                    statusIcon = '✓';
                                } else if (r.found === false && r.method === 'AI') {
                                    // AI confirmed it's missing - definitive FAIL
                                    statusClass = 'row-fail';
                                    statusText = 'FAIL';
                                    statusIcon = '✗';
                                } else if (r.found === false || r.status === 'needs_review') {
                                    // Regex didn't find it - needs review (yellow)
                                    statusClass = 'row-needs-review';
                                    statusText = 'NEEDS REVIEW';
                                    statusIcon = '?';
                                } else {
                                    statusClass = 'row-skip';
                                    statusText = 'N/A';
                                    statusIcon = '—';
                                }

                                const quote = r.exact_quote || r.evidence || 'Not found in query';
                                const methodBadge = r.method === 'AI' ? '<span class="method-badge ai">AI</span>' :
                                                   r.method === 'regex' ? '<span class="method-badge regex">regex</span>' : '';

                                return `
                                <tr class="${statusClass}">
                                    <td>
                                        <strong>${this.escapeHTML(r.constraint_description || r.instruction_id)}</strong>
                                        <div style="font-size: 0.65rem; color: var(--text-muted);">${this.escapeHTML(r.instruction_id)} ${methodBadge}</div>
                                    </td>
                                    <td class="inst-evidence" style="max-width: 400px; font-style: italic;">
                                        ${this.escapeHTML(quote)}
                                    </td>
                                    <td class="${statusClass.replace('row-', 'cell-')}" style="text-align: center; font-weight: 600;">
                                        ${statusIcon} ${statusText}
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                    <div class="verification-summary">
                        <span class="summary-item pass">✓ PASS: ${check.details.verified || 0}</span>
                        ${check.details.failed > 0 ? `<span class="summary-item fail">✗ FAIL: ${check.details.failed}</span>` : ''}
                        ${(check.details.needsReview || check.details.potentiallyMissing || 0) > 0 ? `<span class="summary-item needs-review">? NEEDS REVIEW: ${check.details.needsReview || check.details.potentiallyMissing || 0}</span>` : ''}
                        ${!isAIVerified ? `<span class="summary-item" style="background: var(--bg-tertiary); color: var(--text-muted);">LLM Eval: ${check.details.llmEvalToVerify || 0}</span>` : ''}
                    </div>
                    <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 8px;">
                        ${isAIVerified ? 'AI-verified constraints. PASS = found, FAIL = not found in user query.' : 'Note: Basic check uses regex. Items marked NEEDS REVIEW may have numbers written in words - use "Full AI Analysis" for accurate verification.'}
                    </p>
                </div>`;
            }

            // Show system source constraints (for info only)
            if (check.details?.systemInstructions?.length > 0) {
                html += `<div class="check-details-box" style="margin-top: 12px; opacity: 0.7;">
                    <h5>Constraints with source: "system" (should be in system prompt, not user query)</h5>
                    <ul style="margin: 0; padding-left: 16px; font-size: 0.75rem;">
                        ${check.details.systemInstructions.map(s => `<li>${this.escapeHTML(s.id)}</li>`).join('')}
                    </ul>
                </div>`;
            }
        }

        // Check 2.4 - Prompt Length Validation
        if (check.id === '2.4' && check.details?.checks?.length > 0) {
            html += `<div class="check-details-box">
                <h5>Length Checks (10% tolerance):</h5>
                <table class="verification-table">
                    <thead>
                        <tr><th>Prompt</th><th>Actual</th><th>Expected</th><th>Tolerance Range</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                        ${check.details.checks.map(c => `
                            <tr class="row-${c.status}">
                                <td>${this.escapeHTML(c.label)}</td>
                                <td><strong>${c.actual}</strong></td>
                                <td>${c.expected}</td>
                                <td>${c.withTolerance}</td>
                                <td>${c.status === 'passed' ? '✓' : c.status === 'warning' ? '⚠' : '✗'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`;
        }

        // Check 3.0 - JSON Validation
        if (check.id === '3.0' && check.details?.jsonStatus?.length > 0) {
            // Separate by category
            const turnMetaStatus = check.details.jsonStatus.filter(j => j.cell.includes('turn_metadata'));
            const goldenStatus = check.details.jsonStatus.filter(j => j.cell.includes('golden'));
            const modelPassStatus = check.details.jsonStatus.filter(j => !j.cell.includes('golden') && !j.cell.includes('turn_metadata'));

            const validCount = check.details.jsonStatus.filter(j => j.valid).length;
            const totalCount = check.details.jsonStatus.length;
            const allValid = validCount === totalCount;

            html += `<div class="verification-table-container">
                <h5>JSON Validation Status - Todas as células com JSON</h5>
                <div class="distribution-summary" style="margin-bottom: 12px; display: flex; gap: 12px; flex-wrap: wrap;">
                    <span class="${allValid ? 'summary-item pass' : 'summary-item fail'}" style="font-size: 0.9rem;">
                        ${allValid ? '✓' : '✗'} <strong>${validCount}/${totalCount}</strong> JSONs válidos
                    </span>
                    ${!allValid ? `<span class="summary-item fail">⚠ Alguns JSONs estão quebrados!</span>` : ''}
                </div>

                <!-- Visual grid of JSON status -->
                <div class="json-status-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; margin-bottom: 16px;">
                    ${check.details.jsonStatus.map(j => {
                        const bgColor = j.valid ? 'linear-gradient(135deg, #1a2f1a 0%, #0d1a0d 100%)' :
                                       j.status === 'NOT FOUND' ? 'linear-gradient(135deg, #2f2f1a 0%, #1a1a0d 100%)' :
                                       'linear-gradient(135deg, #2f1a1a 0%, #1a0d0d 100%)';
                        const borderColor = j.valid ? '#2d5a2d' : j.status === 'NOT FOUND' ? '#5a5a2d' : '#5a2d2d';
                        const iconColor = j.valid ? '#4ade80' : j.status === 'NOT FOUND' ? '#fde047' : '#f87171';
                        const icon = j.valid ? '✓' : j.status === 'NOT FOUND' ? '?' : '✗';

                        return `
                        <div class="json-cell-status" style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 6px; padding: 8px 10px;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="color: ${iconColor}; font-size: 1.1rem; font-weight: bold;">${icon}</span>
                                <span style="color: var(--text-primary); font-size: 0.75rem; font-weight: 500;">${this.escapeHTML(j.cell)}</span>
                            </div>
                            ${j.error ? `<div style="color: #f87171; font-size: 0.65rem; margin-top: 4px; word-break: break-all;">${this.escapeHTML(j.error)}</div>` : ''}
                        </div>`;
                    }).join('')}
                </div>

                <!-- Detailed table -->
                <details style="margin-top: 8px;">
                    <summary style="cursor: pointer; font-weight: 600; font-size: 0.8rem; color: var(--text-secondary);">Ver tabela detalhada</summary>
                    <table class="verification-table" style="margin-top: 8px;">
                        <thead>
                            <tr>
                                <th>Célula</th>
                                <th>Tipo</th>
                                <th>Status JSON</th>
                                <th>Erro</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${check.details.jsonStatus.map(j => {
                                const cellType = j.cell.includes('turn_metadata') ? 'Metadata' :
                                                j.cell.includes('validator_assistant') ? 'Validator Assistant' :
                                                j.cell.includes('validator_human') ? 'Validator Human' : 'Outro';
                                return `
                                <tr class="${j.valid ? 'row-pass' : 'row-fail'}">
                                    <td><strong>${this.escapeHTML(j.cell)}</strong></td>
                                    <td style="color: var(--text-muted); font-size: 0.75rem;">${cellType}</td>
                                    <td style="text-align: center;">
                                        ${j.status === 'VALID' ? '<span style="color:#4ade80; font-weight:600;">✓ VALID</span>' :
                                          j.status === 'NOT FOUND' ? '<span style="color:#fde047;">⚠ NOT FOUND</span>' :
                                          '<span style="color:#f87171; font-weight:600;">✗ INVALID</span>'}
                                    </td>
                                    <td class="inst-evidence" style="color: #f87171; font-size: 0.7rem;">${this.escapeHTML(j.error || '-')}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </details>

                <div style="font-size: 11px; color: var(--text-muted); margin-top: 12px; padding: 8px; background: var(--bg-tertiary); border-radius: 4px;">
                    <strong>✓ VALID:</strong> JSON parseado com sucesso, dados disponíveis para análise<br>
                    <strong>✗ INVALID:</strong> JSON com erro de sintaxe - não foi possível ler os dados<br>
                    <strong>⚠ NOT FOUND:</strong> Célula não encontrada no notebook
                </div>
            </div>`;
        }

        // Check 3.6 - Keyword Explicitness
        if (check.id === '3.6' && check.details?.analysis?.length > 0) {
            html += `<div class="verification-table-container">
                <h5>Keyword Analysis:</h5>
                <table class="verification-table">
                    <thead>
                        <tr>
                            <th>Keyword</th>
                            <th>Frequency</th>
                            <th>In Query?</th>
                            <th>Explicit?</th>
                            <th>Evidence</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${check.details.analysis.map(a => `
                            <tr class="${!a.foundInQuery ? 'row-fail' : a.isExplicit ? 'row-pass' : 'row-warn'}">
                                <td><strong>${this.escapeHTML(a.keyword)}</strong></td>
                                <td>${a.frequency}x</td>
                                <td>${a.foundInQuery ? '✓' : '✗'}</td>
                                <td>${a.isExplicit ? '✓ Explicit' : '⚠ Implicit'}</td>
                                <td class="inst-evidence">${this.escapeHTML(a.evidence || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="verification-summary">
                    <span class="summary-item pass">✓ Explicit: ${check.details.explicit || 0}</span>
                    <span class="summary-item warn">⚠ Implicit: ${check.details.implicit || 0}</span>
                    <span class="summary-item fail">✗ Missing: ${check.details.missing || 0}</span>
                </div>
            </div>`;
        }

        // Check 4.2 - Pass/Fail Distribution (Model Breaking Rule)
        if (check.id === '4.2') {
            // Show Model Breaking Rule summary first
            const failRates = check.details?.failRates || [];
            const passesOver50 = check.details?.passesWithOver50PercentFail || 0;
            const ruleStatus = passesOver50 >= 3 ? 'pass' : 'fail';

            html += `<div class="verification-table-container">
                <h5>Model Breaking Rule: ≥3 of 4 must fail ≥50%</h5>
                <div class="distribution-summary" style="margin-bottom: 12px;">
                    <span class="${ruleStatus === 'pass' ? 'summary-item pass' : 'summary-item fail'}">
                        <strong>Passes with ≥50% fail:</strong> ${passesOver50}/4 ${ruleStatus === 'pass' ? '✓' : '✗'}
                    </span>
                </div>`;

            if (failRates.length > 0) {
                html += `
                <div class="parallel-validators" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                    <!-- CELL RESULTS (Notebook) -->
                    <div class="validator-panel" style="background: linear-gradient(135deg, #1a2f1a 0%, #0d1a0d 100%); border: 1px solid #2d5a2d; border-radius: 8px; padding: 12px;">
                        <h6 style="color: #4ade80; margin: 0 0 8px 0; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;">
                            <span style="background: #4ade80; color: #0d1a0d; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem;">CELL</span>
                            Notebook Validator (validator_assistant)
                        </h6>
                        <p style="color: #a3e635; font-size: 0.7rem; margin: 0 0 8px 0;">Resultados da célula do notebook - fonte primária</p>
                        <table class="verification-table" style="font-size: 0.75rem;">
                            <thead>
                                <tr style="background: #1a3d1a;">
                                    <th>Model</th>
                                    <th>Pass</th>
                                    <th>Fail</th>
                                    <th>Fail%</th>
                                    <th>JSON</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${failRates.map(f => {
                                    const cellFailRate = f.notebook_fail_rate || 0;
                                    const cellMeets50 = cellFailRate >= 50;
                                    const jsonValid = f.json_valid !== false && f.notebook_total > 0;
                                    const jsonError = f.json_error;
                                    return `
                                    <tr class="${cellMeets50 ? 'row-pass' : 'row-fail'}">
                                        <td><strong>${this.escapeHTML(f.id)}</strong></td>
                                        <td style="color: #4ade80;">${f.notebook_passed || 0}</td>
                                        <td style="color: #f87171;">${f.notebook_failed || 0}</td>
                                        <td><strong>${cellFailRate}%</strong></td>
                                        <td title="${jsonError ? this.escapeHTML(jsonError) : 'JSON válido'}">${jsonValid ? '<span style="color:#4ade80;">✓</span>' : '<span style="color:#f87171;">✗</span>'}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>

                    <!-- SCRIPT VALIDATION (Tool) -->
                    <div class="validator-panel" style="background: linear-gradient(135deg, #2f2f1a 0%, #1a1a0d 100%); border: 1px solid #5a5a2d; border-radius: 8px; padding: 12px;">
                        <h6 style="color: #fde047; margin: 0 0 8px 0; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;">
                            <span style="background: #fde047; color: #1a1a0d; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem;">SCRIPT</span>
                            Tool Validation (NvidiaValidator)
                        </h6>
                        <p style="color: #fef08a; font-size: 0.7rem; margin: 0 0 8px 0;">Validação própria do script - double-check</p>
                        <table class="verification-table" style="font-size: 0.75rem;">
                            <thead>
                                <tr style="background: #3d3d1a;">
                                    <th>Model</th>
                                    <th>Mech</th>
                                    <th>Sem</th>
                                    <th>LLM</th>
                                    <th>Fail%</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${failRates.map(f => {
                                    const scriptMeets50 = f.meets_50_percent;
                                    return `
                                    <tr class="${scriptMeets50 ? 'row-pass' : 'row-fail'}">
                                        <td><strong>${this.escapeHTML(f.id)}</strong></td>
                                        <td style="color: #f87171;">${f.mechanical_failed || 0}</td>
                                        <td style="color: #fb923c;">${f.semantic_failed || 0}</td>
                                        <td style="color: #c084fc;">${f.llm_judge_failed || 0}</td>
                                        <td><strong>${f.failRate}%</strong></td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Comparison Summary -->
                <div class="comparison-summary" style="background: #1a1a2e; border: 1px solid #3b3b5c; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                    <h6 style="color: #a5b4fc; margin: 0 0 8px 0; font-size: 0.8rem;">Comparação: Cell vs Script</h6>
                    <table class="verification-table" style="font-size: 0.75rem;">
                        <thead>
                            <tr>
                                <th>Model</th>
                                <th>Cell Fail%</th>
                                <th>Script Fail%</th>
                                <th>Diferença</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${failRates.map(f => {
                                const cellRate = f.notebook_fail_rate || 0;
                                const scriptRate = f.failRate || 0;
                                const diff = Math.abs(cellRate - scriptRate);
                                const hasDivergence = diff > 10;
                                const cellMeets = cellRate >= 50;
                                const scriptMeets = scriptRate >= 50;
                                const bothAgree = cellMeets === scriptMeets;
                                return `
                                <tr class="${bothAgree ? 'row-pass' : 'row-warn'}">
                                    <td><strong>${this.escapeHTML(f.id)}</strong></td>
                                    <td>${cellRate}%</td>
                                    <td>${scriptRate}%</td>
                                    <td style="color: ${hasDivergence ? '#f87171' : '#4ade80'};">${diff.toFixed(1)}%</td>
                                    <td>${bothAgree ? '✓ Concordam' : '⚠ Divergem'}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px; padding: 8px; background: var(--bg-tertiary); border-radius: 4px;">
                    <strong>CELL (Verde):</strong> Dados diretamente da célula validator_assistant do notebook (fonte primária)<br>
                    <strong>SCRIPT (Amarelo):</strong> Validação própria usando NvidiaValidator (double-check)<br>
                    <strong>JSON:</strong> ✓ = JSON da célula válido e parseado corretamente
                </div>`;
            }

            html += `<div class="distribution-summary" style="margin-top: 12px;">
                    <span><strong>Golden Status:</strong> ${check.details?.summary?.goldenStatus || 'N/A'}</span>
                </div>`;

            // Show instruction matrix if available
            if (check.details?.instructionMatrix?.length > 0) {
                html += `<details style="margin-top: 16px;">
                    <summary style="cursor: pointer; font-weight: 600;">View Instruction Matrix (${check.details.instructionMatrix.length} instructions)</summary>
                <table class="verification-table matrix-table" style="margin-top: 8px;">
                    <thead>
                        <tr>
                            <th>Instruction</th>
                            <th>Golden</th>
                            ${Object.keys(check.details.instructionMatrix[0]?.passResults || {}).map(p =>
                                `<th>${this.escapeHTML(p)}</th>`
                            ).join('')}
                            <th>Variation?</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${check.details.instructionMatrix.slice(0, 10).map(row => `
                            <tr>
                                <td class="inst-id">${this.escapeHTML(row.instruction?.substring(0, 30) || '-')}</td>
                                <td class="${row.golden === 'PASS' ? 'cell-pass' : 'cell-fail'}">${row.golden || '-'}</td>
                                ${Object.values(row.passResults || {}).map(v =>
                                    `<td class="${v === 'PASS' ? 'cell-pass' : 'cell-fail'}">${v || '-'}</td>`
                                ).join('')}
                                <td>${row.hasVariation ? '✓' : '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${check.details.instructionMatrix.length > 10 ?
                    `<div class="table-note">Showing first 10 of ${check.details.instructionMatrix.length} instructions</div>` : ''}
                </details>`;
            }
            html += `</div>`;
        }

        // Check 4.4 - Validator-Content Match
        if (check.id === '4.4' && (check.details?.mismatchedPhrases?.length > 0 || check.details?.verifiedPhrases?.length > 0)) {
            html += `<div class="verification-table-container">
                <h5>Validator-Content Verification:</h5>
                <div class="verification-summary">
                    <span class="summary-item pass">✓ Verified Phrases: ${check.details.verified || 0}</span>
                    <span class="summary-item fail">✗ Mismatched Phrases: ${check.details.mismatched || 0}</span>
                </div>`;

            if (check.details.mismatchedPhrases?.length > 0) {
                html += `<div class="mismatched-phrases">
                    <h6>⚠ Phrases NOT found in golden response:</h6>
                    <ul class="phrase-list">
                        ${check.details.mismatchedPhrases.map(m => `
                            <li class="phrase-item fail">
                                <strong>[${this.escapeHTML(m.checkId)}]</strong>
                                "${this.escapeHTML(m.phrase.substring(0, 80))}${m.phrase.length > 80 ? '...' : ''}"
                                <span class="match-ratio">(${m.matchRatio} word match)</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>`;
            }
            html += `</div>`;
        }

        // Check 2.7 - System Source Constraints
        if (check.id === '2.7' && check.details?.verificationResults?.length > 0) {
            html += `<div class="verification-table-container">
                <h5>System Source Constraints (source: "system")</h5>
                <table class="verification-table">
                    <thead>
                        <tr>
                            <th>Instruction ID</th>
                            <th>Source</th>
                            <th>In System Prompt?</th>
                            <th>Evidence</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${check.details.verificationResults.map(r => `
                            <tr class="${r.found ? 'row-pass' : 'row-warn'}">
                                <td class="inst-id">${this.escapeHTML(r.instruction_id)}</td>
                                <td>${this.escapeHTML(r.source)}</td>
                                <td>${r.found ? '✓ Found' : '⚠ Not verified'}</td>
                                <td class="inst-evidence">${this.escapeHTML(r.evidence || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="verification-summary">
                    <span class="summary-item pass">✓ Verified: ${check.details.verified || 0}</span>
                    <span class="summary-item warn">⚠ Not found: ${check.details.notFound || 0}</span>
                </div>
            </div>`;
        }

        // Check 2.8 - Forbidden Terms
        if (check.id === '2.8' && check.details) {
            const foundTerms = check.details.foundTerms || [];
            const checkedTerms = check.details.checkedTerms || [];

            html += `<div class="check-details-box">
                <h5>Forbidden Terms Check</h5>
                <div class="detail-row">
                    <strong>Terms checked:</strong> ${checkedTerms.join(', ')}
                </div>
                ${foundTerms.length > 0 ? `
                <div class="detail-row" style="color: var(--error);">
                    <strong>Found (FORBIDDEN):</strong> ${foundTerms.join(', ')}
                </div>` : `
                <div class="detail-row" style="color: var(--success);">
                    ✓ No forbidden terms found in system prompt
                </div>`}
            </div>`;
        }

        // Check 2.9 - Golden Formatting
        if (check.id === '2.9' && check.details?.foundIssues?.length > 0) {
            html += `<div class="verification-table-container">
                <h5>Golden Response Formatting Issues</h5>
                <table class="verification-table">
                    <thead>
                        <tr>
                            <th>Issue Type</th>
                            <th>Details</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${check.details.foundIssues.map(issue => `
                            <tr class="row-fail">
                                <td><strong>${this.escapeHTML(issue.type)}</strong></td>
                                <td class="inst-evidence">${
                                    issue.type === 'emoji' ? `${issue.count} emoji(s): ${(issue.examples || []).join(' ')}` :
                                    issue.type === 'em-dash' ? `${issue.count} em-dash(es) found` :
                                    issue.type === 'currency' ? `Symbols: ${(issue.symbols || []).join(', ')}` :
                                    issue.type === 'latex' ? `${issue.count} LaTeX expression(s)` :
                                    issue.type === 'preamble' ? `Starts with: "${issue.found}"` :
                                    JSON.stringify(issue)
                                }</td>
                                <td style="color: var(--error);">✗ FORBIDDEN</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`;
        }

        return html;
    }

    /**
     * Generate API analysis section - IMPROVED VERSION
     */
    generateAPISection() {
        if (!this.apiResults) return '';

        let html = `
        <div class="report-phase api-phase">
            <h3 class="phase-title">AI Analysis</h3>`;

        // Query Structure Analysis (improved)
        if (this.apiResults.query_analysis || this.apiResults.structure_analysis) {
            const qa = this.apiResults.query_analysis || this.apiResults;
            html += `
            <div class="api-section">
                <h4>Query Structure Analysis</h4>
                <div class="score-badge">Score: ${qa.overall_score || qa.structure_score || 'N/A'}/10</div>
                <div class="status-badge status-${(qa.status || 'unknown').toLowerCase()}">${qa.status || 'N/A'}</div>`;

            // Show structure breakdown if available
            if (qa.structure_analysis) {
                html += `
                <div class="structure-details">
                    <p><strong>70/30 Compliant:</strong> ${qa.structure_analysis.is_70_30_compliant ? '✓ Yes' : '✗ No'}</p>
                    <p><strong>Constraints Stacked:</strong> ${qa.structure_analysis.constraints_stacked_at_end ? '✗ Yes (bad)' : '✓ No (good)'}</p>
                </div>`;
            }

            // Show instruction verification if available
            if (qa.instruction_verification?.length > 0) {
                html += `
                <div class="instruction-verification">
                    <h5>Instruction Verification</h5>
                    <table class="verification-table">
                        <thead><tr><th>Instruction</th><th>In Query?</th><th>Evidence</th></tr></thead>
                        <tbody>
                            ${qa.instruction_verification.map(v => `
                                <tr class="${v.found_in_query ? 'row-pass' : 'row-fail'}">
                                    <td>${this.escapeHTML(v.instruction)}</td>
                                    <td>${v.found_in_query ? '✓' : '✗'}</td>
                                    <td class="evidence">${this.escapeHTML(v.evidence || v.issue || '-')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>`;
            }

            if (qa.issues?.length > 0) {
                html += `
                <ul class="check-issues">
                    ${qa.issues.map(i => `<li>${this.escapeHTML(i)}</li>`).join('')}
                </ul>`;
            }
            html += '</div>';
        }

        // CRITICAL: Constraints Validation (AI check for hidden constraints)
        if (this.apiResults.constraints_validation) {
            const cv = this.apiResults.constraints_validation;
            const isValid = cv.overall_valid !== false && (!cv.critical_issues || cv.critical_issues.length === 0);

            html += `
            <div class="api-section ${!isValid ? 'critical-section' : ''}">
                <h4>${!isValid ? '⚠️ CRITICAL: ' : ''}Constraints in Query Validation</h4>
                <div class="status-badge status-${isValid ? 'pass' : 'major'}">${isValid ? 'VALID' : 'HIDDEN CONSTRAINTS FOUND'}</div>
                <p><strong>Total Constraints:</strong> ${cv.total_constraints || 0} | <strong>Explicit in Query:</strong> ${cv.explicit_in_query || 0}</p>`;

            // Show critical issues (hidden constraints)
            if (cv.critical_issues?.length > 0) {
                html += `
                <div class="critical-issues">
                    <h5>🚨 Hidden Constraints (MUST FIX):</h5>
                    <ul>
                        ${cv.critical_issues.map(i => `<li class="critical-item">${this.escapeHTML(i)}</li>`).join('')}
                    </ul>
                </div>`;
            }

            // Show constraint details
            if (cv.hidden_constraints?.length > 0) {
                html += `
                <div class="constraint-details">
                    <h5>Constraint Analysis:</h5>
                    <table class="verification-table">
                        <thead><tr><th>Constraint ID</th><th>Status</th><th>Evidence</th></tr></thead>
                        <tbody>
                            ${cv.hidden_constraints.map(c => `
                                <tr class="${c.status === 'FOUND' ? 'row-pass' : c.status === 'IMPLICIT' ? 'row-warn' : 'row-fail'}">
                                    <td><strong>${this.escapeHTML(c.id)}</strong></td>
                                    <td class="status-${c.status?.toLowerCase()}">${c.status}</td>
                                    <td class="evidence">${this.escapeHTML(c.evidence || '-')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>`;
            }

            // Show llm_judge check
            if (cv.llm_judge_check?.length > 0) {
                html += `
                <div class="llm-judge-details">
                    <h5>LLM Judge in Query:</h5>
                    <table class="verification-table">
                        <thead><tr><th>UID</th><th>Content</th><th>In Query?</th></tr></thead>
                        <tbody>
                            ${cv.llm_judge_check.map(j => `
                                <tr class="${j.found_in_query ? 'row-pass' : 'row-fail'}">
                                    <td>${j.uid}</td>
                                    <td>${this.escapeHTML(j.content?.substring(0, 50) || '-')}...</td>
                                    <td>${j.found_in_query ? '✓ Yes' : '✗ No'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>`;
            }

            // Summary from AI
            if (cv.summary) {
                html += `<div class="ai-summary"><strong>AI Summary:</strong> ${this.escapeHTML(cv.summary)}</div>`;
            }

            html += '</div>';
        }

        // Instruction Integration Check (from comprehensive review)
        if (this.apiResults.instruction_check) {
            const ic = this.apiResults.instruction_check;
            html += `
            <div class="api-section">
                <h4>Instruction Integration</h4>
                <p><strong>Total:</strong> ${ic.total_instructions} | <strong>Explicit in Query:</strong> ${ic.explicitly_in_query}</p>
                ${ic.missing_or_implicit?.length > 0 ?
                    `<div class="missing-instructions">
                        <h5>Missing or Implicit Instructions:</h5>
                        <ul>
                            ${ic.missing_or_implicit.map(m => `
                                <li class="issue-item">
                                    <strong>[${this.escapeHTML(m.id)}]</strong>
                                    <span class="status-${m.status}">${m.status}</span>:
                                    ${this.escapeHTML(m.issue)}
                                </li>
                            `).join('')}
                        </ul>
                    </div>` : '<p class="no-issues">All instructions explicitly in query ✓</p>'}
            </div>`;
        }

        // LLM Judge Integration Check
        if (this.apiResults.llm_judge_check) {
            const ljc = this.apiResults.llm_judge_check;
            html += `
            <div class="api-section">
                <h4>LLM Judge Integration</h4>
                <p><strong>Total:</strong> ${ljc.total} | <strong>Integrated:</strong> ${ljc.integrated}</p>
                ${ljc.missing?.length > 0 ?
                    `<div class="missing-llmjudge">
                        <h5>Missing LLM Judge Items:</h5>
                        <ul>
                            ${ljc.missing.map(m => `
                                <li class="issue-item">
                                    <strong>UID ${m.uid}:</strong> "${this.escapeHTML(m.content)}"
                                    <br><span class="issue-detail">${this.escapeHTML(m.issue)}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>` : '<p class="no-issues">All llm_judge items integrated ✓</p>'}
            </div>`;
        }

        // Model Pass Distribution
        if (this.apiResults.model_pass_check || this.apiResults.model_passes_analysis) {
            const mpc = this.apiResults.model_pass_check || this.apiResults.model_passes_analysis;
            html += `
            <div class="api-section">
                <h4>Model Pass Distribution</h4>
                <p><strong>Golden Passes All:</strong> ${mpc.golden_passes_all ? '✓ Yes' : '✗ No'}</p>
                <p><strong>Passes that Pass All:</strong> ${mpc.passes_that_pass_all || 0}/4 (max 2 allowed)</p>
                <p><strong>Distribution Valid:</strong> ${mpc.distribution_valid ? '✓ Yes' : '✗ No'}</p>
                ${mpc.evasions_detected?.length > 0 ?
                    `<div class="evasions-detected">
                        <h5>Evasions Detected:</h5>
                        <ul class="check-issues">
                            ${mpc.evasions_detected.map(e => `<li>${this.escapeHTML(typeof e === 'string' ? e : JSON.stringify(e))}</li>`).join('')}
                        </ul>
                    </div>` : ''}
                ${mpc.issues?.length > 0 ?
                    `<ul class="check-issues">
                        ${mpc.issues.map(i => `<li>${this.escapeHTML(i)}</li>`).join('')}
                    </ul>` : ''}
            </div>`;
        }

        // Critical Issues Section
        if (this.apiResults.critical_issues?.length > 0) {
            html += `
            <div class="api-section critical-section">
                <h4>🚨 Critical Issues (Must Fix)</h4>
                <ul class="critical-list">
                    ${this.apiResults.critical_issues.map(i => `<li>${this.escapeHTML(i)}</li>`).join('')}
                </ul>
            </div>`;
        }

        // Warnings Section
        if (this.apiResults.warnings?.length > 0) {
            html += `
            <div class="api-section warning-section">
                <h4>⚠️ Warnings</h4>
                <ul class="warning-list">
                    ${this.apiResults.warnings.map(w => `<li>${this.escapeHTML(w)}</li>`).join('')}
                </ul>
            </div>`;
        }

        html += '</div>';
        return html;
    }

    /**
     * Generate feedback section with structured feedback like manual review
     */
    generateFeedbackSection() {
        const status = this.getOverallStatus();
        const feedbackData = this.generateStructuredFeedback();
        const charCount = feedbackData.charCount || feedbackData.text.length;
        const isOverLimit = charCount > 1500;

        return `
        <div class="report-feedback">
            <h3 class="feedback-title">📋 Trainer Feedback (Copy & Paste)</h3>
            <div class="feedback-status ${status.toLowerCase().replace('_', '-')}">
                <strong>Status:</strong> ${status === 'PASS' ? '✅ APPROVED' : status === 'NEEDS_REVIEW' ? '🔍 NEEDS REVIEW' : status === 'MINOR_REVISION' ? '⚠️ MINOR REVISION' : '❌ MAJOR REVISION'}
            </div>
            <div class="feedback-content">
                <pre id="feedback-text">${feedbackData.text}</pre>
            </div>
            <div class="feedback-actions">
                <button class="copy-btn" onclick="copyFeedback()">
                    <i class="fas fa-copy"></i> Copy Report
                </button>
                <span class="char-count ${isOverLimit ? 'over-limit' : ''}">${charCount}/1500 chars</span>
            </div>
        </div>`;
    }

    /**
     * Generate structured feedback - MAX 1500 characters for trainer feedback
     */
    generateStructuredFeedback() {
        const status = this.getOverallStatus();
        const p = this.parsed;
        const api = this.apiResults || {};
        const MAX_CHARS = 1500;

        let report = '';

        // Compact header
        report += `═══ CFBench Review ═══\n`;
        report += `Domain: ${p?.metadata?.domain || 'N/A'} | Lang: ${p?.metadata?.language || 'N/A'}\n\n`;

        // Golden Response (compact)
        const goldenVA = p?.finalTurn?.validatorAssistant;
        if (goldenVA) {
            const allPassed = goldenVA.failed === 0;
            report += `Golden: ${goldenVA.passed}/${goldenVA.totalChecks} ${allPassed ? '✅' : '❌'}\n`;
        }

        // Model Passes (compact) with Model Breaking Rule
        if (p?.modelPasses?.length > 0) {
            let passesOver50 = 0;
            report += `Model Breaking (≥3/4 must fail ≥50%):\n`;
            p.modelPasses.forEach(pass => {
                const va = pass.validatorAssistant;
                if (va && va.totalChecks > 0) {
                    const failRate = Math.round((va.failed / va.totalChecks) * 100);
                    if (failRate >= 50) passesOver50++;
                    report += `• ${pass.model}_${pass.passNumber}: ${failRate}% ${failRate >= 50 ? '✅' : '⚠️'}\n`;
                }
            });
            report += `→ ${passesOver50}/4 pass rule ${passesOver50 >= 3 ? '✅' : '❌'}\n`;
        }
        report += `\n`;

        // Constraints (compact - from AI)
        const cv = api.constraints_validation;
        if (cv && cv.hidden_constraints) {
            report += `Constraints:\n`;
            cv.hidden_constraints.slice(0, 6).forEach(c => {
                const icon = c.status === 'FOUND' ? '✅' : c.status === 'IMPLICIT' ? '⚠️' : '❌';
                report += `${icon} ${c.id}\n`;
            });
            report += `\n`;
        }

        // Critical Issues (most important!)
        const criticalIssues = cv?.critical_issues || [];
        const allChecks = [
            ...(this.validatorResults?.phase1 || []),
            ...(this.validatorResults?.phase2 || []),
            ...(this.validatorResults?.phase3 || []),
            ...(this.validatorResults?.phase4 || [])
        ];
        const failedChecks = allChecks.filter(c => c.status === 'failed');

        if (criticalIssues.length > 0 || failedChecks.length > 0) {
            report += `🚨 ISSUES:\n`;
            criticalIssues.slice(0, 3).forEach((issue, i) => {
                const shortIssue = issue.length > 80 ? issue.substring(0, 77) + '...' : issue;
                report += `${i + 1}. ${shortIssue}\n`;
            });
            failedChecks.slice(0, 2).forEach(check => {
                check.issues?.slice(0, 1).forEach(issue => {
                    const shortIssue = issue.length > 60 ? issue.substring(0, 57) + '...' : issue;
                    report += `• ${shortIssue}\n`;
                });
            });
            report += `\n`;
        }

        // Final Status
        const statusIcon = status === 'PASS' ? '✅' : status === 'MINOR_REVISION' ? '⚠️' : '❌';
        const statusText = status === 'PASS' ? 'APPROVED' : status === 'MINOR_REVISION' ? 'MINOR REVISION' : 'MAJOR REVISION';
        report += `═══ ${statusIcon} ${statusText} ═══\n`;

        // Truncate if still too long
        if (report.length > MAX_CHARS) {
            report = report.substring(0, MAX_CHARS - 20) + '\n[truncated...]';
        }

        return {
            text: report,
            issueCount: criticalIssues.length + failedChecks.reduce((sum, c) => sum + (c.issues?.length || 0), 0),
            charCount: report.length
        };
    }

    /**
     * Format issue message for trainer feedback
     */
    formatIssueForFeedback(check, issue) {
        // Map check IDs to user-friendly descriptions
        const checkDescriptions = {
            '1.1': 'Cell Structure',
            '1.2': 'Language Consistency',
            '1.3': 'Thinking Cells',
            '1.4': 'Model Passes Structure',
            '1.5': 'Golden Response Issue',
            '2.1': 'System Prompt',
            '2.2': 'System Prompt Contains Model Reasoning',
            '2.3': 'Value Mismatch (Query vs Metadata)',
            '2.4': 'Prompt Length',
            '2.5': 'Incomplete User Query',
            '2.6': 'Intermediate Turn Issues',
            '3.0': 'JSON Validation Error',
            '3.1': 'IF Instructions Count',
            '3.2': 'Missing LLM Eval',
            '3.3': 'Missing LLM Judge',
            '3.4': 'LLM Judge Usage Issue',
            '3.5': 'Hidden Constraints',
            '3.6': 'Keyword Issues',
            '4.2': 'Model Pass Distribution',
            '4.3': 'Validator Human Issues',
            '4.4': 'Validator-Content Mismatch'
        };

        const description = checkDescriptions[check.id] || check.name;

        // Clean up the issue text
        let cleanIssue = issue
            .replace(/\[.*?\]\s*/g, '') // Remove [check_id] prefixes
            .replace(/CRITICAL:\s*/gi, '')
            .trim();

        return `${description}: ${cleanIssue}`;
    }

    /**
     * Generate plain text report
     */
    generateTextReport() {
        const status = this.getOverallStatus();
        const sep = '═'.repeat(60);
        const sepLight = '─'.repeat(60);

        let text = `${sep}
CFBench Task Review Report
${sep}

Domain: ${this.parsed?.metadata?.domain || 'N/A'}
Language: ${this.parsed?.metadata?.language || 'N/A'}
Turns: ${this.parsed?.turns?.length || 0}
Model Passes: ${this.parsed?.modelPasses?.length || 0}

OVERALL STATUS: ${status}

${sepLight}
PHASE 1: STRUCTURE
${sepLight}
${this.formatPhaseText(this.validatorResults?.phase1 || [])}

${sepLight}
PHASE 2: CONTENT
${sepLight}
${this.formatPhaseText(this.validatorResults?.phase2 || [])}

${sepLight}
PHASE 3: METADATA
${sepLight}
${this.formatPhaseText(this.validatorResults?.phase3 || [])}

${sepLight}
PHASE 4: MODEL PASSES
${sepLight}
${this.formatPhaseText(this.validatorResults?.phase4 || [])}
`;

        if (this.apiResults) {
            text += `
${sepLight}
AI ANALYSIS
${sepLight}
${this.formatAPIText()}
`;
        }

        text += `
${sep}
FEEDBACK
${sep}
${this.generateFeedbackText()}
`;

        return text;
    }

    /**
     * Format phase checks as text
     */
    formatPhaseText(checks) {
        return checks.map(check => {
            const icon = check.status === 'passed' ? '[PASS]' :
                        check.status === 'failed' ? '[FAIL]' : '[SKIP]';
            let text = `${icon} ${check.id} - ${check.name}`;

            if (check.issues?.length > 0) {
                text += '\n' + check.issues.map(i => `    - ${i}`).join('\n');
            }
            if (check.warnings?.length > 0) {
                text += '\n' + check.warnings.map(w => `    ! ${w}`).join('\n');
            }

            return text;
        }).join('\n\n');
    }

    /**
     * Format API results as text
     */
    formatAPIText() {
        if (!this.apiResults) return 'No AI analysis performed';

        let text = '';

        if (this.apiResults.query_analysis) {
            text += `Query Structure Score: ${this.apiResults.query_analysis.structure_score || 'N/A'}/10\n`;
        }

        if (this.apiResults.critical_issues?.length > 0) {
            text += '\nCritical Issues:\n';
            text += this.apiResults.critical_issues.map(i => `  - ${i}`).join('\n');
        }

        return text || 'No significant findings';
    }

    /**
     * Generate feedback text
     */
    generateFeedbackText() {
        const issues = this.validatorResults?.getAllIssues?.() || [];
        const apiIssues = this.apiResults?.critical_issues || [];

        if (issues.length === 0 && apiIssues.length === 0) {
            return 'Task looks good! No issues found.';
        }

        let text = '';

        if (issues.length > 0 || apiIssues.length > 0) {
            text += 'Issues Found:\n';
            [...issues.map(i => i.issue), ...apiIssues].forEach((issue, idx) => {
                text += `${idx + 1}. ${issue}\n`;
            });
        }

        if (this.apiResults?.feedback_for_trainer) {
            text += `\nDetailed Feedback:\n${this.apiResults.feedback_for_trainer}`;
        }

        return text;
    }

    /**
     * Get overall status
     */
    getOverallStatus() {
        if (this.apiResults?.overall_status) {
            return this.apiResults.overall_status;
        }
        return this.validatorResults?.summary?.status || 'UNKNOWN';
    }

    /**
     * Escape HTML special characters
     */
    escapeHTML(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Get summary statistics
     */
    getSummary() {
        return {
            status: this.getOverallStatus(),
            totalChecks: this.validatorResults?.summary?.totalChecks || 0,
            passed: this.validatorResults?.summary?.passed || 0,
            failed: this.validatorResults?.summary?.failed || 0,
            warnings: this.validatorResults?.summary?.warnings || 0,
            issueCount: (this.validatorResults?.getAllIssues?.()?.length || 0) +
                       (this.apiResults?.critical_issues?.length || 0)
        };
    }
}

// Global function for copy button
function copyFeedback(btn) {
    const feedbackContent = btn.parentElement.querySelector('.feedback-content pre');
    if (feedbackContent) {
        navigator.clipboard.writeText(feedbackContent.textContent).then(() => {
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = originalText, 2000);
        });
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ReportGenerator = ReportGenerator;
    window.copyFeedback = copyFeedback;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReportGenerator;
}
