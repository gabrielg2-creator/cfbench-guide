/**
 * CFBench Validators
 * Deterministic validation checks for CFBench notebooks
 */

class Validators {
    constructor(parsed, apiHandler = null) {
        this.parsed = parsed;
        this.apiHandler = apiHandler;
        this.results = {
            phase1: [], // Structure checks
            phase2: [], // Content checks
            phase3: [], // Metadata checks
            phase4: [], // Model passes checks
            summary: {
                totalChecks: 0,
                passed: 0,
                failed: 0,
                warnings: 0,
                needsReview: 0
            }
        };
    }

    /**
     * Set API handler for AI-powered verification
     */
    setApiHandler(apiHandler) {
        this.apiHandler = apiHandler;
    }

    /**
     * Check if API handler is available
     */
    hasApiHandler() {
        return this.apiHandler && this.apiHandler.hasApiKey && this.apiHandler.hasApiKey();
    }

    /**
     * Dictionary of REAL constraint definitions for semantic validation.
     * Used to detect when user request CONTRADICTS what the constraint actually requires.
     */
    static constraintDefinitions = {
        'punctuation:end_rule': {
            realMeaning: 'Sentences must end with standard punctuation marks',
            allowedValues: ['.', '?', '!', '?!', '??', '!?', '!!'],
            contradictionPatterns: [
                /non\s+usar[ei]?\s+(punti|punteggiatura|punto)/i,
                /senza\s+(punti|punteggiatura)/i,
                /evita(re)?\s+(punti|punteggiatura)/i,
                /no\s+(periods?|punctuation)/i,
                /don'?t\s+use\s+(periods?|punctuation)/i,
                /usa(re)?\s+(solo|only)\s+(@|simbolo|symbol)/i,
                /non\s+(terminare|finire).*con\s+(punti|punteggiatura)/i,
                /elimina(re)?\s+(punti|punteggiatura)/i,
                /niente\s+(punti|punteggiatura)/i
            ],
            description: 'Each sentence must end with allowed punctuation marks: . ? ! ?! ?? !? !!'
        },
        // NOTE: detectable_format:title detection is handled by AI analysis
        // (no contradiction patterns needed - AI finds where title is requested)
        'detectable_format:number_bullet_lists': {
            realMeaning: 'Response must use numbered or bullet lists',
            contradictionPatterns: [
                /senza\s+(elenco|lista|punti|elenchi|liste)/i,
                /no\s+(lists?|bullets?|numbered)/i,
                /evita(re)?\s+(elenchi|liste|bullet)/i,
                /non\s+usar[ei]?\s+(elenchi|liste|bullet)/i
            ],
            description: 'Must use numbered (1. 2. 3.) or bullet (* - ) lists'
        },
        'detectable_format:json_format': {
            realMeaning: 'Response must be in valid JSON format',
            contradictionPatterns: [
                /non\s+usar[ei]?\s+json/i,
                /senza\s+json/i,
                /no\s+json/i,
                /avoid\s+json/i
            ],
            description: 'Response must be formatted as valid JSON'
        }
    };

    /**
     * Check if user request CONTRADICTS the constraint definition.
     * Returns mismatch info if user asked for the OPPOSITE of what constraint requires.
     * @param {string} constraintId - The constraint ID (e.g., 'punctuation:end_rule')
     * @param {string} userQuery - The user query text
     * @returns {object} - { hasMismatch: boolean, matchedText?, realMeaning?, description?, message? }
     */
    checkSemanticMismatch(constraintId, userQuery) {
        const def = Validators.constraintDefinitions[constraintId];
        if (!def || !def.contradictionPatterns) return { hasMismatch: false };

        for (const pattern of def.contradictionPatterns) {
            const match = userQuery.match(pattern);
            if (match) {
                return {
                    hasMismatch: true,
                    matchedText: match[0],
                    realMeaning: def.realMeaning,
                    description: def.description,
                    message: `SEMANTIC MISMATCH: User requested "${match[0]}" but constraint requires: ${def.description}`
                };
            }
        }
        return { hasMismatch: false };
    }

    /**
     * Run all deterministic validation checks
     */
    runAll() {
        this.runPhase1Checks();
        this.runPhase2Checks();
        this.runPhase3Checks();
        this.runPhase4Checks();
        this.calculateSummary();
        return this.results;
    }

    /**
     * Phase 1: Structure Checks
     */
    runPhase1Checks() {
        // Check 1.1: Cell names & order
        this.check1_1_CellStructure();

        // Check 1.2: Language consistency
        this.check1_2_LanguageConsistency();

        // Check 1.3: Thinking cells present
        this.check1_3_ThinkingCells();

        // Check 1.4: Model passes structure
        this.check1_4_ModelPassesStructure();

        // Check 1.5: Golden response sanity (not a copy of user query)
        this.check1_5_GoldenResponseSanity();
    }

    /**
     * Check 1.1: Cell names and order verification
     */
    check1_1_CellStructure() {
        const issues = [];
        const p = this.parsed;

        // Check metadata exists
        if (!p.metadata) {
            issues.push('Missing metadata cell');
        }

        // Check system exists
        if (!p.system) {
            issues.push('Missing system prompt cell');
        }

        // Check turns exist
        if (p.turns.length === 0) {
            issues.push('No intermediate turns found');
        }

        // Check final turn components
        if (!p.finalTurn.user) {
            issues.push('Missing final turn user query');
        }
        if (!p.finalTurn.turnMetadata) {
            issues.push('Missing turn_metadata');
        }
        if (!p.finalTurn.assistant) {
            issues.push('Missing golden assistant response');
        }
        if (!p.finalTurn.validatorAssistant) {
            issues.push('Missing validator_assistant for golden response');
        }
        if (!p.finalTurn.validatorHuman) {
            issues.push('Missing validator_human for golden response');
        }

        this.results.phase1.push({
            id: '1.1',
            name: 'Cell Structure',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            details: {
                hasMeta: !!p.metadata,
                hasSystem: !!p.system,
                turnCount: p.turns.length,
                hasFinalTurn: !!p.finalTurn.user,
                hasTurnMetadata: !!p.finalTurn.turnMetadata,
                hasGoldenResponse: !!p.finalTurn.assistant
            }
        });
    }

    /**
     * Check 1.2: Language consistency across cells
     */
    check1_2_LanguageConsistency() {
        const issues = [];
        const p = this.parsed;
        const expectedLang = p.finalTurn.turnMetadata?.language || p.metadata?.language?.toLowerCase().substring(0, 2);

        if (!expectedLang) {
            issues.push('Could not determine expected language');
        }

        // Check language field exists
        const langInMeta = p.metadata?.language;
        const langInTurnMeta = p.finalTurn.turnMetadata?.language;

        if (langInMeta && langInTurnMeta) {
            const metaLangCode = langInMeta.match(/\((\w+)\)/)?.[1] || langInMeta.substring(0, 2).toLowerCase();
            if (metaLangCode !== langInTurnMeta) {
                issues.push(`Language mismatch: metadata says "${langInMeta}" but turn_metadata says "${langInTurnMeta}"`);
            }
        }

        this.results.phase1.push({
            id: '1.2',
            name: 'Language Consistency',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            details: {
                metadataLanguage: langInMeta,
                turnMetadataLanguage: langInTurnMeta
            }
        });
    }

    /**
     * Check 1.3: Thinking cells present in all turns
     */
    check1_3_ThinkingCells() {
        const issues = [];
        const p = this.parsed;

        // Check intermediate turns
        p.turns.forEach((turn, index) => {
            if (!turn.thinking) {
                issues.push(`Turn ${index + 1}: Missing thinking cell`);
            }
        });

        // Check final turn
        if (!p.finalTurn.thinking) {
            issues.push('Final turn (golden): Missing thinking cell');
        }

        // Check model passes
        p.modelPasses.forEach((pass) => {
            if (!pass.thinking) {
                issues.push(`Model pass ${pass.model}_${pass.passNumber}: Missing thinking cell`);
            }
        });

        this.results.phase1.push({
            id: '1.3',
            name: 'Thinking Cells',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            details: {
                intermediateTurnsWithThinking: p.turns.filter(t => t.thinking).length,
                totalIntermediateTurns: p.turns.length,
                goldenHasThinking: !!p.finalTurn.thinking,
                modelPassesWithThinking: p.modelPasses.filter(m => m.thinking).length,
                totalModelPasses: p.modelPasses.length
            }
        });
    }

    /**
     * Check 1.4: Model passes structure (4 passes required)
     */
    check1_4_ModelPassesStructure() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        // Check count
        if (p.modelPasses.length < 4) {
            issues.push(`Only ${p.modelPasses.length} model passes found (4 required)`);
        } else if (p.modelPasses.length > 4) {
            warnings.push(`Found ${p.modelPasses.length} model passes (expected 4)`);
        }

        // Check each pass has all components
        p.modelPasses.forEach((pass) => {
            const passId = `${pass.model}_${pass.passNumber}`;
            if (!pass.thinking) issues.push(`${passId}: Missing thinking`);
            if (!pass.assistant) issues.push(`${passId}: Missing assistant`);
            if (!pass.validatorAssistant) issues.push(`${passId}: Missing validator_assistant`);
            if (!pass.validatorHuman) issues.push(`${passId}: Missing validator_human`);
        });

        // Check model distribution (60:40 qwen:nemotron)
        const modelCounts = {};
        p.modelPasses.forEach(pass => {
            modelCounts[pass.model] = (modelCounts[pass.model] || 0) + 1;
        });

