/**
 * Simple CFBench Parser
 * Extracts only what we need: system, last user query, turn_metadata
 */

class SimpleParser {
    parse(content) {
        const result = {
            system: null,
            lastUserQuery: null,
            turnMetadata: null,
            goldenResponse: null,
            error: null
        };

        try {
            // Extract all cells by their tags
            const cells = this.extractCells(content);

            // Find system prompt
            const systemCell = cells.find(c => c.type === 'system');
            if (systemCell) {
                result.system = systemCell.content;
            }

            // Find turn_metadata
            const metadataCell = cells.find(c => c.type === 'turn_metadata');
            if (metadataCell) {
                result.turnMetadata = this.parseJSON(metadataCell.content);
            }

            // Find ALL user cells, take the LAST one (that's the final query)
            const userCells = cells.filter(c => c.type === 'user');
            if (userCells.length > 0) {
                result.lastUserQuery = userCells[userCells.length - 1].content;
            }

            // Find golden response (assistant after turn_metadata or last assistant before model passes)
            const assistantCells = cells.filter(c => c.type === 'assistant');
            // The golden is usually the first assistant after the last user query
            // or we can find it by position relative to turn_metadata
            if (assistantCells.length > 0) {
                // Find assistant that comes after turn_metadata
                const metadataIndex = cells.findIndex(c => c.type === 'turn_metadata');
                if (metadataIndex !== -1) {
                    const goldenCell = cells.find((c, i) => c.type === 'assistant' && i > metadataIndex);
                    if (goldenCell) {
                        result.goldenResponse = goldenCell.content;
                    }
                }
                // Fallback: take the first non-model-pass assistant after last user
                if (!result.goldenResponse) {
                    const lastUserIndex = cells.lastIndexOf(userCells[userCells.length - 1]);
                    const goldenCell = cells.find((c, i) => c.type === 'assistant' && i > lastUserIndex && !c.isModelPass);
                    if (goldenCell) {
                        result.goldenResponse = goldenCell.content;
                    }
                }
            }

        } catch (e) {
            result.error = e.message;
        }

        return result;
    }

    extractCells(content) {
        const cells = [];

        // Pattern to find cell markers: **[type]** or **[type_model_N]**
        const cellPattern = /\*\*\[([^\]]+)\]\*\*/gi;
        let match;
        const markers = [];

        while ((match = cellPattern.exec(content)) !== null) {
            markers.push({
                type: match[1].toLowerCase(),
                index: match.index,
                length: match[0].length
            });
        }

        // Extract content between markers
        for (let i = 0; i < markers.length; i++) {
            const current = markers[i];
            const next = markers[i + 1];

            const startIndex = current.index + current.length;
            const endIndex = next ? next.index : content.length;

            let cellContent = content.substring(startIndex, endIndex).trim();

            // Determine cell type
            let type = current.type;
            let isModelPass = false;

            // Check if it's a model pass (e.g., assistant_nemotron_1)
            if (type.includes('_nemotron_') || type.includes('_qwen')) {
                isModelPass = true;
                if (type.startsWith('assistant_')) type = 'assistant';
                else if (type.startsWith('thinking_')) type = 'thinking';
                else if (type.startsWith('validator_')) type = 'validator';
            }

            cells.push({
                type: type,
                content: cellContent,
                isModelPass: isModelPass,
                rawType: current.type
            });
        }

        return cells;
    }

    parseJSON(content) {
        // Try to find JSON in the content
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) {
                // Try to fix common JSON issues
                let fixed = jsonMatch[0]
                    .replace(/,\s*}/g, '}')
                    .replace(/,\s*]/g, ']');
                try {
                    return JSON.parse(fixed);
                } catch (e2) {
                    return null;
                }
            }
        }
        return null;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.SimpleParser = SimpleParser;
}
