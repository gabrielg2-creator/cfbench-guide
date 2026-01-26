/**
 * Simple Constraint Checker
 * Verifies if constraints from turn_metadata appear in user query / system prompt
 */

class SimpleChecker {
    check(parsed) {
        const results = {
            userConstraints: [],
            systemConstraints: [],
            summary: { pass: 0, fail: 0, total: 0 }
        };

        if (!parsed.turnMetadata || !parsed.turnMetadata.instructions) {
            return results;
        }

        const instructions = parsed.turnMetadata.instructions;
        const userQuery = parsed.lastUserQuery || '';
        const systemPrompt = parsed.system || '';

        for (const inst of instructions) {
            const source = inst.source || 'user';
            const textToSearch = source === 'system' ? systemPrompt : userQuery;

            const checkResult = this.checkConstraint(inst, textToSearch);

            if (source === 'system') {
                results.systemConstraints.push(checkResult);
            } else {
                results.userConstraints.push(checkResult);
            }

            results.summary.total++;
            if (checkResult.status === 'PASS') {
                results.summary.pass++;
            } else {
                results.summary.fail++;
            }
        }

        // Also check llm_judge
        if (parsed.turnMetadata.llm_judge) {
            for (const judge of parsed.turnMetadata.llm_judge) {
                const checkResult = this.checkLLMJudge(judge, userQuery);
                results.userConstraints.push(checkResult);
                results.summary.total++;
                if (checkResult.status === 'PASS') {
                    results.summary.pass++;
                } else {
                    results.summary.fail++;
                }
            }
        }

        return results;
    }

    checkConstraint(inst, text) {
        const id = inst.instruction_id || 'unknown';
        const textLower = text.toLowerCase();

        // Build human-readable description
        const desc = this.buildDescription(inst);

        // What to search for
        const searchTerms = this.getSearchTerms(inst);

        // Search in text
        let found = false;
        let quote = 'Not found';

        for (const term of searchTerms) {
            const result = this.findInText(text, term);
            if (result.found) {
                found = true;
                quote = result.quote;
                break;
            }
        }

        return {
            id: id,
            description: desc,
            source: inst.source || 'user',
            status: found ? 'PASS' : 'FAIL',
            quote: quote
        };
    }

    checkLLMJudge(judge, text) {
        // LLM Judge content should appear naturally in the query
        const content = judge.content || '';
        const keywords = this.extractKeywords(content);

        let foundCount = 0;
        let quotes = [];

        for (const kw of keywords) {
            const result = this.findInText(text, kw);
            if (result.found) {
                foundCount++;
                quotes.push(result.quote);
            }
        }

        const found = foundCount >= Math.ceil(keywords.length * 0.5); // At least 50% of keywords

        return {
            id: `llm_judge_${judge.uid}`,
            description: `LLM Judge: "${content.substring(0, 50)}..."`,
            source: 'user',
            status: found ? 'PASS' : 'FAIL',
            quote: found ? quotes[0] : 'LLM Judge requirement not found in query'
        };
    }

    buildDescription(inst) {
        const id = inst.instruction_id || '';

        if (inst.num_words) return `Word Count (${inst.relation || '='} ${inst.num_words})`;
        if (inst.num_unique) return `Unique Words (${inst.relation || '='} ${inst.num_unique})`;
        if (inst.num_chars) return `Character Count (${inst.relation || '='} ${inst.num_chars})`;
        if (inst.num_sentences) return `Sentence Count (${inst.relation || '≥'} ${inst.num_sentences})`;
        if (inst.num_paragraphs) return `Paragraph Count (${inst.relation || '='} ${inst.num_paragraphs})`;
        if (inst.keyword && inst.frequency) return `Keyword "${inst.keyword.trim()}" × ${inst.frequency}`;
        if (inst.keywords) return `Keywords: ${inst.keywords.join(', ')}`;
        if (inst.first_word) return `First Word: "${inst.first_word}"`;
        if (inst.last_word) return `Last Word: "${inst.last_word}"`;
        if (inst.mood_type) return `Grammatical Mood: ${inst.mood_type}`;
        if (inst.tone_level) return `Tone: ${inst.tone_level}`;
        if (inst.forbidden_words) return `Forbidden: ${inst.forbidden_words.join(', ')}`;

        // Generic from ID
        return id.replace(/_/g, ' ').replace(/:/g, ': ');
    }