        this.results.phase1.push({
            id: '1.4',
            name: 'Model Passes Structure',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                totalPasses: p.modelPasses.length,
                modelDistribution: modelCounts,
                passes: p.modelPasses.map(p => ({
                    id: `${p.model}_${p.passNumber}`,
                    hasThinking: !!p.thinking,
                    hasAssistant: !!p.assistant,
                    hasValidatorAssistant: !!p.validatorAssistant,
                    hasValidatorHuman: !!p.validatorHuman
                }))
            }
        });
    }

    /**
     * Check 1.5: Golden Response Sanity Check (CRITICAL)
     * Detects if golden [assistant] is a copy of user query
     */
    check1_5_GoldenResponseSanity() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        const userQuery = p.finalTurn?.user?.content || '';
        const goldenResponse = p.finalTurn?.assistant?.content || '';

        if (!goldenResponse) {
            issues.push('Golden assistant response is empty or missing');
            this.results.phase1.push({
                id: '1.5',
                name: 'Golden Response Sanity',
                status: 'failed',
                issues: issues
            });
            return;
        }

        // Check 1: Response too short (likely not a real response)
        if (goldenResponse.length < 200) {
            warnings.push(`Golden response is very short (${goldenResponse.length} chars) - verify it's a complete response`);
        }

        // Check 2: Response is identical to user query
        if (goldenResponse.trim() === userQuery.trim()) {
            issues.push('CRITICAL: Golden response is IDENTICAL to user query! The assistant cell contains the user query instead of an actual response.');
        } else {
            // Check similarity using Jaccard-like comparison
            const similarity = this.calculateTextSimilarity(userQuery, goldenResponse);
            if (similarity > 0.85) {
                issues.push(`Golden response is ${Math.round(similarity * 100)}% similar to user query - likely copied by mistake`);
            } else if (similarity > 0.6) {
                warnings.push(`Golden response has ${Math.round(similarity * 100)}% similarity to user query - please verify`);
            }
        }

        // Check 3: Response starts the same as query (first 50+ chars)
        const minLen = Math.min(userQuery.length, goldenResponse.length, 80);
        if (minLen > 50 && goldenResponse.substring(0, minLen) === userQuery.substring(0, minLen)) {
            issues.push('Golden response starts identically to user query (first 80 chars match) - likely wrong content');
        }

        // Check 4: Response looks like a request rather than a response
        const requestPatterns = [
            /^(rivedi|analizza|scrivi|crea|genera|fammi|potresti|vorrei)/i,
            /^(review|analyze|write|create|generate|please|could you|i want)/i
        ];
        const looksLikeRequest = requestPatterns.some(p => p.test(goldenResponse.trim()));
        if (looksLikeRequest && goldenResponse.length < 500) {
            warnings.push('Golden response starts like a request/command - verify this is an actual response');
        }

        this.results.phase1.push({
            id: '1.5',
            name: 'Golden Response Sanity',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                goldenLength: goldenResponse.length,
                queryLength: userQuery.length,
                startsLikeQuery: goldenResponse.substring(0, 50) === userQuery.substring(0, 50),
                similarity: this.calculateTextSimilarity(userQuery, goldenResponse)
            }
        });
    }

    /**
     * Calculate text similarity (simple word overlap)
     */
    calculateTextSimilarity(text1, text2) {
        if (!text1 || !text2) return 0;

        const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));

        if (words1.size === 0 || words2.size === 0) return 0;

        const intersection = [...words1].filter(w => words2.has(w)).length;
        const union = new Set([...words1, ...words2]).size;

        return intersection / union;
    }

    /**
     * Phase 2: Content Checks
     */
    runPhase2Checks() {
        // Check 2.1: System prompt structure
        this.check2_1_SystemPrompt();

        // Check 2.2: System prompt issues (model reasoning detection)
        this.check2_2_SystemPromptIssues();

        // Check 2.3: Value consistency (deterministic part)
        this.check2_3_ValueConsistency();

        // Check 2.4: Prompt length validation (10% tolerance)
        this.check2_4_PromptLengthValidation();

        // Check 2.5: Query completeness (detect cut-off)
        this.check2_5_QueryCompleteness();

        // Check 2.6: Intermediate turns analysis
        this.check2_6_IntermediateTurns();

        // Check 2.7: Source "system" constraints in system prompt
        this.check2_7_SystemSourceConstraints();

        // Check 2.8: Forbidden terms in system prompt
        this.check2_8_ForbiddenTerms();

        // Check 2.9: Golden response formatting
        this.check2_9_GoldenFormatting();
    }

    /**
     * Check 2.1: System prompt structure
     */
    check2_1_SystemPrompt() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        if (!p.system) {
            issues.push('System prompt not found');
            this.results.phase2.push({
                id: '2.1',
                name: 'System Prompt',
                status: 'failed',
                issues: issues
            });
            return;
        }

        const sys = p.system;

        // Check word count range
        const expectedRange = p.metadata?.systemPromptLength;
        if (expectedRange) {
            const rangeMatch = expectedRange.match(/(\d+)\s*-\s*(\d+)/);
            if (rangeMatch) {
                const min = parseInt(rangeMatch[1]);
                const max = parseInt(rangeMatch[2]);
                if (sys.wordCount < min || sys.wordCount > max) {
                    issues.push(`System prompt word count (${sys.wordCount}) outside expected range (${min}-${max})`);
                }
            }
        }

        // Check for key components
        if (!sys.hasRole) {
            warnings.push('System prompt may be missing role definition');
        }
        if (!sys.hasFormat) {
            warnings.push('System prompt may be missing output format specification');
        }

        // CRITICAL: System prompt MUST have at least 1 LLM Eval constraint (tone, style, behavior)
        const content = sys.content || '';
        const llmEvalPatterns = [
            /tone|tono|stile|style/i,
            /formal|informal|professionale|professional/i,
            /friendly|amichevole|cordiale|warm/i,
            /concise|conciso|brief|breve/i,
            /detailed|dettagliato|thorough/i,
            /empathetic|empatico|understanding/i,
            /assertive|assertivo|confident/i,
            /neutral|neutrale|objective/i,
            /enthusiastic|entusiasta|energetic/i,
            /manner|modo|approach|approccio/i,
            /communicate|comunica|respond|rispondi/i
        ];
        const hasLLMEvalConstraint = llmEvalPatterns.some(p => p.test(content));

        if (!hasLLMEvalConstraint) {
            issues.push('CRITICAL: System prompt MUST contain at least 1 LLM Eval constraint (tone, style, or behavior guidance)');
        }

        this.results.phase2.push({
            id: '2.1',
            name: 'System Prompt',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                wordCount: sys.wordCount,
                hasRole: sys.hasRole,
                hasLLMEvalConstraint: hasLLMEvalConstraint,
                hasFormat: sys.hasFormat
            }
        });
    }

    /**
     * Check 2.2: System Prompt Issues (Model Reasoning Detection)
     * Detects if system prompt contains model acknowledgments/reasoning
     */
    check2_2_SystemPromptIssues() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        if (!p.system?.content) {
            this.results.phase2.push({
                id: '2.2',
                name: 'System Prompt Issues',
                status: 'skipped',
                issues: ['No system prompt content']
            });
            return;
        }

        const content = p.system.content;
        const contentLower = content.toLowerCase();

        // Detect model reasoning/acknowledgment patterns (multilingual)
        const reasoningPatterns = [
            { pattern: /^(perfetto|perfect|perfeito|perfekt)/i, msg: 'Starts with model acknowledgment "Perfetto/Perfect"' },
            { pattern: /^(grazie|thank|obrigado|danke)/i, msg: 'Starts with model acknowledgment "Grazie/Thanks"' },
            { pattern: /^(okay|ok|va bene|certo)/i, msg: 'Starts with model acknowledgment "Okay/Certo"' },
            { pattern: /^(capisco|i understand|entendo|verstehe)/i, msg: 'Starts with model acknowledgment "Capisco/I understand"' },
            { pattern: /condivisione del metadata/i, msg: 'Contains model meta-reference "condivisione del metadata"' },
            { pattern: /ecco (il|le|la) (system prompt|istruzioni)/i, msg: 'Contains model meta-reference about instructions' }
        ];

        reasoningPatterns.forEach(({ pattern, msg }) => {
            if (pattern.test(content.trim())) {
                issues.push(msg + ' - System prompt should contain ONLY instructions, not model reasoning');
            }
        });

        // Check if starts with instruction-like content
        const instructionStarters = /^(you are|sei|tu sei|act as|agisci come|your role|il tuo ruolo)/i;
        const hasProperStart = instructionStarters.test(content.trim());

        if (!hasProperStart && issues.length === 0) {
            warnings.push('System prompt may not start with clear role/instruction definition');
        }

        this.results.phase2.push({
            id: '2.2',
            name: 'System Prompt Issues',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                firstChars: content.substring(0, 100) + '...',
                hasProperStart: hasProperStart
            }
        });
    }

    /**
     * Check 2.3: Value consistency between query and metadata
     * IMPROVED: Detailed per-instruction verification with evidence
     */
    check2_3_ValueConsistency() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        if (!p.finalTurn.user || !p.finalTurn.turnMetadata) {
            issues.push('Cannot check value consistency - missing user query or turn_metadata');
            this.results.phase2.push({
                id: '2.3',
                name: 'Value Consistency',
                status: 'failed',
                issues: issues,
                details: {
                    hasFinalUser: !!p.finalTurn.user,
                    hasTurnMetadata: !!p.finalTurn.turnMetadata,
                    finalUserLength: p.finalTurn.user?.content?.length || 0
                }
            });
            return;
        }

        const query = p.finalTurn.user.content;
        const queryLower = query.toLowerCase();
        const allInstructions = p.finalTurn.turnMetadata.instructions || [];

        // IMPORTANT: Only check constraints with source: "user"
        // Constraints with source: "system" should be in system prompt, not user query
        const instructions = allInstructions.filter(inst => inst.source === 'user');
        const systemInstructions = allInstructions.filter(inst => inst.source === 'system' || inst.source === 'system_prompt');

        const verificationResults = [];

        // Log for debugging
        console.log('Check 2.3 - Final User Query Length:', query.length);
        console.log('Check 2.3 - Total Instructions:', allInstructions.length);
        console.log('Check 2.3 - User Source Instructions:', instructions.length);
        console.log('Check 2.3 - System Source Instructions:', systemInstructions.length);

        // Helper: find evidence in query for a value/concept
        // Returns the EXACT quote from the user query where the constraint appears
        const findEvidence = (patterns, value = null) => {
            for (const pattern of patterns) {
                const regex = new RegExp(pattern, 'gi');
                const match = query.match(regex);
                if (match) {
                    // Find surrounding context (up to 60 chars before/after for better quote)
                    const idx = query.indexOf(match[0]) !== -1 ? query.indexOf(match[0]) : query.toLowerCase().indexOf(match[0].toLowerCase());
                    const start = Math.max(0, idx - 60);
                    const end = Math.min(query.length, idx + match[0].length + 60);

                    // Find sentence boundaries for cleaner quote
                    let quoteStart = start;
                    let quoteEnd = end;

                    // Try to start at beginning of sentence
                    const beforeText = query.substring(Math.max(0, idx - 150), idx);
                    const sentenceStart = Math.max(beforeText.lastIndexOf('. '), beforeText.lastIndexOf('! '), beforeText.lastIndexOf('? '));
                    if (sentenceStart !== -1) {
                        quoteStart = idx - (beforeText.length - sentenceStart - 2);
                    }

                    // Try to end at end of sentence
                    const afterText = query.substring(idx + match[0].length, Math.min(query.length, idx + match[0].length + 150));
                    const sentenceEnd = Math.min(
                        afterText.indexOf('. ') !== -1 ? afterText.indexOf('. ') : 999,
                        afterText.indexOf('! ') !== -1 ? afterText.indexOf('! ') : 999,
                        afterText.indexOf('? ') !== -1 ? afterText.indexOf('? ') : 999
                    );
                    if (sentenceEnd !== 999) {
                        quoteEnd = idx + match[0].length + sentenceEnd + 1;
                    }

                    const exactQuote = query.substring(quoteStart, quoteEnd).trim();
                    const shortContext = (start > 0 ? '...' : '') + query.substring(start, end) + (end < query.length ? '...' : '');

                    return {
                        found: true,
                        evidence: shortContext,
                        exact_quote: `"${exactQuote}"`,
                        match: match[0]
                    };
                }
            }
            return { found: false, evidence: 'Not found in user query', exact_quote: null, match: null };
        };

        instructions.forEach(inst => {
            const id = inst.instruction_id || '';

            // Build human-readable constraint description
            let constraintDesc = id;
            if (inst.num_words) constraintDesc = `Word Count (${inst.relation || '='} ${inst.num_words})`;
            else if (inst.num_unique) constraintDesc = `Unique Words (${inst.relation || '='} ${inst.num_unique})`;
            else if (inst.num_chars) constraintDesc = `Character Count (${inst.relation || '='} ${inst.num_chars})`;
            else if (inst.num_sentences) constraintDesc = `Sentence Count (${inst.relation || 'at least'} ${inst.num_sentences})`;
            else if (inst.num_paragraphs) constraintDesc = `Paragraph Count (${inst.relation || '='} ${inst.num_paragraphs})`;
            else if (inst.keyword && inst.frequency) constraintDesc = `Keyword Frequency ("${inst.keyword}" x${inst.frequency})`;
            else if (inst.keywords) constraintDesc = `Keywords Existence (${inst.keywords.join(', ')})`;
            else if (inst.first_word) constraintDesc = `First Word ("${inst.first_word}")`;
            else if (inst.last_word) constraintDesc = `Last Word ("${inst.last_word}")`;
            else if (inst.mood_type) constraintDesc = `Grammatical Mood (${inst.mood_type})`;
            else if (inst.tone_level) constraintDesc = `Tone/Formality (${inst.tone_level})`;

            const result = {
                instruction_id: id,
                constraint_description: constraintDesc,
                found: false,
                evidence: null,
                exact_quote: null,
                details: {},
                method: 'regex' // 'regex' or 'AI'
            };

            // Check number_words - multilingual patterns
            if (id.includes('number_words') && inst.num_words) {
                const patterns = [
                    `\\b${inst.num_words}\\s*(parole|words|palavras|wörter|mots)\\b`,
                    `\\b(parole|words)\\s*[:=]?\\s*${inst.num_words}\\b`,
                    `\\b${inst.num_words}\\b.*\\b(parole|words)`,
                    `\\b(esattamente|exactly|precisamente)\\s+${inst.num_words}\\b`
                ];
                const check = findEvidence(patterns);
                result.found = check.found;
                result.evidence = check.evidence;
                result.exact_quote = check.exact_quote;
                result.details = { expected: inst.num_words, type: 'word_count' };

                if (!check.found) {
                    // Also check if just the number appears
                    const numCheck = findEvidence([`\\b${inst.num_words}\\b`]);
                    if (numCheck.found) {
                        result.found = true;
                        result.evidence = numCheck.evidence;
                        result.exact_quote = numCheck.exact_quote;
                        result.details.note = 'Number found, word association implicit';
                    }
                }
            }

            // Check unique_words
            else if (id.includes('unique_words') && inst.num_unique) {
                const patterns = [
                    `\\b${inst.num_unique}\\b.*\\b(parole uniche|unique words|palavras únicas)`,
                    `\\b(parole uniche|unique words).*\\b${inst.num_unique}\\b`,
                    `\\b(inferiore a|less than|menor que|unter)\\s*${inst.num_unique + 10}\\b.*\\b(parole|words)`,
                    `\\b${inst.num_unique}\\b`
                ];
                const check = findEvidence(patterns);
                result.found = check.found;
                result.evidence = check.evidence;
                result.exact_quote = check.exact_quote;
                result.details = { expected: inst.num_unique, type: 'unique_words' };
            }

            // Check num_chars - multilingual patterns
            else if (id.includes('num_chars') && inst.num_chars) {
                const patterns = [
                    `\\b${inst.num_chars}\\s*(caratteri|characters|caracteres|zeichen)\\b`,
                    `\\b(caratteri|characters)\\s*[:=]?\\s*${inst.num_chars}\\b`,
                    `\\b${inst.num_chars}\\b.*\\b(caratteri|characters)`
                ];
                const check = findEvidence(patterns);
                result.found = check.found;
                result.evidence = check.evidence;
                result.exact_quote = check.exact_quote;
                result.details = { expected: inst.num_chars, type: 'char_count' };

                if (!check.found) {
                    const numCheck = findEvidence([`\\b${inst.num_chars}\\b`]);
                    if (numCheck.found) {
                        result.found = true;
                        result.evidence = numCheck.evidence;
                        result.exact_quote = numCheck.exact_quote;
                        result.details.note = 'Number found, char association may be implicit';
                    }
                }
            }

            // Check sentence_count
            else if (id.includes('sentence_count') && inst.num_sentences) {
                const patterns = [
                    `\\b${inst.num_sentences}\\s*(frasi|sentences|oraciones|sätze)\\b`,
                    `\\b(frasi|sentences)\\s*[:=]?\\s*${inst.num_sentences}\\b`,
                    `\\b(almeno|at least|minimo)\\s*${inst.num_sentences}\\s*(frasi|sentences)`
                ];
                const check = findEvidence(patterns);
                result.found = check.found;
                result.evidence = check.evidence;
                result.exact_quote = check.exact_quote;
                result.details = { expected: inst.num_sentences, type: 'sentence_count' };
            }

            // Check paragraph_count
            else if (id.includes('paragraph') && inst.num_paragraphs) {
                const patterns = [
                    `\\b${inst.num_paragraphs}\\s*(paragrafi|paragraphs|párrafos|absätze|sezioni)\\b`,
                    `\\b(paragrafi|paragraphs|sezioni)\\s*[:=]?\\s*${inst.num_paragraphs}\\b`,
                    `\\btre\\s*(sezioni|paragrafi)\\b`,
                    `\\b(three|drei)\\s*(sections|paragraphs)\\b`
                ];
                const check = findEvidence(patterns);
                result.found = check.found;
                result.evidence = check.evidence;
                result.exact_quote = check.exact_quote;
                result.details = { expected: inst.num_paragraphs, type: 'paragraph_count' };
            }

            // Check keyword_frequency
            else if (id.includes('frequency') && inst.keyword) {
                // First check if keyword appears in the query
                const keywordPatterns = [
                    `\\b${this.escapeRegex(inst.keyword.trim())}\\b`,
                    `"${this.escapeRegex(inst.keyword.trim())}"`,
                    `'${this.escapeRegex(inst.keyword.trim())}'`
                ];
                const keywordCheck = findEvidence(keywordPatterns);

                // Then check if frequency is mentioned
                const freqPatterns = [
                    `\\b${inst.frequency}\\s*(volte|times|veces|mal)\\b`,
                    `\\b(ripetere|repeat|usa|utilizza).*${inst.frequency}`,
                    `\\b${inst.frequency}\\b.*\\b(volte|times)`
                ];
                const freqCheck = findEvidence(freqPatterns);

                result.found = keywordCheck.found && freqCheck.found;
                result.exact_quote = keywordCheck.exact_quote || freqCheck.exact_quote;
                result.evidence = keywordCheck.found ? keywordCheck.evidence : 'Keyword not found in query';
                result.details = {
                    keyword: inst.keyword,
                    frequency: inst.frequency,
                    type: 'keyword_frequency',
                    keywordFound: keywordCheck.found,
                    frequencyFound: freqCheck.found,
                    frequencyEvidence: freqCheck.exact_quote
                };

                if (!result.found) {
                    result.evidence = `Keyword "${inst.keyword}" ${keywordCheck.found ? 'found' : 'NOT found'}, frequency ${inst.frequency}x ${freqCheck.found ? 'found' : 'NOT found'}`;
                }
            }

            // Check keywords:existence
            else if (id.includes('existence') && inst.keywords) {
                const foundKeywords = [];
                const missingKeywords = [];

                for (const kw of inst.keywords) {
                    const kwCheck = findEvidence([`\\b${this.escapeRegex(kw)}\\b`]);
                    if (kwCheck.found) {
                        foundKeywords.push(kw);
                    } else {
                        missingKeywords.push(kw);
                    }
                }

                result.found = missingKeywords.length === 0;
                result.exact_quote = `Found: ${foundKeywords.join(', ')}${missingKeywords.length > 0 ? ` | Missing: ${missingKeywords.join(', ')}` : ''}`;
                result.evidence = result.exact_quote;
                result.details = {
                    keywords: inst.keywords,
                    found: foundKeywords,
                    missing: missingKeywords,
                    type: 'keywords_existence'
                };
            }

            // Check word_length constraints
            else if (id.includes('word_length')) {
                const patterns = [];
                if (inst.max_length) {
                    patterns.push(
                        `\\b(massimo|max|maximum|no più di|at most)\\s*${inst.max_length}\\s*(caratteri|characters|lettere)`,
                        `\\b${inst.max_length}\\s*(caratteri|characters)\\s*(massimo|max)?`,
                        `\\b(parole|words).*\\b${inst.max_length}\\s*(caratteri|characters)`
                    );
                }
                if (inst.min_length) {
                    patterns.push(
                        `\\b(minimo|min|minimum|almeno|at least)\\s*${inst.min_length}\\s*(caratteri|characters)`,
                        `\\b${inst.min_length}\\s*(caratteri|characters)\\s*(minimo|min)?`
                    );
                }

                if (patterns.length > 0) {
                    const check = findEvidence(patterns);
                    result.found = check.found;
                    result.evidence = check.evidence;
                    result.exact_quote = check.exact_quote;
                    result.details = { min: inst.min_length, max: inst.max_length, type: 'word_length' };
                } else {
                    result.found = true;
                    result.exact_quote = 'No specific length values to check';
                    result.details = { type: 'word_length', note: 'No specific length values in instruction' };
                }
            }

            // Check first_word / last_word constraints
            else if (id.includes('first_word') && inst.first_word) {
                const patterns = [
                    `\\b(inizia|start|begin|comincia).*\\b${this.escapeRegex(inst.first_word)}\\b`,
                    `\\b(prima parola|first word).*${this.escapeRegex(inst.first_word)}\\b`,
                    `"${this.escapeRegex(inst.first_word)}".*\\b(prima|first|iniziale)`,
                    `\\b${this.escapeRegex(inst.first_word)}\\b`
                ];
                const check = findEvidence(patterns);
                result.found = check.found;
                result.evidence = check.evidence;
                result.exact_quote = check.exact_quote;
                result.details = { first_word: inst.first_word, type: 'first_word' };
            }

            else if (id.includes('last_word') && inst.last_word) {
                const patterns = [
                    `\\b(finisci|end|termina|concludi).*\\b${this.escapeRegex(inst.last_word)}\\b`,
                    `\\b(ultima parola|last word).*${this.escapeRegex(inst.last_word)}\\b`,
                    `"${this.escapeRegex(inst.last_word)}".*\\b(ultima|last|finale)`,
                    `\\b${this.escapeRegex(inst.last_word)}\\b`
                ];
                const check = findEvidence(patterns);
                result.found = check.found;
                result.evidence = check.evidence;
                result.exact_quote = check.exact_quote;
                result.details = { last_word: inst.last_word, type: 'last_word' };
            }

            // Check grammatical_mood
            else if (id.includes('grammatical_mood') && inst.mood_type) {
                const moodPatterns = {
                    'indicative': ['indicativo', 'indicative', 'dichiarativo', 'declarative'],
                    'imperative': ['imperativo', 'imperative'],
                    'subjunctive': ['congiuntivo', 'subjunctive'],
                    'conditional': ['condizionale', 'conditional']
                };
                const moodTerms = moodPatterns[inst.mood_type.toLowerCase()] || [inst.mood_type];
                const patterns = moodTerms.flatMap(term => [
                    `\\b${term}\\b`,
                    `\\b(modo|tono).*${term}\\b`,
                    `\\b(utilizza|usa|use).*${term}\\b`
                ]);
                const check = findEvidence(patterns);
                result.found = check.found;
                result.evidence = check.evidence;
                result.exact_quote = check.exact_quote;
                result.details = { mood_type: inst.mood_type, type: 'grammatical_mood' };
                result.isLLMEval = true;
            }

            // Check stylistic/linguistic/situation (LLM Eval) - these need semantic check
            else if (id.startsWith('stylistic:') || id.startsWith('linguistic:') || id.startsWith('situation:')) {
                const parts = id.split(':');
                const category = parts[0];
                const subtype = parts[1];

                // Look for mentions of the style/tone
                let valueToFind = inst.value || inst.tone || inst.tone_level || inst.style || '';
                const patterns = [];

                if (valueToFind) {
                    patterns.push(
                        `\\b${this.escapeRegex(valueToFind)}\\b`,
                        `\\b(tono|tone|stile|style).*${this.escapeRegex(valueToFind)}\\b`
                    );
                }

                // Also check for common tone/formality terms
                if (subtype === 'tone_formality' || subtype === 'tone') {
                    patterns.push(
                        '\\b(neutro|neutral|formale|formal|informale|informal)\\b',
                        '\\b(professionale|professional|tecnico|technical)\\b'
                    );
                }

                const check = patterns.length > 0 ? findEvidence(patterns) : { found: false, evidence: 'No pattern to check', exact_quote: null };
                result.found = check.found;
                result.evidence = check.evidence;
                result.exact_quote = check.exact_quote;
                result.details = { category, subtype, value: valueToFind, type: 'llm_eval' };
                result.isLLMEval = true;
            }

            // Default: mark as not checked
            else {
                result.found = null; // null = not applicable / not checked
                result.exact_quote = 'Constraint type not handled by basic check';
                result.details = { type: 'unchecked', raw: inst };
            }

            verificationResults.push(result);
        });

        // Check for semantic mismatches - when user request CONTRADICTS constraint definition
        for (const result of verificationResults) {
            const mismatch = this.checkSemanticMismatch(result.instruction_id, query);
            if (mismatch && mismatch.hasMismatch) {
                result.semanticMismatch = true;
                result.mismatchMessage = mismatch.message;
                result.mismatchText = mismatch.matchedText;
                result.realDefinition = mismatch.description;
                result.status = 'mismatch';  // New status type for semantic contradictions
                result.found = false;  // Override found to false since user asked for opposite
                console.log(`SEMANTIC MISMATCH detected for ${result.instruction_id}: ${mismatch.matchedText}`);
            }
        }

        // Categorize results
        const verified = verificationResults.filter(r => r.found === true && !r.semanticMismatch);
        const mismatches = verificationResults.filter(r => r.semanticMismatch === true);
        const missing = verificationResults.filter(r => r.found === false && !r.isLLMEval && !r.semanticMismatch);
        const llmEvalMissing = verificationResults.filter(r => r.found === false && r.isLLMEval && !r.semanticMismatch);
        const unchecked = verificationResults.filter(r => r.found === null);

        // Mark items not found by regex as 'needs_review' instead of definitive fail
        // This is because regex can't handle numbers written in words
        // NOTE: Items with 'mismatch' status keep that status (don't override)
        missing.forEach(r => {
            if (!r.status) r.status = 'needs_review'; // Will show yellow in report
        });
        llmEvalMissing.forEach(r => {
            if (!r.status) r.status = 'needs_review';
        });

        // NOTE: This deterministic check cannot recognize numbers written in words
        // (e.g., "trecentottantacinque" = 385 in Italian)
        // Without API: show NEEDS_REVIEW (yellow) for uncertain items
        // With API: the enhanceCheck2_3WithAI method will update to definitive PASS/FAIL

        // Generate warnings for potentially missing constraints (not issues!)
        missing.forEach(r => {
            const detail = r.details;
            let warnMsg = `[${r.instruction_id}] `;
            if (detail.type === 'word_count') {
                warnMsg += `Word count "${detail.expected}" not found as numeric (may be written in words)`;
            } else if (detail.type === 'char_count') {
                warnMsg += `Character count "${detail.expected}" not found as numeric`;
            } else if (detail.type === 'keyword_frequency') {
                warnMsg += `Keyword "${detail.keyword}" check - verify manually`;
            } else if (detail.type === 'word_length') {
                warnMsg += `Word length constraint - verify manually`;
            } else if (detail.type === 'paragraph_count') {
                warnMsg += `Paragraph count "${detail.expected}" not found as numeric (may be written in words)`;
            } else if (detail.type === 'sentence_count') {
                warnMsg += `Sentence count "${detail.expected}" not found as numeric (may be written in words)`;
            } else {
                warnMsg += `Constraint not found by regex - use AI Analysis for accurate check`;
            }
            warnings.push(warnMsg);
        });

        // LLM Eval missing = warnings (may be implicit)
        llmEvalMissing.forEach(r => {
            warnings.push(`[${r.instruction_id}] LLM Eval - verify in AI Analysis`);
        });

        // Semantic mismatches = CRITICAL warnings (user asked for opposite of constraint)
        mismatches.forEach(r => {
            warnings.push(`⚠️ [${r.instruction_id}] SEMANTIC MISMATCH: User requested "${r.mismatchText}" but constraint requires: ${r.realDefinition}`);
        });

        // Status logic:
        // - 'passed' = all found by regex
        // - 'needs_review' = some not found by regex, needs AI or manual verification
        // - 'warning' = has other warnings or semantic mismatches
        const needsReviewCount = missing.length + llmEvalMissing.length;
        const mismatchCount = mismatches.length;
        let status = 'passed';
        if (mismatchCount > 0) {
            status = 'warning';  // Semantic mismatches are warnings (show orange)
        } else if (needsReviewCount > 0) {
            status = 'needs_review';
        } else if (warnings.length > 0) {
            status = 'warning';
        }

        this.results.phase2.push({
            id: '2.3',
            name: 'Value Consistency',
            status: status,
            issues: [], // No failures - AI does the real check
            warnings: warnings,
            details: {
                totalInstructions: allInstructions.length,
                userSourceCount: instructions.length,
                systemSourceCount: systemInstructions.length,
                verified: verified.length,
                potentiallyMissing: missing.length,
                semanticMismatches: mismatchCount,
                mismatchDetails: mismatches.map(m => ({
                    id: m.instruction_id,
                    userRequested: m.mismatchText,
                    constraintRequires: m.realDefinition,
                    message: m.mismatchMessage
                })),
                needsReview: needsReviewCount,
                llmEvalToVerify: llmEvalMissing.length,
                unchecked: unchecked.length,
                verificationResults: verificationResults,
                systemInstructions: systemInstructions.map(i => ({
                    id: i.instruction_id,
                    source: i.source,
                    note: 'Should be in system prompt, not user query'
                })),
                finalUserQueryLength: query.length,
                finalUserQueryPreview: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
                verificationMethod: 'regex',
                note: 'Regex-based check. Items marked NEEDS_REVIEW may have numbers written in words. Use "Full AI Analysis" for accurate verification.'
            }
        });
    }

    /**
     * Enhance Check 2.3 results with AI verification
     * Call this after runAll() when API is available
     * @param {object} apiHandler - The API handler instance
     * @returns {object} Enhanced check 2.3 results
     */
    async enhanceCheck2_3WithAI(apiHandler) {
        if (!apiHandler || !apiHandler.hasApiKey()) {
            console.warn('No API handler available for AI enhancement');
            return null;
        }

        // Find the check 2.3 result
        const check23 = this.results.phase2.find(c => c.id === '2.3');
        if (!check23 || !check23.details?.verificationResults) {
            console.warn('Check 2.3 results not found');
            return null;
        }

        const p = this.parsed;
        const query = p.finalTurn?.user?.content || '';
        const verificationResults = check23.details.verificationResults;

        // Get items that need AI verification (not found by regex or need review)
        const needsVerification = verificationResults.filter(r =>
            r.found === false || r.status === 'needs_review'
        );

        if (needsVerification.length === 0) {
            console.log('No items need AI verification');
            return check23;
        }

        console.log(`Enhancing ${needsVerification.length} items with AI verification...`);

        try {
            // Use batch verification for efficiency
            const originalInstructions = needsVerification.map(r => r.details?.raw || {
                instruction_id: r.instruction_id,
                ...r.details
            });

            const aiResults = await apiHandler.verifyConstraintsBatch(query, originalInstructions);

            // Merge AI results back into verification results
            aiResults.forEach(aiResult => {
                const existing = verificationResults.find(r =>
                    r.instruction_id === aiResult.instruction_id
                );
                if (existing) {
                    existing.found = aiResult.found;
                    existing.evidence = aiResult.evidence;
                    existing.exact_quote = aiResult.exact_quote;
                    existing.method = aiResult.method;
                    existing.confidence = aiResult.confidence;
                    // Remove needs_review status - now we have definitive answer
                    delete existing.status;
                }
            });

            // Recategorize and update check status
            const verified = verificationResults.filter(r => r.found === true);
            const failed = verificationResults.filter(r => r.found === false && r.method === 'AI');
            const needsReview = verificationResults.filter(r => r.found === false && r.method !== 'AI');

            // Update check 2.3 status
            if (failed.length > 0) {
                check23.status = 'failed';
                check23.issues = failed.map(r =>
                    `[${r.instruction_id}] ${r.constraint_description || 'Constraint'} NOT found in user query (AI verified)`
                );
            } else if (needsReview.length > 0) {
                check23.status = 'needs_review';
            } else {
                check23.status = 'passed';
            }

            // Update details
            check23.details.verified = verified.length;
            check23.details.failed = failed.length;
            check23.details.needsReview = needsReview.length;
            check23.details.verificationMethod = 'AI';
            check23.details.note = 'AI-verified constraints. Green = PASS, Red = FAIL (constraint missing from user query).';
            check23.name = 'Value Consistency (AI Verified)';

            // Clear warnings that were addressed by AI
            check23.warnings = check23.warnings.filter(w => {
                const match = w.match(/\[([^\]]+)\]/);
                if (match) {
                    const id = match[1];
                    const aiResult = verificationResults.find(r => r.instruction_id === id && r.method === 'AI');
                    return !aiResult; // Keep warning only if not AI-verified
                }
                return true;
            });

            // Recalculate summary
            this.calculateSummary();

            return check23;
        } catch (error) {
            console.error('AI enhancement failed:', error);
            return null;
        }
    }

    /**
     * Check 2.4: Prompt Length Validation (10% tolerance)
     * Verifies system/user prompt lengths match metadata ranges
     */
    check2_4_PromptLengthValidation() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;
        const TOLERANCE = 0.10; // 10% tolerance

        const lengthChecks = [];

        // Helper: count words in text
        const countWords = (text) => {
            if (!text) return 0;
            return text.trim().split(/\s+/).filter(w => w.length > 0).length;
        };

        // Helper: parse range string like "200-300" or "200 - 300"
        const parseRange = (rangeStr) => {
            if (!rangeStr) return null;
            const match = rangeStr.toString().match(/(\d+)\s*[-–—]\s*(\d+)/);
            if (match) {
                return { min: parseInt(match[1]), max: parseInt(match[2]) };
            }
            // Single number
            const single = rangeStr.toString().match(/^(\d+)$/);
            if (single) {
                const val = parseInt(single[1]);
                return { min: val, max: val };
            }
            return null;
        };

        // Helper: check if value is within range with tolerance
        const checkWithTolerance = (actual, range, label) => {
            if (!range) return null;

            const minWithTolerance = Math.floor(range.min * (1 - TOLERANCE));
            const maxWithTolerance = Math.ceil(range.max * (1 + TOLERANCE));

            const check = {
                label: label,
                actual: actual,
                expected: `${range.min}-${range.max}`,
                withTolerance: `${minWithTolerance}-${maxWithTolerance}`,
                withinRange: actual >= range.min && actual <= range.max,
                withinTolerance: actual >= minWithTolerance && actual <= maxWithTolerance
            };

            if (!check.withinTolerance) {
                check.status = 'failed';
                check.deviation = actual < minWithTolerance
                    ? `${Math.round((minWithTolerance - actual) / range.min * 100)}% below minimum`
                    : `${Math.round((actual - maxWithTolerance) / range.max * 100)}% above maximum`;
            } else if (!check.withinRange) {
                check.status = 'warning';
            } else {
                check.status = 'passed';
            }

            return check;
        };

        // 1. System Prompt Length Check
        const systemPromptLengthStr = p.metadata?.systemPromptLength || p.metadata?.['system_prompt_length'];
        if (systemPromptLengthStr && p.system) {
            const expectedRange = parseRange(systemPromptLengthStr);
            const actualWords = countWords(p.system.content);

            if (expectedRange) {
                const check = checkWithTolerance(actualWords, expectedRange, 'System Prompt');
                lengthChecks.push(check);

                if (check.status === 'failed') {
                    issues.push(`System prompt: ${actualWords} words (expected ${check.expected}, tolerance ${check.withTolerance}) - ${check.deviation}`);
                } else if (check.status === 'warning') {
                    warnings.push(`System prompt: ${actualWords} words is within 10% tolerance but outside exact range ${check.expected}`);
                }
            }
        }

        // 2. User Prompt Length Check (final user query)
        const userPromptLengthStr = p.metadata?.userPromptLength || p.metadata?.['user_prompt_length'];
        if (userPromptLengthStr && p.finalTurn?.user) {
            const expectedRange = parseRange(userPromptLengthStr);
            const actualWords = countWords(p.finalTurn.user.content);

            if (expectedRange) {
                const check = checkWithTolerance(actualWords, expectedRange, 'User Prompt (Final Turn)');
                lengthChecks.push(check);

                if (check.status === 'failed') {
                    issues.push(`User prompt: ${actualWords} words (expected ${check.expected}, tolerance ${check.withTolerance}) - ${check.deviation}`);
                } else if (check.status === 'warning') {
                    warnings.push(`User prompt: ${actualWords} words is within 10% tolerance but outside exact range ${check.expected}`);
                }
            }
        }

        // 3. Also check character counts if specified
        const systemCharLengthStr = p.metadata?.systemPromptChars || p.metadata?.['system_prompt_chars'];
        if (systemCharLengthStr && p.system) {
            const expectedRange = parseRange(systemCharLengthStr);
            const actualChars = (p.system.content || '').length;

            if (expectedRange) {
                const check = checkWithTolerance(actualChars, expectedRange, 'System Prompt (chars)');
                lengthChecks.push(check);

                if (check.status === 'failed') {
                    issues.push(`System prompt chars: ${actualChars} (expected ${check.expected}, tolerance ${check.withTolerance}) - ${check.deviation}`);
                }
            }
        }

        const userCharLengthStr = p.metadata?.userPromptChars || p.metadata?.['user_prompt_chars'];
        if (userCharLengthStr && p.finalTurn?.user) {
            const expectedRange = parseRange(userCharLengthStr);
            const actualChars = (p.finalTurn.user.content || '').length;

            if (expectedRange) {
                const check = checkWithTolerance(actualChars, expectedRange, 'User Prompt (chars)');
                lengthChecks.push(check);

                if (check.status === 'failed') {
                    issues.push(`User prompt chars: ${actualChars} (expected ${check.expected}, tolerance ${check.withTolerance}) - ${check.deviation}`);
                }
            }
        }

        // If no length metadata found, just report current lengths
        if (lengthChecks.length === 0) {
            const sysWords = p.system ? countWords(p.system.content) : 0;
            const userWords = p.finalTurn?.user ? countWords(p.finalTurn.user.content) : 0;

            this.results.phase2.push({
                id: '2.4',
                name: 'Prompt Length Validation',
                status: 'skipped',
                issues: [],
                warnings: ['No prompt length metadata found in notebook metadata cell'],
                details: {
                    note: 'No length ranges specified in metadata',
                    currentLengths: {
                        systemPromptWords: sysWords,
                        userPromptWords: userWords
                    }
                }
            });
            return;
        }

        this.results.phase2.push({
            id: '2.4',
            name: 'Prompt Length Validation',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                tolerance: '10%',
                checks: lengthChecks,
                summary: {
                    total: lengthChecks.length,
                    passed: lengthChecks.filter(c => c.status === 'passed').length,
                    warnings: lengthChecks.filter(c => c.status === 'warning').length,
                    failed: lengthChecks.filter(c => c.status === 'failed').length
                }
            }
        });
    }

    /**
     * Check 2.5: Query Completeness (detect cut-off)
     * Detects if the final user query is incomplete/cut-off
     */
    check2_5_QueryCompleteness() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        if (!p.finalTurn?.user?.content) {
            this.results.phase2.push({
                id: '2.5',
                name: 'Query Completeness',
                status: 'skipped',
                issues: ['No user query found']
            });
            return;
        }

        const query = p.finalTurn.user.content.trim();
        const lastChars = query.slice(-50);

        // Detect cut-off patterns
        const cutOffPatterns = [
            { pattern: /[a-zA-Zàèìòùáéíóú]{1,3}$/, check: () => !query.match(/[.!?:;]$/), msg: 'Query appears to end mid-word' },
            { pattern: /\.{3}$/, check: () => true, msg: 'Query ends with "..." - may be incomplete' },
            { pattern: /\s+(il|la|le|lo|un|una|the|a|an|o|os|as|um|uma)\s*$/i, check: () => true, msg: 'Query ends with article - sentence likely incomplete' },
            { pattern: /\s+(di|da|in|con|per|su|of|for|with|to|de|para|com|em)\s*$/i, check: () => true, msg: 'Query ends with preposition - sentence likely incomplete' }
        ];

        let isCutOff = false;
        cutOffPatterns.forEach(({ pattern, check, msg }) => {
            if (pattern.test(query) && check()) {
                issues.push(msg);
                isCutOff = true;
            }
        });

        // Check if ends with proper punctuation
        const endsWithPunctuation = /[.!?:;"'\)]$/.test(query);
        if (!endsWithPunctuation && !isCutOff) {
            warnings.push('Query does not end with standard punctuation - verify completeness');
        }

        this.results.phase2.push({
            id: '2.5',
            name: 'Query Completeness',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                lastChars: '...' + lastChars,
                endsWithPunctuation: endsWithPunctuation,
                queryLength: query.length
            }
        });
    }

    /**
     * Check 2.6: Intermediate Turns Analysis
     * Checks for issues with non-final turns
     */
    check2_6_IntermediateTurns() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        if (!p.turns || p.turns.length === 0) {
            this.results.phase2.push({
                id: '2.6',
                name: 'Intermediate Turns',
                status: 'skipped',
                issues: ['No intermediate turns found']
            });
            return;
        }

        const turnAnalysis = [];

        p.turns.forEach((turn, index) => {
            const turnNum = index + 1;
            const userContent = turn.user?.content || '';
            const wordCount = userContent.split(/\s+/).filter(w => w.length > 0).length;
            const analysis = {
                turn: turnNum,
                wordCount: wordCount,
                issues: []
            };

            // Check for excessively long intermediate turns
            if (wordCount > 200) {
                warnings.push(`Turn ${turnNum}: User message is very long (${wordCount} words). Intermediate turns should be concise.`);
                analysis.issues.push('too_long');
            }

            // Check for bullet-point lists (technical specification style)
            const hasBullets = /^[\s]*[•●○▪▸\-\*]\s+/m.test(userContent);
            const hasNumberedList = /^\s*\d+[.)]\s+/m.test(userContent);
            if (hasBullets || hasNumberedList) {
                warnings.push(`Turn ${turnNum}: Contains bullet/numbered list - intermediate turns should feel like natural conversation.`);
                analysis.issues.push('has_lists');
            }

            // Check for constraint stacking (1)... 2)... style)
            const hasConstraintStacking = /\d+\)\s*.{10,}/g.test(userContent);
            if (hasConstraintStacking) {
                warnings.push(`Turn ${turnNum}: Contains numbered constraints like "1)... 2)..." - integrate naturally.`);
                analysis.issues.push('constraint_stacking');
            }

            turnAnalysis.push(analysis);
        });

        // Check for duplicate/similar turns
        if (p.turns.length >= 2) {
            for (let i = 0; i < p.turns.length - 1; i++) {
                for (let j = i + 1; j < p.turns.length; j++) {
                    const t1 = p.turns[i].user?.content || '';
                    const t2 = p.turns[j].user?.content || '';
                    const similarity = this.calculateTextSimilarity(t1, t2);
                    if (similarity > 0.7) {
                        warnings.push(`Turns ${i + 1} and ${j + 1} are ${Math.round(similarity * 100)}% similar - consider making them more distinct.`);
                    }
                }
            }
        }

        this.results.phase2.push({
            id: '2.6',
            name: 'Intermediate Turns',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                totalTurns: p.turns.length,
                turnAnalysis: turnAnalysis
            }
        });
    }

    /**
     * Check 2.7: Verify constraints with source: "system" are in system prompt
     * These constraints should be defined in the system prompt, not just in turn_metadata
     */
    check2_7_SystemSourceConstraints() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        if (!p.system?.content || !p.finalTurn?.turnMetadata?.instructions) {
            this.results.phase2.push({
                id: '2.7',
                name: 'System Source Constraints',
                status: 'skipped',
                issues: ['Missing system prompt or turn_metadata']
            });
            return;
        }

        const systemContent = p.system.content.toLowerCase();
        const instructions = p.finalTurn.turnMetadata.instructions || [];

        // Filter constraints with source: "system"
        const systemSourceConstraints = instructions.filter(inst =>
            inst.source === 'system' || inst.source === 'system_prompt'
        );

        const verificationResults = [];

        systemSourceConstraints.forEach(inst => {
            const instId = inst.instruction_id || inst.id || 'unknown';
            const kwargs = inst.kwargs || {};

            // Try to find evidence of this constraint in system prompt
            let found = false;
            let evidence = '';

            // Check based on instruction type
            if (instId.includes('tone') || instId.includes('stylistic')) {
                // Look for tone/style keywords
                const tonePatterns = ['tone', 'tono', 'style', 'stile', 'manner', 'modo'];
                found = tonePatterns.some(p => systemContent.includes(p));
                if (found) evidence = 'Found tone/style reference in system prompt';
            } else if (instId.includes('format')) {
                const formatPatterns = ['format', 'formato', 'structure', 'struttura'];
                found = formatPatterns.some(p => systemContent.includes(p));
                if (found) evidence = 'Found format reference in system prompt';
            } else if (kwargs.keyword || kwargs.value) {
                // Check if specific keyword/value is mentioned
                const keyword = (kwargs.keyword || kwargs.value || '').toLowerCase();
                if (keyword && systemContent.includes(keyword)) {
                    found = true;
                    evidence = `Found "${keyword}" in system prompt`;
                }
            }

            verificationResults.push({
                instruction_id: instId,
                source: inst.source,
                found: found,
                evidence: evidence || 'Not found in system prompt'
            });

            if (!found) {
                warnings.push(`[${instId}] has source: "system" but couldn't verify it in system prompt`);
            }
        });

        const verified = verificationResults.filter(r => r.found).length;
        const notFound = verificationResults.filter(r => !r.found).length;

        this.results.phase2.push({
            id: '2.7',
            name: 'System Source Constraints',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                totalSystemSource: systemSourceConstraints.length,
                verified: verified,
                notFound: notFound,
                verificationResults: verificationResults
            }
        });
    }

    /**
     * Check 2.8: Forbidden terms in system prompt
     * System prompt should NOT contain metadata terms like L1, L2, taxonomy, CFBench, etc.
     */
    check2_8_ForbiddenTerms() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        if (!p.system?.content) {
            this.results.phase2.push({
                id: '2.8',
                name: 'Forbidden Terms',
                status: 'skipped',
                issues: ['No system prompt content']
            });
            return;
        }

        const content = p.system.content;
        const contentLower = content.toLowerCase();

        // Forbidden terms that should NOT appear in system prompt
        const forbiddenTerms = [
            { term: 'L1', pattern: /\bL1\b/i, msg: 'Contains "L1" (taxonomy reference)' },
            { term: 'L2', pattern: /\bL2\b/i, msg: 'Contains "L2" (taxonomy reference)' },
            { term: 'L3', pattern: /\bL3\b/i, msg: 'Contains "L3" (taxonomy reference)' },
            { term: 'taxonomy', pattern: /\btaxonom/i, msg: 'Contains "taxonomy" reference' },
            { term: 'CFBench', pattern: /\bcfbench\b/i, msg: 'Contains "CFBench" reference' },
            { term: 'use case', pattern: /\buse\s*case\b/i, msg: 'Contains "use case" reference' },
            { term: 'metadata', pattern: /\bmetadata\b/i, msg: 'Contains "metadata" reference' },
            { term: 'instruction_id', pattern: /\binstruction_id\b/i, msg: 'Contains "instruction_id" reference' },
            { term: 'turn_metadata', pattern: /\bturn_metadata\b/i, msg: 'Contains "turn_metadata" reference' },
            { term: 'validator', pattern: /\bvalidator\b/i, msg: 'Contains "validator" reference' }
        ];

        const foundTerms = [];

        forbiddenTerms.forEach(({ term, pattern, msg }) => {
            if (pattern.test(content)) {
                issues.push(msg + ' - System prompt should NOT contain internal/metadata terms');
                foundTerms.push(term);
            }
        });

        this.results.phase2.push({
            id: '2.8',
            name: 'Forbidden Terms',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                foundTerms: foundTerms,
                checkedTerms: forbiddenTerms.map(f => f.term)
            }
        });
    }

    /**
     * Check 2.9: Golden response formatting
     * Checks for forbidden formatting in the golden assistant response
     */
    check2_9_GoldenFormatting() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        if (!p.finalTurn?.assistant?.content) {
            this.results.phase2.push({
                id: '2.9',
                name: 'Golden Formatting',
                status: 'skipped',
                issues: ['No golden response content']
            });
            return;
        }

        const content = p.finalTurn.assistant.content;
        const foundIssues = [];

        // Check for emojis
        const emojiPattern = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu;
        const emojis = content.match(emojiPattern);
        if (emojis && emojis.length > 0) {
            issues.push(`Golden response contains ${emojis.length} emoji(s): ${emojis.slice(0, 3).join(' ')}... - Emojis are FORBIDDEN`);
            foundIssues.push({ type: 'emoji', count: emojis.length, examples: emojis.slice(0, 5) });
        }

        // Check for em-dash (should use hyphens)
        const emDashPattern = /[—–]/g;
        const emDashes = content.match(emDashPattern);
        if (emDashes && emDashes.length > 0) {
            issues.push(`Golden response contains ${emDashes.length} em-dash(es) — use regular hyphens (-) instead`);
            foundIssues.push({ type: 'em-dash', count: emDashes.length });
        }

        // Check for currency symbols (should use ISO codes)
        const currencyPattern = /[$€£¥₹₽]/g;
        const currencies = content.match(currencyPattern);
        if (currencies && currencies.length > 0) {
            issues.push(`Golden response contains currency symbols (${currencies.join(', ')}) - use ISO codes (USD, EUR, GBP) instead`);
            foundIssues.push({ type: 'currency', symbols: [...new Set(currencies)] });
        }

        // Check for LaTeX
        const latexPattern = /\$\$[\s\S]*?\$\$|\$[^$]+\$|\\frac|\\sqrt|\\sum|\\int|\\alpha|\\beta/g;
        const latex = content.match(latexPattern);
        if (latex && latex.length > 0) {
            issues.push(`Golden response contains LaTeX formatting - LaTeX is FORBIDDEN`);
            foundIssues.push({ type: 'latex', count: latex.length, examples: latex.slice(0, 2) });
        }

        // Check for preambles
        const preamblePatterns = [
            /^(sure|certo|certainly|certamente)[!,.\s]/i,
            /^(of course|ovviamente|naturalmente)[!,.\s]/i,
            /^(absolutely|assolutamente)[!,.\s]/i,
            /^(great|ottimo|perfetto)[!,.\s]/i,
            /^(i'?d be happy to|sarò felice di|volentieri)[!,.\s]/i,
            /^(here'?s|ecco)[!,.\s]/i
        ];

        const hasPreamble = preamblePatterns.some(p => p.test(content.trim()));
        if (hasPreamble) {
            issues.push('Golden response starts with a preamble (Sure!, Of course!, etc.) - Start directly with content');
            foundIssues.push({ type: 'preamble' });
        }

        // Check for markdown headers in non-markdown context (might be ok depending on task)
        const markdownHeaders = content.match(/^#{1,6}\s+/gm);
        if (markdownHeaders && markdownHeaders.length > 5) {
            warnings.push(`Golden response has ${markdownHeaders.length} markdown headers - verify this is appropriate for the task`);
        }

        this.results.phase2.push({
            id: '2.9',
            name: 'Golden Formatting',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                foundIssues: foundIssues,
                contentLength: content.length
            }
        });
    }

    /**
     * Helper: Escape regex special characters
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Phase 3: Metadata Checks
     */
    runPhase3Checks() {
        // Check 3.0: JSON Validation (turn_metadata and all validators)
        this.check3_0_JSONValidation();

        // Check 3.1: IF instructions count
        this.check3_1_IFCount();

        // Check 3.2: LLM Eval presence
        this.check3_2_LLMEval();

        // Check 3.3: llm_judge presence
        this.check3_3_LLMJudge();

        // Check 3.4: llm_judge usage validation
        this.check3_4_LLMJudgeUsage();

        // Check 3.5: All constraints in query
        this.check3_5_ConstraintsInQuery();

        // Check 3.6: Keyword explicitness (warn if keywords only implicitly mentioned)
        this.check3_6_KeywordExplicitness();

        // Check 3.7: llm_judge language must match task language
        this.check3_7_LLMJudgeLanguage();

        // Check 3.8: llm_judge redundancy check (should not duplicate LLM Eval)
        this.check3_8_LLMJudgeRedundancy();

        // Check 3.9: Format constraints must be explicit in query
        this.check3_9_FormatConstraintsExplicit();

        // Check 3.10: validator_human must contain llm_eval and llm_judge checks
        this.check3_10_ValidatorHumanCompleteness();
    }

    /**
     * Check 3.0: JSON Validation - Ensure all JSON cells are valid
     * Validates: turn_metadata, validator_assistant, validator_human (golden + all model passes)
     * Cell names match notebook format: validator_assistant_qwen3_1, validator_human_nemotron_2, etc.
     */
    check3_0_JSONValidation() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;
        const jsonStatus = [];

        // Check turn_metadata JSON
        const turnMeta = p.finalTurn?.turnMetadata;
        if (!turnMeta) {
            issues.push('turn_metadata: NOT FOUND');
            jsonStatus.push({ cell: 'turn_metadata', status: 'NOT FOUND', valid: false });
        } else if (turnMeta.error) {
            issues.push(`turn_metadata: JSON ERROR - ${turnMeta.error}`);
            jsonStatus.push({ cell: 'turn_metadata', status: 'INVALID', error: turnMeta.error, valid: false });
        } else {
            jsonStatus.push({ cell: 'turn_metadata', status: 'VALID', valid: true });
        }

        // Check golden validator_assistant JSON
        const goldenVA = p.finalTurn?.validatorAssistant;
        if (!goldenVA) {
            warnings.push('validator_assistant: NOT FOUND');
            jsonStatus.push({ cell: 'validator_assistant', status: 'NOT FOUND', valid: false });
        } else if (goldenVA.error) {
            issues.push(`validator_assistant: JSON ERROR - ${goldenVA.error}`);
            jsonStatus.push({ cell: 'validator_assistant', status: 'INVALID', error: goldenVA.error, valid: false });
        } else {
            jsonStatus.push({ cell: 'validator_assistant', status: 'VALID', valid: true });
        }

        // Check golden validator_human JSON
        const goldenVH = p.finalTurn?.validatorHuman;
        if (!goldenVH) {
            warnings.push('validator_human: NOT FOUND');
            jsonStatus.push({ cell: 'validator_human', status: 'NOT FOUND', valid: false });
        } else if (goldenVH.error) {
            issues.push(`validator_human: JSON ERROR - ${goldenVH.error}`);
            jsonStatus.push({ cell: 'validator_human', status: 'INVALID', error: goldenVH.error, valid: false });
        } else {
            jsonStatus.push({ cell: 'validator_human', status: 'VALID', valid: true });
        }

        // Check all model passes validators (uses actual cell names: validator_assistant_qwen3_1, etc.)
        (p.modelPasses || []).forEach((pass, idx) => {
            const model = pass.model || 'unknown';
            const passNum = pass.passNumber || (idx + 1);

            // Actual cell name format: validator_assistant_qwen3_1, validator_assistant_nemotron_2, etc.
            const vaCellName = `validator_assistant_${model}_${passNum}`;
            const vhCellName = `validator_human_${model}_${passNum}`;

            // validator_assistant for model pass
            const va = pass.validatorAssistant;
            if (!va) {
                warnings.push(`${vaCellName}: NOT FOUND`);
                jsonStatus.push({ cell: vaCellName, status: 'NOT FOUND', valid: false });
            } else if (va.error) {
                issues.push(`${vaCellName}: JSON ERROR - ${va.error}`);
                jsonStatus.push({ cell: vaCellName, status: 'INVALID', error: va.error, valid: false });
            } else {
                jsonStatus.push({ cell: vaCellName, status: 'VALID', valid: true });
            }

            // validator_human for model pass
            const vh = pass.validatorHuman;
            if (!vh) {
                warnings.push(`${vhCellName}: NOT FOUND`);
                jsonStatus.push({ cell: vhCellName, status: 'NOT FOUND', valid: false });
            } else if (vh.error) {
                issues.push(`${vhCellName}: JSON ERROR - ${vh.error}`);
                jsonStatus.push({ cell: vhCellName, status: 'INVALID', error: vh.error, valid: false });
            } else {
                jsonStatus.push({ cell: vhCellName, status: 'VALID', valid: true });
            }
        });

        // Summary
        const validCount = jsonStatus.filter(j => j.valid).length;
        const totalCount = jsonStatus.length;
        const allValid = issues.length === 0;

        this.results.phase3.push({
            id: '3.0',
            name: 'JSON Parsing',
            status: allValid ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                validCount: validCount,
                totalCount: totalCount,
                jsonStatus: jsonStatus,
                summary: `${validCount}/${totalCount} JSON cells valid`
            }
        });
    }

    /**
     * Check 3.1: IF instructions count (>= 4 required)
     */
    check3_1_IFCount() {
        const issues = [];
        const p = this.parsed;

        const ifCount = p.finalTurn.turnMetadata?.ifCount || 0;
        const totalInstructions = p.finalTurn.turnMetadata?.instructions?.length || 0;

        if (totalInstructions < 4) {
            issues.push(`Only ${totalInstructions} IF instructions found (minimum 4 required)`);
        }

        this.results.phase3.push({
            id: '3.1',
            name: 'IF Instructions Count',
            status: totalInstructions >= 4 ? 'passed' : 'failed',
            issues: issues,
            details: {
                ifInstructionCount: ifCount,
                totalInstructions: totalInstructions,
                required: 4
            }
        });
    }

    /**
     * Check 3.2: LLM Eval instruction presence
     */
    check3_2_LLMEval() {
        const issues = [];
        const p = this.parsed;

        const llmEvalCount = p.finalTurn.turnMetadata?.llmEvalCount || 0;
        const llmEvalInstructions = p.finalTurn.turnMetadata?.llmEvalInstructions || [];

        if (llmEvalCount === 0) {
            issues.push('No LLM Eval instruction found (stylistic:*, linguistic:*, or situation:*)');
        }

        this.results.phase3.push({
            id: '3.2',
            name: 'LLM Eval Instruction',
            status: llmEvalCount > 0 ? 'passed' : 'failed',
            issues: issues,
            details: {
                llmEvalCount: llmEvalCount,
                instructions: llmEvalInstructions.map(i => i.instruction_id)
            }
        });
    }

    /**
     * Check 3.3: llm_judge presence
     */
    check3_3_LLMJudge() {
        const issues = [];
        const p = this.parsed;

        const llmJudgeCount = p.finalTurn.turnMetadata?.llmJudgeCount || 0;
        const llmJudge = p.finalTurn.turnMetadata?.llmJudge || [];

        if (llmJudgeCount === 0) {
            issues.push('No llm_judge found in turn_metadata');
        }

        this.results.phase3.push({
            id: '3.3',
            name: 'LLM Judge',
            status: llmJudgeCount > 0 ? 'passed' : 'failed',
            issues: issues,
            details: {
                llmJudgeCount: llmJudgeCount,
                judges: llmJudge.map(j => ({ uid: j.uid, content: j.content?.substring(0, 100) }))
            }
        });
    }

    /**
     * Check 3.4: LLM Judge Usage Validation
     * Checks if llm_judge is used correctly (not for tone/style, appears in query)
     */
    check3_4_LLMJudgeUsage() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        const llmJudge = p.finalTurn.turnMetadata?.llmJudge || [];
        const userQuery = p.finalTurn?.user?.content || '';
        const queryLower = userQuery.toLowerCase();

        if (llmJudge.length === 0) {
            this.results.phase3.push({
                id: '3.4',
                name: 'LLM Judge Usage',
                status: 'skipped',
                issues: ['No llm_judge to validate']
            });
            return;
        }

        const judgeAnalysis = [];

        llmJudge.forEach((judge, index) => {
            const content = judge.content || '';
            const contentLower = content.toLowerCase();
            const analysis = {
                uid: judge.uid,
                content: content,
                issues: []
            };

            // Check 1: llm_judge should NOT be for tone/style (should use LLM Eval instead)
            const toneStylePatterns = [
                /tono\s+(professionale|formale|informale|accessibile|amichevole)/i,
                /tone\s+(professional|formal|informal|friendly|accessible)/i,
                /stile\s+(professionale|formale|narrativo|descrittivo)/i,
                /style\s+(professional|formal|narrative|descriptive)/i,
                /è\s+(professionale|formale|accessibile)/i,
                /is\s+(professional|formal|accessible)/i
            ];

            const looksLikeToneCheck = toneStylePatterns.some(p => p.test(content));
            if (looksLikeToneCheck) {
                warnings.push(`llm_judge_${judge.uid}: "${content.substring(0, 50)}..." looks like a tone/style check - consider using LLM Eval (stylistic:tone_formality) instead`);
                analysis.issues.push('should_be_llm_eval');
            }

            // Check 2: llm_judge question should appear in user query (semantic check)
            // Extract key concepts from llm_judge
            const keyWords = content.toLowerCase()
                .replace(/[?.,!]/g, '')
                .split(/\s+/)
                .filter(w => w.length > 4);

            const matchingWords = keyWords.filter(w => queryLower.includes(w));
            const matchRatio = keyWords.length > 0 ? matchingWords.length / keyWords.length : 0;

            if (matchRatio < 0.3) {
                warnings.push(`llm_judge_${judge.uid}: Question may not be reflected in user query (${Math.round(matchRatio * 100)}% keyword match)`);
                analysis.issues.push('not_in_query');
            }

            judgeAnalysis.push(analysis);
        });

        this.results.phase3.push({
            id: '3.4',
            name: 'LLM Judge Usage',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                judgeCount: llmJudge.length,
                analysis: judgeAnalysis
            }
        });
    }

    /**
     * Check 3.5: List format constraints for manual verification
     * (Semantic validation should be done by AI, not regex)
     */
    check3_5_ConstraintsInQuery() {
        const warnings = [];
        const p = this.parsed;

        if (!p.finalTurn.user || !p.finalTurn.turnMetadata) {
            this.results.phase3.push({
                id: '3.5',
                name: 'Constraints in Query',
                status: 'skipped',
                issues: ['Cannot check - missing data']
            });
            return;
        }

        const instructions = p.finalTurn.turnMetadata.instructions || [];

        // Lista constraints que requerem verificação manual
        const formatConstraints = instructions
            .map(inst => inst.instruction_id)
            .filter(id =>
                id.includes('no_comma') ||
                id.includes('capital') ||
                id.includes('lowercase') ||
                id.includes('uppercase') ||
                id.includes('json_format') ||
                id.includes('bullet_list') ||
                id.includes('numbered_list')
            );

        if (formatConstraints.length > 0) {
            warnings.push(`Found ${formatConstraints.length} format constraint(s): ${formatConstraints.join(', ')}. Verify these are explicitly stated in user query.`);
        }

        this.results.phase3.push({
            id: '3.5',
            name: 'Constraints in Query',
            status: 'passed', // Não falha automaticamente - validação semântica pela IA
            issues: [],
            warnings: warnings,
            details: {
                note: 'Format constraints require manual AI verification',
                constraintsToVerify: formatConstraints,
                totalConstraints: instructions.length
            }
        });
    }

    /**
     * Check 3.6: Keyword Explicitness Check
     * Verifies keyword constraints are explicitly requested, not just mentioned in context
     */
    check3_6_KeywordExplicitness() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        if (!p.finalTurn.user || !p.finalTurn.turnMetadata) {
            this.results.phase3.push({
                id: '3.6',
                name: 'Keyword Explicitness',
                status: 'skipped',
                issues: ['Cannot check - missing user query or turn_metadata']
            });
            return;
        }

        const userQuery = p.finalTurn.user.content;
        const queryLower = userQuery.toLowerCase();
        const instructions = p.finalTurn.turnMetadata.instructions || [];

        const keywordAnalysis = [];

        instructions.forEach(inst => {
            const id = inst.instruction_id || '';

            // Check keyword_frequency constraints
            if ((id.includes('keyword') || id.includes('frequency')) && inst.keyword) {
                const keyword = inst.keyword;
                const keywordLower = keyword.toLowerCase();
                const freq = inst.frequency || 1;

                const analysis = {
                    instruction_id: id,
                    keyword: keyword,
                    frequency: freq,
                    foundInQuery: false,
                    isExplicit: false,
                    evidence: null,
                    issue: null
                };

                // Check if keyword appears in query
                if (!queryLower.includes(keywordLower)) {
                    analysis.issue = `Keyword "${keyword}" not found in user query at all`;
                    issues.push(`[${id}] Keyword "${keyword}" is NOT in user query - model won't know to include it`);
                } else {
                    analysis.foundInQuery = true;

                    // Check if it's explicitly requested vs just mentioned in context
                    // Multilingual patterns for explicit keyword requests
                    const explicitPatterns = [
                        // Italian
                        new RegExp(`usa\\s+(la\\s+)?(parola|termine|keyword)\\s+["']?${this.escapeRegex(keyword)}["']?`, 'i'),
                        new RegExp(`includ[ia]\\s+(la\\s+)?(parola|termine)\\s+["']?${this.escapeRegex(keyword)}["']?`, 'i'),
                        new RegExp(`["']${this.escapeRegex(keyword)}["']\\s+(\\d+|${freq})\\s+(volt[ei]|times)`, 'i'),
                        new RegExp(`(ripeti|usa|inserisci)\\s+["']?${this.escapeRegex(keyword)}["']?\\s+(\\d+|${freq})`, 'i'),
                        new RegExp(`parola\\s+["']${this.escapeRegex(keyword)}["']`, 'i'),
                        // English
                        new RegExp(`use\\s+(the\\s+)?(word|term|keyword)\\s+["']?${this.escapeRegex(keyword)}["']?`, 'i'),
                        new RegExp(`include\\s+(the\\s+)?(word|term)\\s+["']?${this.escapeRegex(keyword)}["']?`, 'i'),
                        new RegExp(`["']${this.escapeRegex(keyword)}["']\\s+(\\d+|${freq})\\s+times`, 'i'),
                        new RegExp(`(repeat|use|include)\\s+["']?${this.escapeRegex(keyword)}["']?\\s+(\\d+|${freq})\\s+times`, 'i'),
                        // Portuguese
                        new RegExp(`use\\s+(a\\s+)?(palavra|termo)\\s+["']?${this.escapeRegex(keyword)}["']?`, 'i'),
                        new RegExp(`["']${this.escapeRegex(keyword)}["']\\s+(\\d+|${freq})\\s+(vezes|vez)`, 'i'),
                        // German
                        new RegExp(`verwende\\s+(das\\s+)?(wort|begriff)\\s+["']?${this.escapeRegex(keyword)}["']?`, 'i'),
                        new RegExp(`["']${this.escapeRegex(keyword)}["']\\s+(\\d+|${freq})\\s+mal`, 'i'),
                        // General: keyword in quotes near frequency number
                        new RegExp(`["']${this.escapeRegex(keyword)}["'].{0,30}\\b${freq}\\b`, 'i'),
                        new RegExp(`\\b${freq}\\b.{0,30}["']${this.escapeRegex(keyword)}["']`, 'i')
                    ];

                    for (const pattern of explicitPatterns) {
                        const match = userQuery.match(pattern);
                        if (match) {
                            analysis.isExplicit = true;
                            // Extract context around match
                            const idx = userQuery.indexOf(match[0]);
                            const start = Math.max(0, idx - 20);
                            const end = Math.min(userQuery.length, idx + match[0].length + 20);
                            analysis.evidence = '...' + userQuery.substring(start, end) + '...';
                            break;
                        }
                    }

                    if (!analysis.isExplicit) {
                        analysis.issue = `Keyword "${keyword}" appears in query but not explicitly requested`;
                        warnings.push(`[${id}] Keyword "${keyword}" appears in query but is NOT explicitly requested as a constraint (e.g., "usa la parola '${keyword}' ${freq} volte"). Model may not include it in the response. Consider making the request more explicit.`);

                        // Find where the keyword appears for context
                        const idx = queryLower.indexOf(keywordLower);
                        if (idx >= 0) {
                            const start = Math.max(0, idx - 30);
                            const end = Math.min(userQuery.length, idx + keyword.length + 30);
                            analysis.evidence = '...' + userQuery.substring(start, end) + '...';
                        }
                    }
                }

                keywordAnalysis.push(analysis);
            }
        });

        // Determine status
        const hasExplicitIssues = keywordAnalysis.some(a => !a.foundInQuery);
        const hasImplicitWarnings = keywordAnalysis.some(a => a.foundInQuery && !a.isExplicit);

        this.results.phase3.push({
            id: '3.6',
            name: 'Keyword Explicitness',
            status: hasExplicitIssues ? 'failed' : 'passed',
            issues: issues,
            warnings: warnings,
            details: {
                keywordsAnalyzed: keywordAnalysis.length,
                explicit: keywordAnalysis.filter(a => a.isExplicit).length,
                implicit: keywordAnalysis.filter(a => a.foundInQuery && !a.isExplicit).length,
                missing: keywordAnalysis.filter(a => !a.foundInQuery).length,
                analysis: keywordAnalysis
            }
        });
    }

    /**
     * Check 3.7: LLM Judge Language Check
     * Verifies that llm_judge content is in the same language as the task
     */
    check3_7_LLMJudgeLanguage() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        const llmJudge = p.finalTurn.turnMetadata?.llmJudge || [];
        const taskLang = p.finalTurn.turnMetadata?.language || p.metadata?.language?.toLowerCase().substring(0, 2) || '';

        if (llmJudge.length === 0) {
            this.results.phase3.push({
                id: '3.7',
                name: 'LLM Judge Language',
                status: 'skipped',
                issues: ['No llm_judge to check']
            });
            return;
        }

        // Language detection patterns
        const langPatterns = {
            en: /\b(the|is|are|does|do|have|has|was|were|been|being|will|would|could|should|can|may|might|must|if|then|and|or|but|not|this|that|these|those|with|from|into|through|during|before|after|above|below|between|under|again|further|once|here|there|when|where|why|how|all|each|few|more|most|other|some|such|only|same|than|too|very|just|also)\b/gi,
            it: /\b(il|la|le|lo|gli|un|una|uno|del|della|delle|dello|dei|degli|che|di|da|in|con|su|per|tra|fra|non|si|come|più|anche|solo|ancora|già|sempre|mai|dove|quando|perché|cosa|chi|quale|quanto|questo|quello|ogni|tutto|molto|poco|altro|stesso|proprio|nuovo|primo|ultimo|grande|piccolo|buono|bello|essere|avere|fare|dire|potere|volere|dovere|sapere|vedere|andare|venire|stare|dare|prendere)\b/gi,
            pt: /\b(o|a|os|as|um|uma|uns|umas|do|da|dos|das|no|na|nos|nas|ao|aos|pelo|pela|pelos|pelas|de|em|com|para|por|sobre|entre|até|desde|sem|como|mais|também|ainda|já|sempre|nunca|onde|quando|porque|quem|qual|quanto|este|esse|aquele|cada|todo|muito|pouco|outro|mesmo|próprio|novo|primeiro|último|grande|pequeno|bom|ser|estar|ter|fazer|dizer|poder|querer|dever|saber|ver|ir|vir|dar|ficar)\b/gi,
            de: /\b(der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines|und|oder|aber|nicht|ist|sind|war|waren|wird|werden|wurde|wurden|kann|können|konnte|konnten|muss|müssen|soll|sollen|will|wollen|darf|dürfen|hat|haben|hatte|hatten|sein|ihr|sein|ihre|dieser|diese|dieses|jeder|jede|jedes|welcher|welche|welches|was|wer|wie|wo|wann|warum|wenn|dann|also|auch|noch|schon|immer|nie|hier|dort|oben|unten|vor|nach|zwischen|über|unter|neben|mit|ohne|für|gegen|durch|um|bei|zu|von|aus|nach|seit|bis)\b/gi,
            es: /\b(el|la|los|las|un|una|unos|unas|del|de|en|con|por|para|sobre|entre|hasta|desde|sin|como|más|también|todavía|ya|siempre|nunca|donde|cuando|porque|quién|cuál|cuánto|este|ese|aquel|cada|todo|mucho|poco|otro|mismo|propio|nuevo|primero|último|grande|pequeño|bueno|ser|estar|tener|hacer|decir|poder|querer|deber|saber|ver|ir|venir|dar|quedarse|que|qué|si|no|pero|y|o)\b/gi
        };

        const detectLanguage = (text) => {
            const scores = {};
            for (const [lang, pattern] of Object.entries(langPatterns)) {
                const matches = text.match(pattern) || [];
                scores[lang] = matches.length;
            }
            // Get language with highest score
            const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
            if (sorted[0][1] > 3) { // Need at least 3 matches
                return sorted[0][0];
            }
            return 'unknown';
        };

        const judgeAnalysis = [];

        llmJudge.forEach(judge => {
            const content = judge.content || '';
            const detectedLang = detectLanguage(content);

            const analysis = {
                uid: judge.uid,
                content: content.substring(0, 100),
                detectedLang: detectedLang,
                expectedLang: taskLang,
                match: false
            };

            // Check if detected language matches task language
            if (detectedLang !== 'unknown' && taskLang) {
                if (detectedLang !== taskLang) {
                    issues.push(`llm_judge UID ${judge.uid} appears to be in ${detectedLang.toUpperCase()} but task language is ${taskLang.toUpperCase()}. Content: "${content.substring(0, 60)}..."`);
                    analysis.match = false;
                } else {
                    analysis.match = true;
                }
            } else if (detectedLang === 'en' && taskLang && taskLang !== 'en') {
                // Special case: English detected but task is not English
                issues.push(`llm_judge UID ${judge.uid} is in ENGLISH but task language is ${taskLang.toUpperCase()}. Rewrite in ${taskLang.toUpperCase()}.`);
                analysis.match = false;
            }

            judgeAnalysis.push(analysis);
        });

        this.results.phase3.push({
            id: '3.7',
            name: 'LLM Judge Language',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                taskLanguage: taskLang,
                judgeCount: llmJudge.length,
                analysis: judgeAnalysis
            }
        });
    }

    /**
     * Check 3.8: LLM Judge Redundancy Check
     * Verifies that llm_judge doesn't duplicate what LLM Eval validators already check
     */
    check3_8_LLMJudgeRedundancy() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        const llmJudge = p.finalTurn.turnMetadata?.llmJudge || [];
        const instructions = p.finalTurn.turnMetadata?.instructions || [];

        if (llmJudge.length === 0) {
            this.results.phase3.push({
                id: '3.8',
                name: 'LLM Judge Redundancy',
                status: 'skipped',
                issues: ['No llm_judge to check']
            });
            return;
        }

        // Get LLM Eval instructions (stylistic, linguistic, situation)
        const llmEvalInstructions = instructions.filter(inst => {
            const id = inst.instruction_id || '';
            return id.startsWith('stylistic:') || id.startsWith('linguistic:') || id.startsWith('situation:');
        });

        // Patterns that indicate redundancy with specific LLM Eval types
        const redundancyPatterns = {
            'situation:role_based': [
                /advisor|consulente|consultant|professional/i,
                /perspective|prospettiva|punto di vista/i,
                /maintain.*role|mantiene.*ruolo/i,
                /act as|agisce come|in character/i
            ],
            'stylistic:tone_formality': [
                /formal|informale|professional|professionale/i,
                /tone|tono|register|registro/i,
                /formality|formalità/i
            ],
            'stylistic:narrative_style': [
                /narrative|narrativo|storytelling/i,
                /first person|prima persona|third person|terza persona/i
            ],
            'linguistic:grammar': [
                /grammar|grammatica|grammatical/i,
                /correct|corretto|proper/i
            ]
        };

        const redundancyAnalysis = [];

        llmJudge.forEach(judge => {
            const content = judge.content || '';
            const contentLower = content.toLowerCase();

            const analysis = {
                uid: judge.uid,
                content: content.substring(0, 100),
                redundantWith: [],
                isRedundant: false
            };

            // Check against each LLM Eval instruction present
            llmEvalInstructions.forEach(inst => {
                const instId = inst.instruction_id || '';
                const patterns = redundancyPatterns[instId] || [];

                for (const pattern of patterns) {
                    if (pattern.test(content)) {
                        analysis.redundantWith.push(instId);
                        analysis.isRedundant = true;
                        break;
                    }
                }
            });

            // Also check for general redundancy patterns even if no matching instruction
            for (const [evalType, patterns] of Object.entries(redundancyPatterns)) {
                if (!analysis.redundantWith.includes(evalType)) {
                    for (const pattern of patterns) {
                        if (pattern.test(content)) {
                            // Check if this type of LLM Eval exists in instructions
                            const hasMatchingEval = llmEvalInstructions.some(i =>
                                (i.instruction_id || '').includes(evalType.split(':')[1])
                            );
                            if (hasMatchingEval) {
                                analysis.redundantWith.push(evalType);
                                analysis.isRedundant = true;
                            }
                            break;
                        }
                    }
                }
            }

            if (analysis.isRedundant) {
                issues.push(`llm_judge UID ${judge.uid} is REDUNDANT - checks "${content.substring(0, 50)}..." which is already covered by: ${analysis.redundantWith.join(', ')}. llm_judge should check subjective/factual things NOT covered by LLM Eval.`);
            }

            redundancyAnalysis.push(analysis);
        });

        this.results.phase3.push({
            id: '3.8',
            name: 'LLM Judge Redundancy',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                llmJudgeCount: llmJudge.length,
                llmEvalCount: llmEvalInstructions.length,
                llmEvalTypes: llmEvalInstructions.map(i => i.instruction_id),
                analysis: redundancyAnalysis,
                note: 'llm_judge should verify subjective/factual requirements NOT already covered by stylistic/linguistic/situation validators'
            }
        });
    }

    /**
     * Check 3.9: Format Constraints Must Be Explicit in Query
     * Verifies that format constraints (like title, bullets) are explicitly requested
     */
    check3_9_FormatConstraintsExplicit() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        if (!p.finalTurn.user || !p.finalTurn.turnMetadata) {
            this.results.phase3.push({
                id: '3.9',
                name: 'Format Constraints Explicit',
                status: 'skipped',
                issues: ['Cannot check - missing data']
            });
            return;
        }

        const userQuery = p.finalTurn.user.content;
        const queryLower = userQuery.toLowerCase();
        const instructions = p.finalTurn.turnMetadata.instructions || [];

        const formatAnalysis = [];

        // Define format constraints and their required patterns in query
        const formatChecks = {
            'detectable_format:title': {
                name: 'Title with <<>>',
                requiredPatterns: [
                    // Only detect explicit <<>> format requests via regex
                    // Generic title detection is handled by AI analysis
                    /<<.*>>/,
                    /parentesi angolari|angle brackets|doppie parentesi/i,
                    /titolo.*<<|<<.*titolo/i,
                    /title.*<<|<<.*title/i,
                    /formato.*<<|<<.*formato/i
                ],
                needsAICheck: true,  // Flag: if regex fails, AI should check for generic title requests
                errorMsg: 'Constraint requires title format - use AI Analysis to verify if title is requested in query'
            },
            'detectable_format:number_bullet_lists': {
                name: 'Numbered/Bullet Lists',
                requiredPatterns: [
                    /punti.*elenco|elenco.*punti|bullet|numbered list|lista numerata/i,
                    /\d+\s*(punti|points|bullet|elementi)/i
                ],
                errorMsg: 'Constraint requires bullet/numbered list but format not explicitly requested in query'
            },
            'detectable_format:json_format': {
                name: 'JSON Format',
                requiredPatterns: [
                    /json|JSON/,
                    /formato json|json format/i
                ],
                errorMsg: 'Constraint requires JSON format but not explicitly requested in query'
            },
            'detectable_format:markdown': {
                name: 'Markdown Format',
                requiredPatterns: [
                    /markdown/i,
                    /formato markdown/i
                ],
                errorMsg: 'Constraint requires Markdown format but not explicitly requested in query'
            },
            'keywords:existence': {
                name: 'Keyword Existence',
                customCheck: (inst, query) => {
                    // For keywords:existence, check if keywords are REQUESTED to be used
                    const keywords = inst.keywords || [];
                    if (keywords.length === 0) return { found: true };

                    const requestPatterns = [
                        /usa\s+(la\s+parola|le\s+parole|il\s+termine|i\s+termini)/i,
                        /includi\s+(la\s+parola|le\s+parole)/i,
                        /utilizza\s+(la\s+parola|le\s+parole)/i,
                        /use\s+(the\s+word|words|term)/i,
                        /include\s+(the\s+word|words)/i
                    ];

                    const hasExplicitRequest = requestPatterns.some(p => p.test(query));

                    if (!hasExplicitRequest) {
                        // Check if keywords just appear in context vs being requested
                        const keywordsInQuery = keywords.filter(kw => query.toLowerCase().includes(kw.toLowerCase()));
                        if (keywordsInQuery.length > 0) {
                            return {
                                found: false,
                                implicit: true,
                                keywords: keywords,
                                errorMsg: `keywords:existence constraint has keywords [${keywords.join(', ')}] but query doesn't EXPLICITLY ask to USE these words. The words may appear in context but user must REQUEST their usage (e.g., "usa la parola '${keywords[0]}'")`
                            };
                        }
                    }
                    return { found: true };
                }
            }
        };

        instructions.forEach(inst => {
            const id = inst.instruction_id || '';

            // Check each format constraint type
            for (const [constraintId, check] of Object.entries(formatChecks)) {
                if (id === constraintId || id.startsWith(constraintId.split(':')[0] + ':')) {
                    if (id !== constraintId && !id.includes(constraintId.split(':')[1])) continue;

                    const analysis = {
                        instruction_id: id,
                        constraintType: check.name,
                        foundInQuery: false,
                        evidence: null
                    };

                    // Custom check for keywords:existence
                    if (check.customCheck) {
                        const result = check.customCheck(inst, userQuery);
                        if (!result.found) {
                            analysis.foundInQuery = false;
                            analysis.issue = result.errorMsg;
                            if (result.implicit) {
                                issues.push(`[${id}] ${result.errorMsg}`);
                            }
                        } else {
                            analysis.foundInQuery = true;
                        }
                        formatAnalysis.push(analysis);
                        continue;
                    }

                    // Pattern-based check
                    let found = false;
                    for (const pattern of check.requiredPatterns) {
                        const match = userQuery.match(pattern);
                        if (match) {
                            found = true;
                            analysis.foundInQuery = true;
                            // Get context
                            const idx = userQuery.indexOf(match[0]);
                            const start = Math.max(0, idx - 20);
                            const end = Math.min(userQuery.length, idx + match[0].length + 20);
                            analysis.evidence = '...' + userQuery.substring(start, end) + '...';
                            break;
                        }
                    }

                    if (!found) {
                        analysis.foundInQuery = false;
                        analysis.issue = check.errorMsg;
                        // If needsAICheck is true, add to warnings instead of issues
                        // (AI analysis will provide definitive answer)
                        if (check.needsAICheck) {
                            analysis.needsAICheck = true;
                            warnings.push(`[${id}] ${check.errorMsg}`);
                        } else {
                            issues.push(`[${id}] ${check.errorMsg}`);
                        }
                    }

                    formatAnalysis.push(analysis);
                }
            }
        });

        // Determine status: failed if issues, warning if only AI-check warnings, passed otherwise
        let check39Status = 'passed';
        if (issues.length > 0) {
            check39Status = 'failed';
        } else if (warnings.length > 0) {
            check39Status = 'warning';  // Has items that need AI verification
        }

        this.results.phase3.push({
            id: '3.9',
            name: 'Format Constraints Explicit',
            status: check39Status,
            issues: issues,
            warnings: warnings,
            details: {
                formatConstraintsChecked: formatAnalysis.length,
                explicit: formatAnalysis.filter(a => a.foundInQuery).length,
                hidden: formatAnalysis.filter(a => !a.foundInQuery && !a.needsAICheck).length,
                needsAIVerification: formatAnalysis.filter(a => a.needsAICheck).length,
                analysis: formatAnalysis,
                note: 'Format constraints checked by regex. Items marked for AI verification need Full AI Analysis for definitive result.'
            }
        });
    }

    /**
     * Check 3.10: validator_human Completeness
     * Verifies that all validator_human cells (golden + 4 model passes) are present
     * and contain validations for llm_eval (stylistic/linguistic/situation) and llm_judge constraints
     */
    check3_10_ValidatorHumanCompleteness() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        // Get llm_eval and llm_judge from turn_metadata
        const instructions = p.finalTurn?.turnMetadata?.instructions || [];
        const llmJudge = p.finalTurn?.turnMetadata?.llmJudge || [];

        // Filter llm_eval constraints (stylistic:*, linguistic:*, situation:*)
        const llmEvalConstraints = instructions.filter(inst => {
            const id = inst.instruction_id || '';
            return id.startsWith('stylistic:') || id.startsWith('linguistic:') || id.startsWith('situation:');
        });

        // Build list of expected checks in validator_human
        const expectedChecks = [
            ...llmEvalConstraints.map(inst => ({
                id: inst.instruction_id,
                type: 'llm_eval',
                description: inst.instruction_id
            })),
            ...llmJudge.map((judge, idx) => ({
                id: judge.uid || `llm_judge_${idx + 1}`,
                type: 'llm_judge',
                description: judge.content?.substring(0, 50) || 'llm_judge'
            }))
        ];

        const validatorHumanResults = [];

        // Helper function to check if validator_human contains expected checks
        const checkValidatorHuman = (validatorHuman, cellName, isGolden) => {
            const result = {
                cell: cellName,
                present: !!validatorHuman,
                hasError: validatorHuman?.error ? true : false,
                error: validatorHuman?.error || null,
                checksFound: [],
                checksMissing: [],
                totalChecks: validatorHuman?.totalChecks || 0
            };

            if (!validatorHuman) {
                issues.push(`${cellName}: NOT FOUND - validator_human must be present`);
                result.checksMissing = expectedChecks.map(c => c.id);
            } else if (validatorHuman.error) {
                issues.push(`${cellName}: JSON ERROR - ${validatorHuman.error}`);
                result.checksMissing = expectedChecks.map(c => c.id);
            } else {
                // Check if expected llm_eval/llm_judge validations are present
                const checks = validatorHuman.checks || [];
                const checkIds = checks.map(c => (c.id || '').toLowerCase());

                expectedChecks.forEach(expected => {
                    const expectedId = expected.id.toLowerCase();
                    // Check various naming patterns
                    const found = checkIds.some(id =>
                        id === expectedId ||
                        id.includes(expectedId) ||
                        id.includes(expected.type) ||
                        // For llm_judge, check if renamed to human_judge
                        (expected.type === 'llm_judge' && id.includes('human_judge'))
                    );

                    if (found) {
                        result.checksFound.push(expected.id);
                    } else {
                        result.checksMissing.push(expected.id);
                    }
                });

                if (result.checksMissing.length > 0 && expectedChecks.length > 0) {
                    warnings.push(`${cellName}: Missing ${result.checksMissing.length}/${expectedChecks.length} expected llm_eval/llm_judge checks: ${result.checksMissing.slice(0, 3).join(', ')}${result.checksMissing.length > 3 ? '...' : ''}`);
                }
            }

            return result;
        };

        // Check golden validator_human
        const goldenVH = p.finalTurn?.validatorHuman;
        validatorHumanResults.push(checkValidatorHuman(goldenVH, 'validator_human', true));

        // Check all model passes validator_human
        (p.modelPasses || []).forEach((pass, idx) => {
            const model = pass.model || 'unknown';
            const passNum = pass.passNumber || (idx + 1);
            const cellName = `validator_human_${model}_${passNum}`;
            validatorHumanResults.push(checkValidatorHuman(pass.validatorHuman, cellName, false));
        });

        // Summary
        const presentCount = validatorHumanResults.filter(r => r.present && !r.hasError).length;
        const totalCount = validatorHumanResults.length;
        const allPresent = presentCount === totalCount;

        this.results.phase3.push({
            id: '3.10',
            name: 'validator_human Completeness',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                expectedChecksCount: expectedChecks.length,
                expectedChecks: expectedChecks,
                llmEvalCount: llmEvalConstraints.length,
                llmJudgeCount: llmJudge.length,
                validatorHumanResults: validatorHumanResults,
                presentCount: presentCount,
                totalCount: totalCount,
                summary: `${presentCount}/${totalCount} validator_human cells present`
            }
        });
    }

    /**
     * Phase 4: Model Passes Checks
     */
    runPhase4Checks() {
        // Check 4.2: Pass/fail distribution
        this.check4_2_PassFailDistribution();

        // Check 4.3: validator_human is manual
        this.check4_3_ValidatorHumanManual();

        // Check 4.4: Validator-content match (validator quotes exist in response)
        this.check4_4_ValidatorContentMatch();
    }

    /**
     * Check 4.2: Pass/fail distribution - Uses NvidiaValidator for mechanical checks
     * SUCCESS: At least 3 of 4 model responses must fail ≥50% of constraints
     */
    check4_2_PassFailDistribution() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        // Get instructions and llm_judge from turn_metadata
        const turnMetadata = p.finalTurn?.turnMetadata;
        const instructions = turnMetadata?.instructions || [];
        const llmJudge = turnMetadata?.llmJudge || [];

        // Total constraints = instructions + llm_judge
        const totalConstraints = instructions.length + llmJudge.length;

        if (totalConstraints === 0) {
            warnings.push('No constraints found in turn_metadata');
        }

        // Build instruction-by-instruction matrix
        const instructionMatrix = {};
        const allInstructionIds = new Set();

        // Track all instruction IDs
        instructions.forEach(inst => {
            const id = inst.instruction_id;
            if (id) {
                allInstructionIds.add(id);
                instructionMatrix[id] = { golden: null, passes: {}, type: 'instruction' };
            }
        });

        llmJudge.forEach((judge, idx) => {
            const id = judge.id || `llm_judge_${idx + 1}`;
            allInstructionIds.add(id);
            instructionMatrix[id] = { golden: null, passes: {}, type: 'llm_judge' };
        });

        // ============================================
        // VALIDATE GOLDEN RESPONSE (100% must pass)
        // ============================================
        const goldenContent = p.finalTurn?.assistant?.content || '';
        let goldenMechanicalFails = 0;
        let goldenSemanticCount = 0;

        instructions.forEach(inst => {
            const id = inst.instruction_id;
            if (!id) return;

            // Use NvidiaValidator for mechanical check
            if (typeof NvidiaValidator !== 'undefined') {
                const result = NvidiaValidator.validateInstruction(goldenContent, id, inst);
                if (result.semantic) {
                    goldenSemanticCount++;
                    instructionMatrix[id].golden = 'SEMANTIC';
                } else {
                    instructionMatrix[id].golden = result.valid ? 'PASS' : 'FAIL';
                    if (!result.valid) goldenMechanicalFails++;
                }
            }
        });

        // llm_judge are always semantic
        llmJudge.forEach((judge, idx) => {
            const id = judge.id || `llm_judge_${idx + 1}`;
            goldenSemanticCount++;
            instructionMatrix[id].golden = 'SEMANTIC';
        });

        if (goldenMechanicalFails > 0) {
            issues.push(`Golden response has ${goldenMechanicalFails} mechanical failures - it MUST pass all constraints`);
        }

        // ============================================
        // VALIDATE EACH MODEL PASS (≥3 must fail ≥50%)
        // ============================================
        const failRates = [];
        let passesWithOver50PercentFail = 0;  // Legacy: based on SCRIPT
        let cellPassesOver50 = 0;   // CELL: based on notebook validator_assistant
        let scriptPassesOver50 = 0; // SCRIPT: based on our validation
        const modelResults = [];

        p.modelPasses.forEach(pass => {
            const passId = `${pass.model}_${pass.passNumber}`;
            const modelContent = pass.assistant?.content || '';

            let mechanicalFails = 0;
            let semanticCount = 0;
            let llmJudgeCount = llmJudge.length;
            const details = [];

            // Get notebook's validator results for comparison (double check)
            const notebookValidator = pass.validatorAssistant;
            const notebookPassed = notebookValidator?.passed || 0;
            const notebookFailed = notebookValidator?.failed || 0;
            const notebookTotal = notebookValidator?.totalChecks || 0;
            const notebookJsonValid = notebookValidator && !notebookValidator.error;
            const notebookJsonError = notebookValidator?.error || null;

            // Validate each instruction using NvidiaValidator
            instructions.forEach(inst => {
                const id = inst.instruction_id;
                if (!id) return;

                if (typeof NvidiaValidator !== 'undefined') {
                    const result = NvidiaValidator.validateInstruction(modelContent, id, inst);

                    if (result.semantic) {
                        semanticCount++;
                        instructionMatrix[id].passes[passId] = 'SEMANTIC';
                        details.push({
                            id: id,
                            status: 'SEMANTIC',
                            note: result.note,
                            type: 'semantic'
                        });
                    } else {
                        const status = result.valid ? 'PASS' : 'FAIL';
                        instructionMatrix[id].passes[passId] = status;
                        if (!result.valid) mechanicalFails++;
                        details.push({
                            id: id,
                            status: status,
                            note: result.note,
                            type: 'mechanical'
                        });
                    }
                }
            });

            // llm_judge are always semantic (counted as semantic fails for model breaking)
            llmJudge.forEach((judge, idx) => {
                const id = judge.id || `llm_judge_${idx + 1}`;
                instructionMatrix[id].passes[passId] = 'SEMANTIC';
                details.push({
                    id: id,
                    status: 'SEMANTIC',
                    note: 'Requires LLM evaluation',
                    type: 'llm_judge'
                });
            });

            // For model breaking: mechanical fails are definitive
            // Semantic constraints are treated as fails for models (they need LLM to evaluate)
            // This is conservative - assumes semantic constraints fail for models
            const totalFails = mechanicalFails + semanticCount + llmJudgeCount;
            const scriptFailRate = totalConstraints > 0 ? (totalFails / totalConstraints) * 100 : 0;
            const scriptMeets50 = scriptFailRate >= 50;

            // Calculate notebook's fail rate (CELL source - primary)
            const cellFailRate = notebookTotal > 0 ? (notebookFailed / notebookTotal) * 100 : 0;
            const cellMeets50 = cellFailRate >= 50;

            // Count for each source separately
            if (cellMeets50) cellPassesOver50++;
            if (scriptMeets50) scriptPassesOver50++;

            // Legacy counter (for backward compatibility - uses SCRIPT)
            if (scriptMeets50) {
                passesWithOver50PercentFail++;
            }

            // Detect divergence: CELL and SCRIPT disagree on ≥50%
            const hasDivergence = cellMeets50 !== scriptMeets50;
            const divergenceNote = hasDivergence
                ? `CELL: ${cellMeets50 ? '≥50%' : '<50%'}, SCRIPT: ${scriptMeets50 ? '≥50%' : '<50%'}`
                : null;

            failRates.push({
                id: passId,
                failRate: parseFloat(scriptFailRate.toFixed(1)),
                failed: totalFails,
                total: totalConstraints,
                mechanical_failed: mechanicalFails,
                semantic_failed: semanticCount,
                llm_judge_failed: llmJudgeCount,
                meets_50_percent: scriptMeets50,  // SCRIPT decision
                // Double check: notebook validator results
                notebook_passed: notebookPassed,
                notebook_failed: notebookFailed,
                notebook_total: notebookTotal,
                notebook_fail_rate: parseFloat(cellFailRate.toFixed(1)),
                notebook_meets_50: cellMeets50,   // CELL decision (legacy name)
                // NEW: Separate decisions for CELL vs SCRIPT
                cell_meets_50: cellMeets50,
                script_meets_50: scriptMeets50,
                // Divergence tracking
                has_divergence: hasDivergence,
                divergence_note: divergenceNote,
                // JSON status
                json_valid: notebookJsonValid,
                json_error: notebookJsonError
            });

            modelResults.push({
                name: passId,
                result: {
                    total: totalConstraints,
                    passed: totalConstraints - totalFails,
                    failed: totalFails,
                    mechanical_failed: mechanicalFails,
                    semantic_failed: semanticCount,
                    llm_judge_failed: llmJudgeCount,
                    failure_rate: `${failRate.toFixed(1)}%`,
                    meets_50_percent: meets50Percent,
                    details: details,
                    // Double check comparison with notebook
                    notebook_comparison: {
                        notebook_passed: notebookPassed,
                        notebook_failed: notebookFailed,
                        notebook_total: notebookTotal,
                        notebook_fail_rate: `${notebookFailRate.toFixed(1)}%`,
                        notebook_meets_50: notebookMeets50,
                        match: Math.abs(failRate - notebookFailRate) < 5 // Within 5% tolerance
                    }
                }
            });
        });

        // ============================================
        // MODEL BREAKING RULE: ≥3 of 4 must fail ≥50%
        // Now shows BOTH sources (CELL vs SCRIPT)
        // ============================================
        const hasDivergenceOverall = failRates.some(f => f.has_divergence);
        const cellPassRule = cellPassesOver50 >= 3;
        const scriptPassRule = scriptPassesOver50 >= 3;

        if (hasDivergenceOverall) {
            // Divergence detected - show both and mark for review
            const ratesSummary = failRates.map(f =>
                `${f.id}: CELL ${f.notebook_fail_rate}%${f.cell_meets_50 ? '✓' : '✗'}, SCRIPT ${f.failRate}%${f.script_meets_50 ? '✓' : '✗'}${f.has_divergence ? ' ⚠DIVERGE' : ''}`
            ).join('; ');

            if (cellPassRule && scriptPassRule) {
                // Both agree it passes - OK
                warnings.push(`CELL and SCRIPT have divergent rates but both agree rule is met. CELL: ${cellPassesOver50}/4, SCRIPT: ${scriptPassesOver50}/4`);
            } else if (!cellPassRule && !scriptPassRule) {
                // Both agree it fails
                issues.push(`MODEL BREAKING RULE VIOLATED (both agree): CELL ${cellPassesOver50}/4, SCRIPT ${scriptPassesOver50}/4 fail ≥50% (need ≥3). ${ratesSummary}`);
            } else {
                // CELL and SCRIPT disagree on the final rule!
                warnings.push(`⚠ NEEDS HUMAN REVIEW: CELL says ${cellPassRule ? 'PASS' : 'FAIL'} (${cellPassesOver50}/4), SCRIPT says ${scriptPassRule ? 'PASS' : 'FAIL'} (${scriptPassesOver50}/4). ${ratesSummary}`);
            }
        } else {
            // No divergence - use CELL as primary source
            if (!cellPassRule) {
                const ratesSummary = failRates.map(f => `${f.id}: ${f.notebook_fail_rate}% (${f.cell_meets_50 ? 'OK' : 'NOT OK'})`).join(', ');
                issues.push(`MODEL BREAKING RULE VIOLATED: Only ${cellPassesOver50}/4 model passes fail ≥50% of constraints (need ≥3). Rates: ${ratesSummary}`);
            }
        }

        // Build instruction variation info
        let hasVariation = false;
        const instructionVariation = [];

        for (const [instId, data] of Object.entries(instructionMatrix)) {
            const passResults = Object.values(data.passes).filter(r => r !== 'SEMANTIC');
            const hasPass = passResults.includes('PASS');
            const hasFail = passResults.includes('FAIL');

            if (hasPass && hasFail) {
                hasVariation = true;
            }

            instructionVariation.push({
                instruction: instId,
                golden: data.golden,
                passResults: data.passes,
                type: data.type,
                hasVariation: hasPass && hasFail
            });
        }

        if (!hasVariation && p.modelPasses.length >= 2) {
            warnings.push('All model passes have identical results for every instruction (no variation detected)');
        }

        // Build summary for report
        const distributionSummary = {
            totalInstructions: allInstructionIds.size,
            totalConstraints: totalConstraints,
            goldenStatus: goldenMechanicalFails === 0 ? 'ALL PASS' : `${goldenMechanicalFails} FAILURES`,
            passesWithOver50PercentFail: passesWithOver50PercentFail,  // Legacy (SCRIPT)
            // NEW: Separate counts for CELL vs SCRIPT
            cellPassesOver50: cellPassesOver50,
            scriptPassesOver50: scriptPassesOver50,
            cellPassRule: cellPassRule,
            scriptPassRule: scriptPassRule,
            hasDivergence: hasDivergenceOverall,
            hasInstructionVariation: hasVariation,
            validatorUsed: 'NvidiaValidator'
        };

        this.results.phase4.push({
            id: '4.2',
            name: 'Pass/Fail Distribution (Model Breaking)',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                instructionMatrix: instructionVariation,
                summary: distributionSummary,
                rule: 'Golden: 100% pass, Model Breaking: ≥3 of 4 must fail ≥50%',
                failRates: failRates,
                passesWithOver50PercentFail: passesWithOver50PercentFail,
                modelResults: modelResults
            }
        });
    }

    /**
     * Check 4.3: validator_human is manually written (not copy of validator_assistant)
     */
    check4_3_ValidatorHumanManual() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        // Check golden response
        if (p.finalTurn.validatorAssistant && p.finalTurn.validatorHuman) {
            const assistantChecks = p.finalTurn.validatorAssistant.totalChecks || 0;
            const humanChecks = p.finalTurn.validatorHuman.totalChecks || 0;

            // validator_human should have fewer checks (only stylistic, linguistic, llm_judge)
            if (humanChecks >= assistantChecks && assistantChecks > 0) {
                warnings.push(`Golden validator_human has ${humanChecks} checks, same or more than validator_assistant (${assistantChecks}). Should only contain stylistic/linguistic/llm_judge checks.`);
            }

            // Check for llm_judge renamed to human_judge
            const humanCheckIds = p.finalTurn.validatorHuman.checks?.map(c => c.id) || [];
            const hasHumanJudge = humanCheckIds.some(id => id.includes('human_judge'));
            const hasLlmJudgeInHuman = humanCheckIds.some(id => id.includes('llm_judge'));

            if (hasLlmJudgeInHuman && !hasHumanJudge) {
                warnings.push('validator_human contains llm_judge (should be renamed to human_judge)');
            }
        }

        // Check model passes
        p.modelPasses.forEach(pass => {
            if (pass.validatorAssistant && pass.validatorHuman) {
                const assistantChecks = pass.validatorAssistant.totalChecks || 0;
                const humanChecks = pass.validatorHuman.totalChecks || 0;

                if (humanChecks >= assistantChecks && assistantChecks > 0) {
                    warnings.push(`${pass.model}_${pass.passNumber}: validator_human has ${humanChecks} checks (should be fewer than validator_assistant's ${assistantChecks})`);
                }
            }
        });

        this.results.phase4.push({
            id: '4.3',
            name: 'Validator Human Manual',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                goldenValidatorAssistantChecks: p.finalTurn.validatorAssistant?.totalChecks,
                goldenValidatorHumanChecks: p.finalTurn.validatorHuman?.totalChecks
            }
        });
    }

    /**
     * Check 4.4: Validator-Content Mismatch Detection (CRITICAL)
     * Verifies that phrases cited in validator messages actually exist in the response
     */
    check4_4_ValidatorContentMatch() {
        const issues = [];
        const warnings = [];
        const p = this.parsed;

        const goldenResponse = p.finalTurn?.assistant?.content || '';
        const validatorChecks = p.finalTurn?.validatorAssistant?.checks || [];

        if (!goldenResponse || validatorChecks.length === 0) {
            this.results.phase4.push({
                id: '4.4',
                name: 'Validator-Content Match',
                status: 'skipped',
                issues: ['Cannot check - missing golden response or validator checks']
            });
            return;
        }

        const goldenLower = goldenResponse.toLowerCase();
        const mismatchedPhrases = [];
        const verifiedPhrases = [];

        // Extract quoted phrases from validator messages
        validatorChecks.forEach(check => {
            const message = check.message || '';
            const checkId = check.id || check.instruction_id || 'unknown';

            // Find phrases in single quotes
            const singleQuoted = message.match(/'([^']{5,})'/g) || [];
            // Find phrases in double quotes
            const doubleQuoted = message.match(/"([^"]{5,})"/g) || [];
            // Find phrases in backticks
            const backtickQuoted = message.match(/`([^`]{5,})`/g) || [];

            const allQuoted = [...singleQuoted, ...doubleQuoted, ...backtickQuoted];

            allQuoted.forEach(quotedPhrase => {
                // Clean the quotes
                const cleanPhrase = quotedPhrase.replace(/^['"`]|['"`]$/g, '');
                const cleanPhraseLower = cleanPhrase.toLowerCase();

                // Skip very short or common phrases
                if (cleanPhrase.length < 8) return;
                if (/^(passed|failed|found|not found|correct|incorrect|yes|no)$/i.test(cleanPhrase)) return;

                // Check if phrase exists in golden response
                if (goldenLower.includes(cleanPhraseLower)) {
                    verifiedPhrases.push({
                        checkId: checkId,
                        phrase: cleanPhrase,
                        found: true
                    });
                } else {
                    // Check if it's a partial match (at least 70% of words match)
                    const phraseWords = cleanPhraseLower.split(/\s+/).filter(w => w.length > 2);
                    const matchingWords = phraseWords.filter(w => goldenLower.includes(w));
                    const matchRatio = phraseWords.length > 0 ? matchingWords.length / phraseWords.length : 0;

                    if (matchRatio >= 0.7) {
                        verifiedPhrases.push({
                            checkId: checkId,
                            phrase: cleanPhrase,
                            found: true,
                            note: 'Partial match (70%+ words found)'
                        });
                    } else {
                        mismatchedPhrases.push({
                            checkId: checkId,
                            phrase: cleanPhrase,
                            found: false,
                            matchRatio: Math.round(matchRatio * 100) + '%'
                        });
                    }
                }
            });
        });

        // Report mismatches
        if (mismatchedPhrases.length > 0) {
            mismatchedPhrases.forEach(m => {
                issues.push(`[${m.checkId}] Validator references "${m.phrase.substring(0, 50)}${m.phrase.length > 50 ? '...' : ''}" but this text is NOT in golden response (${m.matchRatio} word match)`);
            });
            issues.unshift(`CRITICAL: Found ${mismatchedPhrases.length} phrase(s) in validator that don't exist in golden response. This indicates validator was run on different content.`);
        }

        // Check for suspicious validator-response mismatch patterns
        // If validator says "Passed" but response doesn't contain expected content
        const keywordChecks = validatorChecks.filter(c =>
            (c.id || '').includes('keyword') && c.status === 'Passed'
        );

        keywordChecks.forEach(check => {
            const message = check.message || '';
            // Extract keyword from message like "Found keyword 'mobilità' 3 times"
            const keywordMatch = message.match(/keyword\s+['"]?(\w+)['"]?/i) ||
                                message.match(/['"](\w+)['"]\s+(\d+)\s+(times|volte)/i);
            if (keywordMatch) {
                const keyword = keywordMatch[1];
                if (!goldenLower.includes(keyword.toLowerCase())) {
                    issues.push(`[${check.id}] Validator says keyword "${keyword}" passed, but keyword NOT FOUND in golden response!`);
                }
            }
        });

        this.results.phase4.push({
            id: '4.4',
            name: 'Validator-Content Match',
            status: issues.length === 0 ? 'passed' : 'failed',
            issues: issues,
            warnings: warnings,
            details: {
                totalPhrasesChecked: verifiedPhrases.length + mismatchedPhrases.length,
                verified: verifiedPhrases.length,
                mismatched: mismatchedPhrases.length,
                mismatchedPhrases: mismatchedPhrases,
                verifiedPhrases: verifiedPhrases.slice(0, 5) // Show first 5 for reference
            }
        });
    }

    /**
     * Calculate summary statistics
     */
    calculateSummary() {
        const allChecks = [
            ...this.results.phase1,
            ...this.results.phase2,
            ...this.results.phase3,
            ...this.results.phase4
        ];

        this.results.summary = {
            totalChecks: allChecks.length,
            passed: allChecks.filter(c => c.status === 'passed').length,
            failed: allChecks.filter(c => c.status === 'failed').length,
            skipped: allChecks.filter(c => c.status === 'skipped').length,
            needsReview: allChecks.filter(c => c.status === 'needs_review').length,
            warnings: allChecks.reduce((sum, c) => sum + (c.warnings?.length || 0), 0),
            status: this.determineOverallStatus(allChecks)
        };
    }

    /**
     * Determine overall status
     */
    determineOverallStatus(checks) {
        const failed = checks.filter(c => c.status === 'failed');
        const needsReview = checks.filter(c => c.status === 'needs_review');
        const warnings = checks.reduce((sum, c) => sum + (c.warnings?.length || 0), 0);

        if (failed.length === 0 && needsReview.length === 0 && warnings === 0) {
            return 'PASS';
        } else if (failed.length === 0 && needsReview.length > 0) {
            return 'NEEDS_REVIEW'; // New status for items needing AI or manual verification
        } else if (failed.length <= 2) {
            return 'MINOR_REVISION';
        } else {
            return 'MAJOR_REVISION';
        }
    }

    /**
     * Get all issues as flat array
     */
    getAllIssues() {
        const allChecks = [
            ...this.results.phase1,
            ...this.results.phase2,
            ...this.results.phase3,
            ...this.results.phase4
        ];

        return allChecks
            .filter(c => c.status === 'failed')
            .flatMap(c => c.issues.map(issue => ({
                checkId: c.id,
                checkName: c.name,
                issue: issue
            })));
    }

    /**
     * Get all warnings as flat array
     */
    getAllWarnings() {
        const allChecks = [
            ...this.results.phase1,
            ...this.results.phase2,
            ...this.results.phase3,
            ...this.results.phase4
        ];

        return allChecks
            .filter(c => c.warnings && c.warnings.length > 0)
            .flatMap(c => c.warnings.map(warning => ({
                checkId: c.id,
                checkName: c.name,
                warning: warning
            })));
    }
}

// Export
if (typeof window !== 'undefined') {
    window.Validators = Validators;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Validators;
}
