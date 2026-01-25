/**
 * CFBench API Handler
 * Supports both Gemini and OpenAI/GPT APIs
 */

class APIHandler {
    constructor(apiKey, provider = null) {
        // Load saved settings from localStorage
        this.provider = provider || localStorage.getItem('api_provider') || 'gemini';
        this.apiKey = apiKey || localStorage.getItem('api_key') || '';

        // Provider configurations
        this.providers = {
            gemini: {
                name: 'Gemini',
                model: 'gemini-2.5-flash-lite',
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
                rateLimit: 3000
            },
            openai: {
                name: 'OpenAI/GPT',
                model: 'gpt-4o-mini',
                baseUrl: 'https://api.openai.com/v1',
                rateLimit: 1000
            }
        };

        // Rate limiting
        this.RATE_LIMIT_DELAY = this.providers[this.provider]?.rateLimit || 3000;
        this.lastCallTime = 0;
        this.dailyCallCount = 0;
        this.DAILY_LIMIT = 1500;

        // Load prompts
        this.prompts = {};
    }

    /**
     * Set API provider (gemini or openai)
     */
    setProvider(provider) {
        if (this.providers[provider]) {
            this.provider = provider;
            this.RATE_LIMIT_DELAY = this.providers[provider].rateLimit;
            localStorage.setItem('api_provider', provider);
        }
    }

    /**
     * Get current provider name
     */
    getProviderName() {
        return this.providers[this.provider]?.name || 'Unknown';
    }