    getSearchTerms(inst) {
        const terms = [];

        // Number values (also written in words for Italian)
        if (inst.num_words) {
            terms.push(String(inst.num_words));
            terms.push(this.numberToItalian(inst.num_words));
        }
        if (inst.num_unique) {
            terms.push(String(inst.num_unique));
            terms.push(this.numberToItalian(inst.num_unique));
            terms.push('parole uniche');
            terms.push('unique words');
        }
        if (inst.num_chars) {
            terms.push(String(inst.num_chars));
            terms.push(this.numberToItalian(inst.num_chars));
        }
        if (inst.num_sentences) {
            terms.push(String(inst.num_sentences));
            terms.push(this.numberToItalian(inst.num_sentences));
        }
        if (inst.num_paragraphs) {
            terms.push(String(inst.num_paragraphs));
            terms.push(this.numberToItalian(inst.num_paragraphs));
            terms.push('sezioni');
            terms.push('paragrafi');
        }

        // Keywords
        if (inst.keyword) {
            terms.push(inst.keyword.trim());
        }
        if (inst.keywords) {
            terms.push(...inst.keywords);
        }

        // First/last word
        if (inst.first_word) terms.push(inst.first_word);
        if (inst.last_word) terms.push(inst.last_word);

        // Mood/tone
        if (inst.mood_type) {
            terms.push(inst.mood_type);
            // Italian equivalents
            if (inst.mood_type.toLowerCase() === 'indicative') {
                terms.push('indicativo', 'dichiarativo');
            }
            if (inst.mood_type.toLowerCase() === 'imperative') {
                terms.push('imperativo');
            }
        }
        if (inst.tone_level) {
            terms.push(inst.tone_level);
            if (inst.tone_level.toLowerCase() === 'neutral') {
                terms.push('neutro', 'neutrale');
            }
            if (inst.tone_level.toLowerCase() === 'formal') {
                terms.push('formale');
            }
        }

        // Forbidden words - check they DON'T exist
        if (inst.forbidden_words) {
            // For forbidden, we need inverse logic (handled separately)
            terms.push(...inst.forbidden_words);
        }

        return terms.filter(t => t && t.length > 0);
    }

    findInText(text, searchTerm) {
        if (!searchTerm || !text) {
            return { found: false, quote: 'Not found' };
        }

        const textLower = text.toLowerCase();
        const termLower = searchTerm.toLowerCase().trim();

        const index = textLower.indexOf(termLower);

        if (index === -1) {
            return { found: false, quote: 'Not found' };
        }

        // Extract surrounding context (quote)
        const start = Math.max(0, index - 40);
        const end = Math.min(text.length, index + termLower.length + 40);

        let quote = text.substring(start, end).trim();
        if (start > 0) quote = '...' + quote;
        if (end < text.length) quote = quote + '...';

        return { found: true, quote: `"${quote}"` };
    }

    numberToItalian(num) {
        // Basic Italian numbers for common values
        const units = ['', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'];
        const teens = ['dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
        const tens = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];
        const hundreds = ['', 'cento', 'duecento', 'trecento', 'quattrocento', 'cinquecento', 'seicento', 'settecento', 'ottocento', 'novecento'];

        if (num < 10) return units[num];
        if (num < 20) return teens[num - 10];
        if (num < 100) {
            const t = Math.floor(num / 10);
            const u = num % 10;
            return tens[t] + (u > 0 ? units[u] : '');
        }
        if (num < 1000) {
            const h = Math.floor(num / 100);
            const rest = num % 100;
            return hundreds[h] + (rest > 0 ? this.numberToItalian(rest) : '');
        }

        return String(num); // Fallback
    }

    extractKeywords(text) {
        // Extract meaningful words from text
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 4); // Only words > 4 chars

        return [...new Set(words)].slice(0, 5); // Max 5 unique keywords
    }
}

// Export
if (typeof window !== 'undefined') {
    window.SimpleChecker = SimpleChecker;
}
