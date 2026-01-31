/**
 * CFBench Notebook Parser
 * Parses Jupyter notebooks (.ipynb) and extracts key components for validation
 */

class NotebookParser {
    constructor() {
        this.notebook = null;
        this.parsed = null;
    }

    /**
     * Parse a notebook file from File input (.ipynb or .py)
     * @param {File} file - The .ipynb or .py file
     * @returns {Promise<Object>} Parsed notebook structure
     */
    async parseFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target.result;

                    if (file.name.endsWith('.py')) {
                        // Parse Python file (Colab export format)
                        this.notebook = this.convertPyToNotebook(content);
                    } else {
                        // Parse JSON notebook
                        this.notebook = JSON.parse(content);
                    }

                    this.parsed = this.extractComponents();
                    resolve(this.parsed);
                } catch (error) {
                    reject(new Error(`Failed to parse notebook: ${error.message}`));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Convert Colab .py export to notebook format
     * Colab exports notebooks as a single docstring with markdown tags like **[system]**, **[user]**, etc.
     * @param {string} pyContent - The .py file content
     * @returns {Object} Notebook-like structure
     */
    convertPyToNotebook(pyContent) {
        const cells = [];

        // Extract content from docstring (between """ and """)
        const docstringMatch = pyContent.match(/"""([\s\S]*?)"""/);
        if (!docstringMatch) {
            throw new Error('Could not find docstring content in .py file');
        }

        const content = docstringMatch[1];

        // Split by cell markers: **[tag]** or # Tag (markdown headers)
        // Tags: [system], [user], [thinking], [assistant], [turn_metadata], [validator_assistant], [validator_human]
        // Also handle model pass tags like [thinking_qwen3_1], [assistant_nemotron_2], etc.
        const cellPattern = /(?:^|\n)\s*(?:\*\*\[([^\]]+)\]\*\*|#\s*(Metadata))/gi;

        let lastIndex = 0;
        let match;
        let matches = [];

        // Find all tag positions
        while ((match = cellPattern.exec(content)) !== null) {
            matches.push({
                tag: (match[1] || match[2]).toLowerCase(),
                index: match.index,
                fullMatch: match[0]
            });
        }

        // Extract cells between tags
        for (let i = 0; i < matches.length; i++) {
            const current = matches[i];
            const next = matches[i + 1];

            const startIndex = current.index + current.fullMatch.length;
            const endIndex = next ? next.index : content.length;

            let cellContent = content.substring(startIndex, endIndex).trim();

            // Create cell
            cells.push({
                cell_type: 'markdown',
                source: `**[${current.tag}]**\n\n${cellContent}`.split('\n').map((line, idx, arr) =>
                    idx < arr.length - 1 ? line + '\n' : line
                )
            });
        }

        // If no cells were found, try alternate parsing
        if (cells.length === 0) {
            // Just create one big cell with all content
            cells.push({
                cell_type: 'markdown',
                source: content.split('\n').map((line, idx, arr) =>
                    idx < arr.length - 1 ? line + '\n' : line
                )
            });
        }

        return { cells: cells };
    }

    /**
     * Parse notebook from JSON string
     * @param {string} jsonString - The notebook content as JSON string
     * @returns {Object} Parsed notebook structure
     */
    parseJSON(jsonString) {
        try {
            this.notebook = JSON.parse(jsonString);
            this.parsed = this.extractComponents();
            return this.parsed;
        } catch (error) {
            throw new Error(`Failed to parse notebook: ${error.message}`);
        }
    }

    /**
     * Extract all components from the notebook
     * SIMPLIFIED LOGIC:
     * 1. Find turn_metadata cell first
     * 2. The [user] immediately BEFORE turn_metadata is the FINAL user query
     * 3. All other [user] cells are intermediate turns
     * @returns {Object} Structured components
     */
    extractComponents() {
        if (!this.notebook || !this.notebook.cells) {
            throw new Error('Invalid notebook structure');
        }

        const components = {
            metadata: null,
            system: null,
            turns: [],
            finalTurn: {
                user: null,
                turnMetadata: null,
                thinking: null,
                assistant: null,
                validatorAssistant: null,
                validatorHuman: null
            },
            modelPasses: [],
            cellOrder: [],
            rawCells: this.notebook.cells
        };

        // STEP 1: Find all cells and their types
        const cellsWithTypes = [];
        for (let i = 0; i < this.notebook.cells.length; i++) {
            const cell = this.notebook.cells[i];
            const source = this.getCellSource(cell);
            const cellType = this.identifyCellType(source);
            cellsWithTypes.push({
                index: i,
                source: source,
                cellType: cellType
            });
            components.cellOrder.push({
                index: i,
                type: cellType,
                preview: source.substring(0, 100)
            });
        }

        // STEP 2: Find turn_metadata index
        const turnMetadataIndex = cellsWithTypes.findIndex(c => c.cellType.type === 'turn_metadata');

        // STEP 3: Find ALL user cells
        const userCells = cellsWithTypes.filter(c => c.cellType.type === 'user' && !c.cellType.isModelPass);

        // STEP 4: The LAST user cell (or the one before turn_metadata) is the final user query
        let finalUserIndex = -1;
        if (turnMetadataIndex !== -1) {
            // Find the user cell closest to (but before) turn_metadata
            for (let i = turnMetadataIndex - 1; i >= 0; i--) {
                if (cellsWithTypes[i].cellType.type === 'user' && !cellsWithTypes[i].cellType.isModelPass) {
                    finalUserIndex = i;
                    break;
                }
            }
        }
        // Fallback: if no turn_metadata or no user before it, use the last user cell
        if (finalUserIndex === -1 && userCells.length > 0) {
            finalUserIndex = userCells[userCells.length - 1].index;
        }

        // STEP 5: Process all cells with correct final turn detection
        let currentTurn = null;
        let afterFinalUser = false;

        for (const cellData of cellsWithTypes) {
            const { index, source, cellType } = cellData;
            const isFinalUserCell = (index === finalUserIndex);

            switch (cellType.type) {
                case 'metadata':
                    components.metadata = this.parseMetadataCell(source);
                    break;

                case 'system':
                    components.system = this.parseSystemCell(source);
                    break;

                case 'user':
                    if (cellType.isModelPass) {
                        // Model passes don't have user cells
                    } else if (isFinalUserCell) {
                        // This is THE final turn user (the challenging query)
                        afterFinalUser = true;
                        components.finalTurn.user = this.parseUserCell(source);
                    } else {
                        // Intermediate turn - save previous turn if exists
                        if (currentTurn && currentTurn.assistant) {
                            components.turns.push(currentTurn);
                        }
                        currentTurn = {
                            user: this.parseUserCell(source),
                            thinking: null,
                            assistant: null
                        };
                    }
                    break;

                case 'thinking':
                    if (cellType.isModelPass) {
                        const passIndex = this.getModelPassIndex(components.modelPasses, cellType.model, cellType.passNumber);
                        if (passIndex !== -1) {
                            components.modelPasses[passIndex].thinking = this.parseThinkingCell(source);
                        } else {
                            components.modelPasses.push({
                                model: cellType.model,
                                passNumber: cellType.passNumber,
                                thinking: this.parseThinkingCell(source),
                                assistant: null,
                                validatorAssistant: null,
                                validatorHuman: null
                            });
                        }
                    } else if (afterFinalUser) {
                        components.finalTurn.thinking = this.parseThinkingCell(source);
                    } else if (currentTurn) {
                        // Pass true for intermediate turns to store full content for AI analysis
                        currentTurn.thinking = this.parseThinkingCell(source, true);
                    }
                    break;

                case 'assistant':
                    if (cellType.isModelPass) {
                        const passIndex = this.getModelPassIndex(components.modelPasses, cellType.model, cellType.passNumber);
                        if (passIndex !== -1) {
                            components.modelPasses[passIndex].assistant = this.parseAssistantCell(source);
                        } else {
                            // Create new model pass if not exists
                            components.modelPasses.push({
                                model: cellType.model,
                                passNumber: cellType.passNumber,
                                thinking: null,
                                assistant: this.parseAssistantCell(source),
                                validatorAssistant: null,
                                validatorHuman: null
                            });
                        }
                    } else if (afterFinalUser) {
                        components.finalTurn.assistant = this.parseAssistantCell(source);
                    } else if (currentTurn) {
                        currentTurn.assistant = this.parseAssistantCell(source);
                        // Don't push yet - wait for next user or final
                    }
                    break;

                case 'turn_metadata':
                    components.finalTurn.turnMetadata = this.parseTurnMetadataCell(source);
                    // Push any remaining intermediate turn
                    if (currentTurn && currentTurn.assistant) {
                        components.turns.push(currentTurn);
                        currentTurn = null;
                    }
                    break;

                case 'validator_assistant':
                    if (cellType.isModelPass) {
                        const passIndex = this.getModelPassIndex(components.modelPasses, cellType.model, cellType.passNumber);
                        if (passIndex !== -1) {
                            components.modelPasses[passIndex].validatorAssistant = this.parseValidatorCell(source);
                        }
                    } else {
                        components.finalTurn.validatorAssistant = this.parseValidatorCell(source);
                    }
                    break;

                case 'validator_human':
                    if (cellType.isModelPass) {
                        const passIndex = this.getModelPassIndex(components.modelPasses, cellType.model, cellType.passNumber);
                        if (passIndex !== -1) {
                            components.modelPasses[passIndex].validatorHuman = this.parseValidatorCell(source);
                        }
                    } else {
                        components.finalTurn.validatorHuman = this.parseValidatorCell(source);
                    }
                    break;
            }
        }

        // Final cleanup: push last intermediate turn if not pushed
        if (currentTurn && currentTurn.assistant && !afterFinalUser) {
            components.turns.push(currentTurn);
        }

        return components;
    }

    /**
     * Get cell source as string
     */
    getCellSource(cell) {
        if (Array.isArray(cell.source)) {
            return cell.source.join('');
        }
        return cell.source || '';
    }

    /**
     * Identify the type of cell based on content
     */
    identifyCellType(source) {
        const lowerSource = source.toLowerCase();

        // Check for model pass patterns first
        const modelPassMatch = source.match(/\[(thinking|assistant|validator_assistant|validator_human)_(nemotron|qwen3?)_(\d+)\]/i);
        if (modelPassMatch) {
            return {
                type: modelPassMatch[1].toLowerCase(),
                isModelPass: true,
                model: modelPassMatch[2].toLowerCase(),
                passNumber: parseInt(modelPassMatch[3])
            };
        }

        // Check for standard cell types
        if (source.includes('# Metadata') || source.match(/\*\*Domain:\*\*/i)) {
            return { type: 'metadata', isModelPass: false };
        }
        if (source.match(/\*\*\[system\]\*\*/i) || source.match(/^\[system\]/i)) {
            return { type: 'system', isModelPass: false };
        }
        if (source.match(/\*\*\[user\]\*\*/i) || source.match(/^\[user\]/i)) {
            return { type: 'user', isModelPass: false };
        }
        if (source.match(/\*\*\[thinking\]\*\*/i) || source.match(/^\[thinking\]/i)) {
            return { type: 'thinking', isModelPass: false };
        }
        if (source.match(/\*\*\[assistant\]\*\*/i) || source.match(/^\[assistant\]/i)) {
            return { type: 'assistant', isModelPass: false };
        }
        if (source.match(/\*\*\[turn_metadata\]\*\*/i) || source.match(/^\[turn_metadata\]/i)) {
            return { type: 'turn_metadata', isModelPass: false };
        }
        if (source.match(/\*\*\[validator_assistant\]\*\*/i) || source.match(/^\[validator_assistant\]/i)) {
            return { type: 'validator_assistant', isModelPass: false };
        }
        if (source.match(/\*\*\[validator_human\]\*\*/i) || source.match(/^\[validator_human\]/i)) {
            return { type: 'validator_human', isModelPass: false };
        }

        return { type: 'unknown', isModelPass: false };
    }

    /**
     * Check if next cell is turn_metadata (to identify final turn)
     */
    isNextCellTurnMetadata(currentIndex) {
        for (let i = currentIndex + 1; i < this.notebook.cells.length && i <= currentIndex + 3; i++) {
            const source = this.getCellSource(this.notebook.cells[i]);
            if (source.match(/\[turn_metadata\]/i)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get model pass index in array
     */
    getModelPassIndex(modelPasses, model, passNumber) {
        return modelPasses.findIndex(p => p.model === model && p.passNumber === passNumber);
    }

    /**
     * Parse metadata cell
     */
    parseMetadataCell(source) {
        const metadata = {
            domain: this.extractField(source, 'Domain'),
            l1Taxonomy: this.extractField(source, 'L1 Taxonomy'),
            l2Taxonomy: this.extractField(source, 'L2 Taxonomy'),
            l3Taxonomy: this.extractField(source, 'L3 Taxonomy'),
            useCase: this.extractField(source, 'Use Case'),
            language: this.extractField(source, 'Language'),
            systemPromptLength: this.extractField(source, 'System Prompt Length'),
            userPromptLength: this.extractField(source, 'User Prompt Length'),
            numberOfTurns: this.extractField(source, 'Number of Turns'),
            scenario: this.extractField(source, 'Scenario'),
            raw: source
        };
        return metadata;
    }

    /**
     * Extract field value from metadata
     */
    extractField(source, fieldName) {
        const regex = new RegExp(`\\*\\*${fieldName}:\\*\\*[\\s-]*([^\\n*]+)`, 'i');
        const match = source.match(regex);
        return match ? match[1].trim() : null;
    }

    /**
     * Parse system cell
     */
    parseSystemCell(source) {
        // Remove the [system] marker
        const content = source.replace(/\*\*\[system\]\*\*/i, '').replace(/^\[system\]/i, '').trim();
        return {
            content: content,
            wordCount: this.countWords(content),
            hasRole: /role|objetivo|funzione|ruolo/i.test(content),
            hasTone: /tone|stile|tono/i.test(content),
            hasFormat: /format|formato|output/i.test(content),
            raw: source
        };
    }

    /**
     * Parse user cell
     */
    parseUserCell(source) {
        const content = source.replace(/\*\*\[user\]\*\*/i, '').replace(/^\[user\]/i, '').trim();
        return {
            content: content,
            wordCount: this.countWords(content),
            charCount: content.length,
            raw: source
        };
    }

    /**
     * Parse thinking cell - OPTIMIZED: only store metadata, not full content
     * Thinking cells can be huge (10k+ words) - we only need to verify they exist
     * For intermediate turns, optionally store full content for AI analysis
     * @param {string} source - The cell source content
     * @param {boolean} isIntermediateTurn - If true, store full content for AI analysis
     */
    parseThinkingCell(source, isIntermediateTurn = false) {
        const content = source.replace(/\*\*\[thinking[^\]]*\]\*\*/i, '').replace(/^\[thinking[^\]]*\]/i, '').trim();

        const result = {
            exists: true,
            preview: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
            wordCount: this.countWords(content),
            charCount: content.length,
            hasFirstPerson: /\b(I|io|ich|je|yo)\b/i.test(content.substring(0, 500)), // Check only first 500 chars
        };

        // Store full content for intermediate turns (for AI analysis)
        if (isIntermediateTurn) {
            // Truncate if extremely large to avoid token limits (max 100k chars)
            const maxChars = 100000;
            if (content.length > maxChars) {
                result.content = content.substring(0, maxChars);
                result.truncated = true;
                result.originalLength = content.length;
            } else {
                result.content = content;
            }
        }

        return result;
    }

    /**
     * Parse assistant cell
     */
    parseAssistantCell(source) {
        const content = source.replace(/\*\*\[assistant[^\]]*\]\*\*/i, '').replace(/^\[assistant[^\]]*\]/i, '').trim();
        return {
            content: content,
            wordCount: this.countWords(content),
            charCount: content.length,
            sentenceCount: this.countSentences(content),
            paragraphCount: this.countParagraphs(content),
            raw: source
        };
    }

    /**
     * Parse turn_metadata cell
     */
    parseTurnMetadataCell(source) {
        // Extract JSON from the cell
        const jsonMatch = source.match(/```json\s*([\s\S]*?)\s*```/);
        if (!jsonMatch) {
            // Try without code block
            const jsonStart = source.indexOf('{');
            const jsonEnd = source.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1) {
                try {
                    const json = JSON.parse(source.substring(jsonStart, jsonEnd + 1));
                    return this.processTurnMetadata(json, source);
                } catch (e) {
                    return { error: 'Failed to parse turn_metadata JSON', raw: source };
                }
            }
            return { error: 'No JSON found in turn_metadata', raw: source };
        }

        try {
            const json = JSON.parse(jsonMatch[1]);
            return this.processTurnMetadata(json, source);
        } catch (e) {
            return { error: `Failed to parse JSON: ${e.message}`, raw: source };
        }
    }

    /**
     * Process turn_metadata JSON
     */
    processTurnMetadata(json, raw) {
        const instructions = json.instructions || [];
        const llmJudge = json.llm_judge || [];

        // Categorize instructions
        const ifInstructions = instructions.filter(i => !i.instruction_id?.startsWith('stylistic:') &&
                                                        !i.instruction_id?.startsWith('linguistic:') &&
                                                        !i.instruction_id?.startsWith('situation:'));
        const llmEvalInstructions = instructions.filter(i => i.instruction_id?.startsWith('stylistic:') ||
                                                              i.instruction_id?.startsWith('linguistic:') ||
                                                              i.instruction_id?.startsWith('situation:'));

        return {
            language: json.language,
            metadata: json.metadata,
            instructions: instructions,
            ifInstructions: ifInstructions,
            llmEvalInstructions: llmEvalInstructions,
            llmJudge: llmJudge,
            ifCount: ifInstructions.length,
            llmEvalCount: llmEvalInstructions.length,
            llmJudgeCount: llmJudge.length,
            json: json,
            raw: raw
        };
    }

    /**
     * Parse validator cell
     */
    parseValidatorCell(source) {
        const jsonMatch = source.match(/```json\s*([\s\S]*?)\s*```/);
        if (!jsonMatch) {
            const jsonStart = source.indexOf('[');
            const jsonEnd = source.lastIndexOf(']');
            if (jsonStart !== -1 && jsonEnd !== -1) {
                try {
                    const json = JSON.parse(source.substring(jsonStart, jsonEnd + 1));
                    return this.processValidator(json, source);
                } catch (e) {
                    return { error: 'Failed to parse validator JSON', raw: source };
                }
            }
            return { error: 'No JSON found in validator', raw: source };
        }

        try {
            const json = JSON.parse(jsonMatch[1]);
            return this.processValidator(json, source);
        } catch (e) {
            return { error: `Failed to parse JSON: ${e.message}`, raw: source };
        }
    }

    /**
     * Process validator JSON
     */
    processValidator(json, raw) {
        const passed = json.filter(item => item.status === 'Passed').length;
        const failed = json.filter(item => item.status === 'Failed').length;

        return {
            checks: json,
            totalChecks: json.length,
            passed: passed,
            failed: failed,
            allPassed: failed === 0,
            raw: raw
        };
    }

    /**
     * Count words in text
     */
    countWords(text) {
        return text.split(/\s+/).filter(w => w.length > 0).length;
    }

    /**
     * Count sentences in text
     */
    countSentences(text) {
        return text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    }

    /**
     * Count paragraphs in text
     */
    countParagraphs(text) {
        return text.split(/\n\n+/).filter(p => p.trim().length > 0).length;
    }

    /**
     * Get summary of parsed notebook
     */
    getSummary() {
        if (!this.parsed) return null;

        return {
            domain: this.parsed.metadata?.domain,
            language: this.parsed.metadata?.language,
            numberOfTurns: this.parsed.turns.length,
            hasSystem: !!this.parsed.system,
            hasFinalTurn: !!this.parsed.finalTurn.user,
            hasTurnMetadata: !!this.parsed.finalTurn.turnMetadata,
            hasGoldenResponse: !!this.parsed.finalTurn.assistant,
            hasGoldenValidators: !!this.parsed.finalTurn.validatorAssistant && !!this.parsed.finalTurn.validatorHuman,
            modelPassCount: this.parsed.modelPasses.length,
            ifInstructionCount: this.parsed.finalTurn.turnMetadata?.ifCount || 0,
            llmEvalCount: this.parsed.finalTurn.turnMetadata?.llmEvalCount || 0,
            llmJudgeCount: this.parsed.finalTurn.turnMetadata?.llmJudgeCount || 0
        };
    }
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.NotebookParser = NotebookParser;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotebookParser;
}