    /**
     * Set API key
     */
    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem('api_key', key);
    }

    /**
     * Check if API key is set
     */
    hasApiKey() {
        return !!this.apiKey && this.apiKey.length > 0;
    }

    /**
     * Get current model
     */
    getModel() {
        return this.providers[this.provider]?.model || 'unknown';
    }

    /**
     * Sleep for specified milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Apply rate limiting before API call
     */
    async applyRateLimit() {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCallTime;

        if (timeSinceLastCall < this.RATE_LIMIT_DELAY) {
            const waitTime = this.RATE_LIMIT_DELAY - timeSinceLastCall;
            await this.sleep(waitTime);
        }

        this.lastCallTime = Date.now();
    }

    /**
     * Check daily limit
     */
    checkDailyLimit() {
        if (this.dailyCallCount >= this.DAILY_LIMIT) {
            throw new Error(`Daily API limit reached (${this.DAILY_LIMIT} calls). Please try again tomorrow.`);
        }
    }

    /**
     * Make API call (supports both Gemini and OpenAI)
     * Includes automatic retry with exponential backoff for rate limits
     */
    async callGemini(prompt, options = {}) {
        if (!this.hasApiKey()) {
            throw new Error(`API key not set. Please configure your ${this.getProviderName()} API key.`);
        }

        this.checkDailyLimit();
        await this.applyRateLimit();

        // Get provider config
        const providerConfig = this.providers[this.provider];
        const url = `${providerConfig.baseUrl}/chat/completions`;

        const requestBody = {
            model: providerConfig.model,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: options.temperature || 0.3,
            max_tokens: options.maxTokens || 4096,
            top_p: options.topP || 0.8
        };

        // Retry logic with exponential backoff
        const maxRetries = 3;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify(requestBody)
                });

                // Handle rate limit (429) with retry
                if (response.status === 429) {
                    const waitTime = Math.pow(2, attempt) * 2000; // 4s, 8s, 16s
                    console.warn(`Rate limit hit. Attempt ${attempt}/${maxRetries}. Waiting ${waitTime/1000}s...`);

                    if (attempt < maxRetries) {
                        await this.sleep(waitTime);
                        continue;
                    } else {
                        throw new Error('Rate limit exceeded after 3 retries. Please wait 1-2 minutes and try again.');
                    }
                }

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`API Error ${response.status}: ${errorData.error?.message || response.statusText}`);
                }

                const data = await response.json();
                this.dailyCallCount++;

                // Extract text from OpenAI-compatible response
                const text = data.choices?.[0]?.message?.content || '';
                return {
                    text: text,
                    usage: {
                        promptTokens: data.usage?.prompt_tokens || 0,
                        completionTokens: data.usage?.completion_tokens || 0
                    }
                };
            } catch (error) {
                lastError = error;

                // If it's a network error or 5xx, retry
                if (attempt < maxRetries && (error.message.includes('fetch') || error.message.includes('500') || error.message.includes('503'))) {
                    const waitTime = Math.pow(2, attempt) * 1000;
                    console.warn(`API error. Attempt ${attempt}/${maxRetries}. Retrying in ${waitTime/1000}s...`);
                    await this.sleep(waitTime);
                    continue;
                }

                throw error;
            }
        }

        throw lastError || new Error('API call failed after retries');
    }

    /**
     * Validate query structure (70/30 rule) - IMPROVED VERSION
     */
    async validateQueryStructure(userQuery, scenario, instructions = []) {
        // Build instruction list for detailed checking
        const instructionList = instructions.map((inst, idx) => {
            const id = inst.instruction_id || `instruction_${idx}`;
            let desc = id;
            if (inst.num_words) desc += ` (words: ${inst.num_words})`;
            if (inst.num_chars) desc += ` (chars: ${inst.num_chars})`;
            if (inst.keyword) desc += ` (keyword: "${inst.keyword}", freq: ${inst.frequency})`;
            if (inst.max_length) desc += ` (max_length: ${inst.max_length})`;
            if (inst.first_word) desc += ` (first_word: "${inst.first_word}")`;
            if (inst.last_word) desc += ` (last_word: "${inst.last_word}")`;
            return `${idx + 1}. ${desc}`;
        }).join('\n');

        const prompt = `You are a senior CFBench task reviewer. Perform a DETAILED analysis of this user query.

## RULES TO CHECK

### 1. Structure (70/30 Rule)
- 70% should be scenario/context that sets up the request
- 30% should be constraints naturally integrated into the narrative
- Constraints should NOT be stacked/listed at the end

### 2. Query Type
- Must be an actual REQUEST asking the assistant to do something
- Must NOT be meta-commentary, explanation, or assistant-like response
- Red flags: "I want to clarify...", "Before proceeding...", "Let me explain..."

### 3. Constraint Integration (CRITICAL)
For each instruction below, check if it appears EXPLICITLY in the query.
- For keyword_frequency: the EXACT keyword must appear, AND the frequency should be mentioned
- For number_words/chars: the exact number must appear with context (e.g., "100 parole")
- For word_length: min/max values must be stated
- For first_word/last_word: the specific word must be mentioned as start/end requirement

## INSTRUCTIONS TO VERIFY:
${instructionList || 'No instructions provided'}

## USER QUERY TO ANALYZE:
---
${userQuery}
---

${scenario ? `## SCENARIO FROM METADATA (reference):\n${scenario}` : ''}

## YOUR TASK:
1. Analyze overall structure (70/30 split)
2. Check if it's an actual request
3. For EACH instruction, state if it's explicitly in the query with evidence

Respond in JSON:
{
  "structure_analysis": {
    "is_70_30_compliant": true/false,
    "scenario_portion": "brief description of scenario part",
    "constraints_portion": "brief description of constraints part",
    "constraints_stacked_at_end": true/false
  },
  "request_analysis": {
    "is_actual_request": true/false,
    "request_type": "description of what's being requested",
    "red_flags": ["list any red flag phrases found"]
  },
  "instruction_verification": [
    {
      "instruction": "instruction_id",
      "found_in_query": true/false,
      "explicit": true/false,
      "evidence": "quote from query or 'not found'",
      "issue": "description if not properly integrated"
    }
  ],
  "overall_score": 1-10,
  "status": "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES",
  "issues": ["list of all issues found"],
  "summary": "one paragraph summary with specific feedback"
}`;

        const response = await this.callGemini(prompt, { maxTokens: 3000 });
        return this.parseJSONResponse(response.text);
    }

    /**
     * Validate llm_judge integration in query
     */
    async validateLLMJudgeIntegration(userQuery, llmJudge) {
        if (!llmJudge || llmJudge.length === 0) {
            return { valid: true, message: 'No llm_judge to validate' };
        }

        const llmJudgeContent = llmJudge.map(j => `- UID ${j.uid}: "${j.content}"`).join('\n');

        const prompt = `You are a CFBench task reviewer. Check if the llm_judge requirements appear naturally in the user query.

RULE: llm_judge content must appear as a NATURAL request in the user query text, not just in metadata.

LLM_JUDGE REQUIREMENTS:
${llmJudgeContent}

USER QUERY:
${userQuery}

For each llm_judge item, check if its requirement is naturally expressed in the user query.

Respond in JSON format:
{
  "all_integrated": true/false,
  "checks": [
    {
      "uid": 1,
      "integrated": true/false,
      "evidence": "quote from query or 'not found'"
    }
  ],
  "issues": ["list of missing integrations"],
  "summary": "one sentence summary"
}`;

        const response = await this.callGemini(prompt);
        return this.parseJSONResponse(response.text);
    }

    /**
     * Detect model evasion in response
     */
    async detectModelEvasion(modelResponse, userQuery) {
        const prompt = `You are a CFBench task reviewer. Determine if this model response is an EVASION or a genuine attempt to fulfill the request.

EVASION TYPES:
1. Clarification Evasion: Model asks questions instead of responding
2. Apology Evasion: Model apologizes saying task is too complex/impossible
3. Refusal Evasion: Model refuses to complete the task
4. Partial Evasion: Model only addresses part of the request

USER REQUEST:
${userQuery}

MODEL RESPONSE (first 1000 chars):
${modelResponse.substring(0, 1000)}

Respond in JSON format:
{
  "is_evasion": true/false,
  "evasion_type": "none" | "clarification" | "apology" | "refusal" | "partial",
  "confidence": 0.0-1.0,
  "evidence": "specific text that indicates evasion",
  "recommendation": "what trainer should do"
}`;

        const response = await this.callGemini(prompt);
        return this.parseJSONResponse(response.text);
    }

    /**
     * Comprehensive review of task - IMPROVED VERSION
     */
    async comprehensiveReview(parsed, validatorResults) {
        const userQuery = parsed.finalTurn?.user?.content || '';
        const turnMetadata = parsed.finalTurn?.turnMetadata?.json || {};
        const instructions = parsed.finalTurn?.turnMetadata?.instructions || [];
        const llmJudge = parsed.finalTurn?.turnMetadata?.llmJudge || [];
        const scenario = parsed.metadata?.scenario || '';

        // Build detailed instruction table
        const instructionTable = instructions.map((inst, idx) => {
            const id = inst.instruction_id || `inst_${idx}`;
            const values = [];
            if (inst.num_words) values.push(`words=${inst.num_words}`);
            if (inst.num_chars) values.push(`chars=${inst.num_chars}`);
            if (inst.keyword) values.push(`keyword="${inst.keyword}" x${inst.frequency}`);
            if (inst.max_length) values.push(`max_len=${inst.max_length}`);
            if (inst.min_length) values.push(`min_len=${inst.min_length}`);
            if (inst.first_word) values.push(`first="${inst.first_word}"`);
            if (inst.last_word) values.push(`last="${inst.last_word}"`);
            return `  ${idx + 1}. [${id}] ${values.join(', ') || '(no specific values)'}`;
        }).join('\n');

        // Build llm_judge table
        const llmJudgeTable = llmJudge.map((j, idx) =>
            `  ${idx + 1}. UID ${j.uid}: "${j.content}"`
        ).join('\n');

        // Build model pass analysis with validator results
        const modelPassAnalysis = parsed.modelPasses.map(p => {
            const va = p.validatorAssistant;
            const passedChecks = va?.checks?.filter(c => c.status === 'Passed').map(c => c.id) || [];
            const failedChecks = va?.checks?.filter(c => c.status === 'Failed').map(c => c.id) || [];
            return {
                id: `${p.model}_${p.passNumber}`,
                total: va?.totalChecks || 0,
                passed: passedChecks.length,
                failed: failedChecks.length,
                passedList: passedChecks.slice(0, 5).join(', '),
                failedList: failedChecks.slice(0, 5).join(', '),
                preview: (p.assistant?.content || '').substring(0, 150).replace(/\n/g, ' ')
            };
        });

        // Golden response analysis
        const goldenVA = parsed.finalTurn?.validatorAssistant;
        const goldenPassed = goldenVA?.passed || 0;
        const goldenFailed = goldenVA?.failed || 0;
        const goldenTotal = goldenVA?.totalChecks || 0;

        // Deterministic issues summary
        const deterministicIssues = validatorResults?.getAllIssues?.() || [];
        const deterministicWarnings = validatorResults?.getAllWarnings?.() || [];

        const prompt = `You are a senior CFBench task reviewer. Perform a COMPREHENSIVE analysis like a human reviewer would.

## TASK METADATA
- Domain: ${parsed.metadata?.domain || 'Unknown'}
- Language: ${parsed.metadata?.language || 'Unknown'}
- Intermediate Turns: ${parsed.turns?.length || 0}
- Model Passes: ${parsed.modelPasses?.length || 0}

## SCENARIO (from metadata)
${scenario || 'Not provided'}

## INSTRUCTIONS IN turn_metadata (${instructions.length} total)
${instructionTable || 'None'}

## LLM_JUDGE ITEMS (${llmJudge.length} total)
${llmJudgeTable || 'None'}

## FINAL USER QUERY
---
${userQuery}
---

## GOLDEN RESPONSE VALIDATION
- Total checks: ${goldenTotal}
- Passed: ${goldenPassed}
- Failed: ${goldenFailed}
- Status: ${goldenFailed === 0 ? 'ALL PASSED (correct for golden)' : 'HAS FAILURES (PROBLEM!)'}

## MODEL PASSES VALIDATION
${modelPassAnalysis.map(p => `- ${p.id}: ${p.passed}/${p.total} passed, ${p.failed} failed
  Failed: ${p.failedList || 'none'}
  Preview: "${p.preview}..."`).join('\n\n')}

## DETERMINISTIC CHECKS ALREADY RAN
Issues found: ${deterministicIssues.length}
${deterministicIssues.slice(0, 5).map(i => `- [${i.checkId}] ${i.issue}`).join('\n') || 'None'}

Warnings: ${deterministicWarnings.length}
${deterministicWarnings.slice(0, 3).map(w => `- [${w.checkId}] ${w.warning}`).join('\n') || 'None'}

## YOUR ANALYSIS TASKS

### 1. INSTRUCTION INTEGRATION CHECK
For EACH instruction listed above, verify if it appears EXPLICITLY in the user query.
- keyword_frequency: MUST have keyword AND frequency count in query
- number_words/chars: MUST have the exact number in query
- word_length: MUST have min/max values stated
- first_word/last_word: MUST mention specific word as start/end

### 2. LLM_JUDGE INTEGRATION CHECK
Each llm_judge item MUST appear naturally in the user query text, not just in JSON.

### 3. MODEL PASS DISTRIBUTION CHECK
- Golden MUST pass 100% (0 failures)
- At most 50% of model passes (2 of 4) can pass all instructions
- At least one instruction must have both PASS and FAIL across different passes

### 4. OVERALL ASSESSMENT
Based on all checks, determine final status.

## OUTPUT FORMAT
Respond with detailed JSON:
{
  "instruction_check": {
    "total_instructions": number,
    "explicitly_in_query": number,
    "missing_or_implicit": [
      {"id": "instruction_id", "status": "missing|implicit", "issue": "description"}
    ]
  },
  "llm_judge_check": {
    "total": number,
    "integrated": number,
    "missing": [
      {"uid": number, "content": "...", "issue": "not found in query"}
    ]
  },
  "model_pass_check": {
    "golden_passes_all": true/false,
    "passes_that_pass_all": number,
    "distribution_valid": true/false,
    "issues": []
  },
  "overall_status": "PASS" | "MINOR_REVISION" | "MAJOR_REVISION",
  "critical_issues": ["issues that MUST be fixed"],
  "warnings": ["recommended improvements"],
  "feedback_for_trainer": "Detailed feedback in English, professional tone, ready to copy-paste to trainer. Include specific line-by-line issues with evidence."
}`;

        const response = await this.callGemini(prompt, { maxTokens: 4000 });
        return this.parseJSONResponse(response.text);
    }

    /**
     * Validate constraints from turn_metadata are explicitly in user query
     * This is a CRITICAL validation - hidden constraints are major errors
     */
    async validateConstraintsInQuery(turnMetadata, userQuery) {
        if (!turnMetadata || !turnMetadata.instructions) {
            return { valid: true, message: 'No instructions to validate' };
        }

        const instructions = turnMetadata.instructions || [];
        const llmJudge = turnMetadata.llmJudge || [];

        // Build detailed constraint list
        const constraintList = instructions.map((inst, idx) => {
            const id = inst.instruction_id || `instruction_${idx}`;
            const details = [];

            // Extract specific values that MUST appear in query
            if (inst.num_words) details.push(`num_words=${inst.num_words}`);
            if (inst.num_chars) details.push(`num_chars=${inst.num_chars}`);
            if (inst.num_paragraphs) details.push(`num_paragraphs=${inst.num_paragraphs}`);
            if (inst.num_sentences) details.push(`num_sentences=${inst.num_sentences}`);
            if (inst.keyword) details.push(`keyword="${inst.keyword}", frequency=${inst.frequency || 1}`);
            if (inst.first_word) details.push(`first_word="${inst.first_word}"`);
            if (inst.last_word) details.push(`last_word="${inst.last_word}"`);
            if (inst.forbidden_words) details.push(`forbidden_words=${JSON.stringify(inst.forbidden_words)}`);
            if (inst.section_splitter) details.push(`section_splitter="${inst.section_splitter}"`);
            if (inst.num_sections) details.push(`num_sections=${inst.num_sections}`);

            return {
                index: idx + 1,
                id: id,
                details: details.join(', ') || 'no specific values',
                raw: JSON.stringify(inst)
            };
        });

        // Build llm_judge list
        const llmJudgeList = llmJudge.map((j, idx) => ({
            uid: j.uid,
            content: j.content
        }));

        const prompt = `Você é um revisor sênior do CFBench. Sua tarefa é verificar se CADA constraint do turn_metadata está EXPLICITAMENTE mencionado no texto da user query.

## REGRA CRÍTICA
Todos os constraints do turn_metadata DEVEM aparecer de forma EXPLÍCITA no texto da user query.
- "Explícito" significa que o usuário PEDIU isso claramente no texto
- NÃO conta se está apenas implícito ou se poderia ser inferido
- NÃO conta se aparece apenas no JSON/metadata mas não no texto corrido

## IMPORTANTE - NÚMEROS POR EXTENSO
Os números podem aparecer POR EXTENSO no idioma do texto! Você DEVE reconhecer:
- Italiano: "trecentottantacinque" = 385, "cinque" = 5, "quattro" = 4, "sei" = 6
- Português: "trezentos e oitenta e cinco" = 385, "cinco" = 5
- Espanhol: "trescientos ochenta y cinco" = 385, "cinco" = 5
- Alemão: "dreihundertfünfundachtzig" = 385, "fünf" = 5

Se o constraint pede 385 palavras e o texto diz "trecentottantacinque parole", isso CONTA como explícito!

## TIPOS DE CONSTRAINT QUE DEVEM ESTAR NO TEXTO:

### Constraints de Formato (DEVEM estar explícitos):
- no_comma → deve pedir "sem vírgulas", "non usare virgole", "senza virgole", etc.
- num_words → deve mencionar o número de palavras (NUMÉRICO OU POR EXTENSO)
- num_paragraphs → deve mencionar o número de parágrafos (NUMÉRICO OU POR EXTENSO)
- num_sentences → deve mencionar o número de frases
- keyword_frequency → deve pedir a palavra E quantas vezes usar
- keywords:existence → deve PEDIR EXPLICITAMENTE para usar as palavras específicas (não basta mencionar no contexto)
- first_word/last_word → deve especificar qual palavra iniciar/terminar
- bullet_list/numbered_list → deve pedir formato de lista
- json_format → deve pedir formato JSON

### Constraints de Estilo (LLM Eval - verificar se estão pedidos):
- grammatical_mood → deve especificar o modo verbal (indicativo, imperativo, congiuntivo, etc.)
  Exemplos válidos: "usa solo il modo indicativo", "utilizza esclusivamente l'indicativo", "scrivi in modo indicativo"
- tone → deve mencionar o tom desejado
- formality_level → deve indicar nível de formalidade

### llm_judge (DEVEM estar no texto como pedido natural):
- Cada item do llm_judge deve aparecer como uma solicitação natural no texto

## ATENÇÃO ESPECIAL: keywords:existence
Este constraint é DIFERENTE - o texto deve PEDIR EXPLICITAMENTE para usar essas palavras.
- ✗ ERRADO: as palavras aparecem no contexto/cenário mas não são pedidas
- ✓ CORRETO: "usa le parole X, Y, Z" ou "includi i termini: X, Y, Z"

## CONSTRAINTS A VERIFICAR:
${constraintList.map(c => `${c.index}. [${c.id}] ${c.details}`).join('\n')}

## LLM_JUDGE A VERIFICAR:
${llmJudgeList.length > 0 ? llmJudgeList.map(j => `- UID ${j.uid}: "${j.content}"`).join('\n') : 'Nenhum'}

## USER QUERY (texto a analisar):
---
${userQuery}
---

## SUA ANÁLISE:
Para CADA constraint acima, verifique:
1. Está explicitamente pedido no texto da query?
2. Se sim, qual trecho do texto comprova?
3. Se não, é um ERRO CRÍTICO (constraint escondido)

Responda em JSON:
{
  "total_constraints": número,
  "explicit_in_query": número,
  "hidden_constraints": [
    {
      "id": "instruction_id",
      "details": "o que deveria estar no texto",
      "status": "MISSING" | "IMPLICIT" | "FOUND",
      "evidence": "trecho do texto que comprova OU 'não encontrado'"
    }
  ],
  "llm_judge_check": [
    {
      "uid": número,
      "content": "conteúdo do llm_judge",
      "found_in_query": true/false,
      "evidence": "trecho ou 'não encontrado'"
    }
  ],
  "critical_issues": ["lista de constraints escondidos - ERRO CRÍTICO"],
  "warnings": ["lista de constraints que poderiam ser mais explícitos"],
  "overall_valid": true/false,
  "summary": "resumo em português da análise"
}`;

        const response = await this.callGemini(prompt, { maxTokens: 3000 });
        return this.parseJSONResponse(response.text);
    }

    /**
     * Parse JSON from API response
     */
    parseJSONResponse(text) {
        // Try to extract JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) {
                console.warn('Failed to parse JSON response:', e);
                return { error: 'Failed to parse response', raw: text };
            }
        }
        return { error: 'No JSON found in response', raw: text };
    }

    /**
     * Get remaining daily calls
     */
    getRemainingCalls() {
        return this.DAILY_LIMIT - this.dailyCallCount;
    }

    /**
     * Reset daily counter (call at midnight or manually)
     */
    resetDailyCounter() {
        this.dailyCallCount = 0;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.APIHandler = APIHandler;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIHandler;
}
