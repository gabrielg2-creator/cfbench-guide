/**
 * NVIDIA Validator - Ported from Python
 * Source: NVIDIA-parser/src/validators/validator.py
 *
 * This file contains deterministic validation functions for CFBench constraints.
 * These run in JavaScript (no API calls) for accurate counting/checking.
 */

// === HELPER FUNCTIONS ===

function countNumberedItems(response) {
    return (response.match(/^\s*\d+\./gm) || []).length;
}

function countBulletPoints(response) {
    return (response.match(/^[*-]\s/gm) || []).length;
}

function countPlaceholders(response) {
    return (response.match(/\[.*?\]/g) || []).length;
}

function countAllCapsWords(response) {
    return response.split(/\s+/).filter(w => w === w.toUpperCase() && /[A-Z]/.test(w)).length;
}

function countLowercaseWords(response) {
    return response.split(/\s+/).filter(w => w === w.toLowerCase() && /[a-z]/.test(w)).length;
}

/**
 * Count frequency of a keyword in response, ensuring it's a full word or phrase.
 * Ported from Python: keyword_frequency()
 * Fixed: Now works with Unicode/accented characters (Italian, Portuguese, etc.)
 */
function keywordFrequency(response, keyword) {
    if (!keyword || !response) return 0;
    keyword = keyword.trim();

    // Escape special regex characters
    const escapedTokens = keyword.split(/\s+/).map(t =>
        t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    const phrasePattern = escapedTokens.join('\\s+');

    // Use Unicode-aware word boundaries
    // \b doesn't work with accented characters like à, è, ì, ò, ù
    // Instead, use lookbehind/lookahead for non-letter characters or start/end
    // Pattern: (?<![a-zA-ZÀ-ÿ])keyword(?![a-zA-ZÀ-ÿ])
    try {
        // Modern browsers support lookbehind
        const pattern = new RegExp(`(?<![a-zA-ZÀ-ÿ])${phrasePattern}(?![a-zA-ZÀ-ÿ])`, 'gi');
        return (response.match(pattern) || []).length;
    } catch (e) {
        // Fallback for older browsers: use simpler approach
        // Convert to lowercase and count occurrences with space/punctuation boundaries
        const lowerResponse = response.toLowerCase();
        const lowerKeyword = keyword.toLowerCase();
        let count = 0;
        let pos = 0;

        while ((pos = lowerResponse.indexOf(lowerKeyword, pos)) !== -1) {
            const before = pos === 0 ? ' ' : lowerResponse[pos - 1];
            const after = pos + lowerKeyword.length >= lowerResponse.length ? ' ' : lowerResponse[pos + lowerKeyword.length];

            // Check if it's a word boundary (not a letter before/after)
            const isWordBoundaryBefore = !/[a-zA-ZÀ-ÿ]/.test(before);
            const isWordBoundaryAfter = !/[a-zA-ZÀ-ÿ]/.test(after);

            if (isWordBoundaryBefore && isWordBoundaryAfter) {
                count++;
            }
            pos++;
        }
        return count;
    }
}

/**
 * Extract clean sentences from text.
 * Removes markdown tables, horizontal rules, list markers.
 */
function extractCleanSentences(text) {
    if (!text) return [];

    // Remove markdown tables
    let cleaned = text.replace(/(?:^\s*\|.*\|.*\n){2,}/gm, '');
    // Remove horizontal rules
    cleaned = cleaned.replace(/^\s*([*_-])\s*\1\s*\1+\s*$/gm, '');

    const sentences = [];
    for (const line of cleaned.split('\n')) {
        // Remove list markers and heading markers
        let cleanedLine = line.trim().replace(/^\s*(?:[-*+]\s+|\d+\.\s+|#+\s+)/, '');
        if (!cleanedLine) continue;

        // Split by sentence-ending punctuation
        const parts = cleanedLine.split(/[.!?]+/);
        for (const s of parts) {
            const stripped = s.trim();
            if (stripped) sentences.push(stripped);
        }
    }
    return sentences;
}

/**
 * Extract clean words from response.
 * Removes numbered list markers.
 */
function extractCleanWords(response) {
    if (!response) return [];
    const text = response.replace(/^\s*\d+\.\s/gm, '');
    return (text.toLowerCase().match(/\b(?:[a-zA-Z0-9'-]+(?:\.[a-zA-Z0-9'-]+)?)\b/g) || []);
}

/**
 * Extract clean paragraphs from text.
 * Removes title tags, tables, headings, horizontal rules.
 */
function extractCleanParagraphs(text) {
    if (!text) return [];

    // Remove title tags <<...>>
    let cleaned = text.replace(/^\s*<<.*>>\s*$/gm, '');
    // Remove markdown tables
    cleaned = cleaned.replace(/(?:^\s*\|.*\|.*\n){2,}/gm, '');
    // Remove markdown headings
    cleaned = cleaned.replace(/^\s*#+\s+.*$/gm, '');
    // Remove horizontal rules
    cleaned = cleaned.replace(/^\s*([*_-])\s*\1\s*\1+\s*$/gm, '');

    if (!cleaned.trim()) return [];
    const paragraphs = cleaned.trim().split(/\n\s*\n/);
    return paragraphs.map(p => p.trim()).filter(p => p);
}

/**
 * Check if count satisfies the relation with value.
 */
function checkRelation(count, relation, value) {
    if (typeof value !== 'number') return false;

    switch(relation) {
        case 'at least':
        case '>=':
            return count >= value;
        case 'equal to':
        case '==':
        case '=':
            return count === value;
        case 'less than':
        case '<':
            return count < value;
        case 'at most':
        case '<=':
            return count <= value;
        default:
            return count === value;
    }
}

/**
 * Check if first letter of each word follows capitalization rule.
 */
function isFirstLetterCap(token) {
    if (!token) return true;
    const wordSeparators = ['/', "'", '-'];
    let firstAlphaSeen = false;

    for (const ch of token) {
        if (wordSeparators.includes(ch)) {
            firstAlphaSeen = false;
            continue;
        }
        if (/[a-zA-Z]/.test(ch)) {
            if (!firstAlphaSeen) {
                if (ch !== ch.toUpperCase()) return false;
                firstAlphaSeen = true;
            } else {
                if (ch !== ch.toLowerCase()) return false;
            }
        }
    }
    return true;
}

/**
 * Check alternating case pattern.
 */
function isStrictAlternating(word) {
    if (!word) return true;
    let lastUpper = null;
    for (const ch of word) {
        if (!/[a-zA-Z]/.test(ch)) continue;
        const isUpper = ch === ch.toUpperCase();
        if (lastUpper !== null && isUpper === lastUpper) return false;
        lastUpper = isUpper;
    }
    return true;
}

// === MAIN VALIDATOR FUNCTION ===

/**
 * Validate a response against a specific instruction type and its kwargs.
 * Returns { valid: boolean|null, note: string, semantic?: boolean }
 *
 * If semantic: true, the instruction requires LLM evaluation.
 */
function validateInstruction(response, instType, kwargs) {
    if (!response) response = '';
    response = response.trim();
    kwargs = kwargs || {};

    try {
        // === CHANGE CASE ===
        if (instType === 'change_case:all_caps') {
            const valid = response === response.toUpperCase() && /[A-Z]/.test(response);
            return { valid, note: valid ? 'OK' : 'Response is not all uppercase' };
        }

        if (instType === 'change_case:lowercase') {
            const valid = response === response.toLowerCase();
            return { valid, note: valid ? 'OK' : 'Response is not all lowercase' };
        }

        if (instType === 'change_case:alternating') {
            const words = response.split(/\s+/).filter(w => /[a-zA-Z]/.test(w));
            const valid = words.every(w => isStrictAlternating(w));
            return { valid, note: valid ? 'OK' : 'Response is not in alternating case' };
        }

        if (instType === 'change_case:first_letter_cap') {
            const tokens = response.split(/\s+/);
            const valid = tokens.every(t => isFirstLetterCap(t));
            return { valid, note: valid ? 'OK' : 'Not all words have first letter capitalized' };
        }

        if (instType === 'change_case:last_letter') {
            const caseType = kwargs.case || 'upper';

            if (caseType === 'special') {
                // Check if response ends with a special character
                const trimmed = response.trim();
                if (trimmed.length === 0) {
                    return { valid: false, note: 'Response is empty' };
                }
                const lastChar = trimmed[trimmed.length - 1];
                // Special character = not a letter and not a digit
                const isSpecial = !/[a-zA-ZÀ-ÿ0-9]/.test(lastChar);
                return { valid: isSpecial, note: isSpecial ? `OK - Last character '${lastChar}' is a special character` : `Last character '${lastChar}' is not a special character` };
            }

            // For upper/lower, find the last letter
            const letters = response.match(/[a-zA-ZÀ-ÿ]/g);
            if (!letters || letters.length === 0) {
                return { valid: false, note: 'No letters found in response' };
            }
            const lastLetter = letters[letters.length - 1];

            if (caseType === 'lower') {
                const valid = lastLetter === lastLetter.toLowerCase() && lastLetter !== lastLetter.toUpperCase();
                return { valid, note: valid ? `OK - Last letter '${lastLetter}' is lowercase` : `Last letter '${lastLetter}' is not lowercase` };
            }

            // Default: upper
            const valid = lastLetter === lastLetter.toUpperCase() && lastLetter !== lastLetter.toLowerCase();
            return { valid, note: valid ? `OK - Last letter '${lastLetter}' is uppercase` : `Last letter '${lastLetter}' is not uppercase` };
        }

        if (instType === 'change_case:capital_word_frequency') {
            const count = countAllCapsWords(response);
            const valid = checkRelation(count, kwargs.capital_relation, kwargs.capital_frequency);
            return { valid, note: `Found ${count} all-cap words (expected ${kwargs.capital_relation} ${kwargs.capital_frequency})` };
        }

        if (instType === 'change_case:lowercase_word_frequency') {
            const count = countLowercaseWords(response);
            const valid = checkRelation(count, kwargs.lowercase_relation, kwargs.lowercase_frequency);
            return { valid, note: `Found ${count} lowercase words (expected ${kwargs.lowercase_relation} ${kwargs.lowercase_frequency})` };
        }

        if (instType === 'change_case:case_ratio') {
            // Count lowercase and uppercase letters
            const lowercase = (response.match(/[a-zà-ÿ]/g) || []).length;
            const uppercase = (response.match(/[A-ZÀ-ß]/g) || []).length;

            if (uppercase === 0) {
                // If no uppercase, ratio is infinite
                const maxFrac = kwargs.max_fraction;
                if (maxFrac === 'inf') {
                    return { valid: true, note: `Ratio: ${lowercase}/0 (infinite), max allowed: inf` };
                }
                return { valid: false, note: `Ratio: ${lowercase}/0 (infinite), but max_fraction is ${maxFrac}` };
            }

            const ratio = lowercase / uppercase;

            // Parse fractions
            const parseFraction = (str) => {
                if (str === 'inf') return Infinity;
                if (str.includes('/')) {
                    const [num, den] = str.split('/').map(Number);
                    return num / den;
                }
                return parseFloat(str);
            };

            const minRatio = parseFraction(kwargs.min_fraction || '0');
            const maxRatio = parseFraction(kwargs.max_fraction || 'inf');

            const valid = ratio >= minRatio && ratio <= maxRatio;
            return {
                valid,
                note: `Ratio: ${lowercase}/${uppercase} = ${ratio.toFixed(2)} (expected ${kwargs.min_fraction} to ${kwargs.max_fraction} = ${minRatio.toFixed(2)} to ${maxRatio === Infinity ? 'inf' : maxRatio.toFixed(2)})`
            };
        }

        // === KEYWORDS ===
        if (instType === 'keywords:existence') {
            const keywords = kwargs.keywords || [];
            const missing = keywords.filter(kw => keywordFrequency(response, kw) === 0);
            return { valid: missing.length === 0, note: missing.length ? `Missing: ${missing.join(', ')}` : 'OK' };
        }

        if (instType === 'keywords:frequency') {
            const count = keywordFrequency(response, kwargs.keyword);
            const valid = checkRelation(count, kwargs.relation, kwargs.frequency);
            return { valid, note: `Found '${kwargs.keyword}' ${count}x (expected ${kwargs.relation} ${kwargs.frequency})` };
        }

        if (instType === 'keywords:forbidden_words') {
            const forbidden = kwargs.forbidden_words || [];
            const found = forbidden.filter(w => keywordFrequency(response, w) > 0);
            return { valid: found.length === 0, note: found.length ? `Forbidden found: ${found.join(', ')}` : 'OK' };
        }

        if (instType === 'keywords:letter_frequency') {
            const letter = (kwargs.letter || '').toLowerCase();
            const count = (response.toLowerCase().match(new RegExp(letter, 'g')) || []).length;
            const valid = checkRelation(count, kwargs.let_relation, kwargs.let_frequency);
            return { valid, note: `Found '${letter}' ${count}x (expected ${kwargs.let_relation} ${kwargs.let_frequency})` };
        }

        if (instType === 'keywords:alliteration') {
            const words = extractCleanWords(response);
            const targetLetter = (kwargs.target_letter || '').toLowerCase();
            const count = words.filter(w => w.startsWith(targetLetter)).length;
            const valid = checkRelation(count, kwargs.relation, kwargs.num_alliteration);
            return { valid, note: `Found ${count} words starting with '${targetLetter}' (expected ${kwargs.relation} ${kwargs.num_alliteration})` };
        }

        if (instType === 'keywords:vowel_count') {
            const vowels = (response.match(/[aeiouAEIOU]/g) || []).length;
            const valid = checkRelation(vowels, kwargs.relation, kwargs.num_vowels);
            return { valid, note: `Found ${vowels} vowels (expected ${kwargs.relation} ${kwargs.num_vowels})` };
        }

        if (instType === 'keywords:consonant_count') {
            const consonants = (response.match(/[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]/g) || []).length;
            const valid = checkRelation(consonants, kwargs.relation, kwargs.num_consonants);
            return { valid, note: `Found ${consonants} consonants (expected ${kwargs.relation} ${kwargs.num_consonants})` };
        }

        // === PUNCTUATION ===
        if (instType === 'punctuation:no_comma') {
            const valid = !response.includes(',');
            return { valid, note: valid ? 'OK' : 'Commas found in response' };
        }

        if (instType === 'punctuation:no_period') {
            const valid = !response.includes('.');
            return { valid, note: valid ? 'OK' : 'Periods found in response' };
        }

        if (instType === 'punctuation:question_exclaim') {
            const count = (response.match(/[?!]/g) || []).length;
            const valid = checkRelation(count, kwargs.relation, kwargs.num_marks);
            return { valid, note: `Found ${count} ?/! marks (expected ${kwargs.relation} ${kwargs.num_marks})` };
        }

        if (instType === 'punctuation:end_rule') {
            const allowed = kwargs.allowed || [];
            const punctuations = response.match(/[.!?]+/g) || [];
            const invalidPunct = punctuations.filter(p => !allowed.includes(p));
            const valid = invalidPunct.length === 0;
            return { valid, note: valid ? 'OK' : `Invalid punctuation found: ${invalidPunct.join(', ')}` };
        }

        // === LENGTH CONSTRAINTS ===
        if (instType === 'length_constraints:number_words') {
            const count = extractCleanWords(response).length;
            const valid = checkRelation(count, kwargs.relation, kwargs.num_words);
            return { valid, note: `Found ${count} words (expected ${kwargs.relation} ${kwargs.num_words})` };
        }

        if (instType === 'length_constraints:number_characters') {
            const count = response.length;
            const valid = checkRelation(count, kwargs.relation, kwargs.num_chars);
            return { valid, note: `Found ${count} chars (expected ${kwargs.relation} ${kwargs.num_chars})` };
        }

        if (instType === 'length_constraints:unique_words') {
            const words = extractCleanWords(response);
            const uniqueCount = new Set(words).size;
            const valid = checkRelation(uniqueCount, kwargs.relation, kwargs.num_unique);
            return { valid, note: `Found ${uniqueCount} unique words (expected ${kwargs.relation} ${kwargs.num_unique})` };
        }

        if (instType === 'length_constraints:word_repetition') {
            const words = extractCleanWords(response);
            const counts = {};
            words.forEach(w => counts[w] = (counts[w] || 0) + 1);
            const overLimit = Object.entries(counts).filter(([w, c]) => c > kwargs.max_repeats);
            const valid = overLimit.length === 0;
            return { valid, note: valid ? 'OK' : `'${overLimit[0][0]}' appears ${overLimit[0][1]}x (limit ${kwargs.max_repeats})` };
        }

        if (instType === 'length_constraints:sentence_length') {
            const sentences = extractCleanSentences(response);
            for (const s of sentences) {
                const wordCount = s.split(/\s+/).length;
                if (wordCount > kwargs.max_words) {
                    return { valid: false, note: `Found ${wordCount} words in sentence (max ${kwargs.max_words})` };
                }
            }
            return { valid: true, note: 'OK' };
        }

        if (instType === 'length_constraints:word_length') {
            const words = extractCleanWords(response);
            if (words.length === 0) return { valid: true, note: 'No words to check' };

            const shortest = words.reduce((a, b) => a.length < b.length ? a : b);
            const longest = words.reduce((a, b) => a.length > b.length ? a : b);

            if (shortest.length < kwargs.min_length) {
                return { valid: false, note: `Word '${shortest}' (${shortest.length} chars) is shorter than min ${kwargs.min_length}` };
            }
            if (longest.length > kwargs.max_length) {
                return { valid: false, note: `Word '${longest}' (${longest.length} chars) is longer than max ${kwargs.max_length}` };
            }
            return { valid: true, note: 'OK' };
        }

        if (instType === 'length_constraints:paragraph_length') {
            const paragraphs = extractCleanParagraphs(response);
            for (const p of paragraphs) {
                const wordCount = extractCleanWords(p).length;
                const valid = checkRelation(wordCount, kwargs.relation, kwargs.words_per_paragraph);
                if (!valid) {
                    return { valid: false, note: `Paragraph has ${wordCount} words (expected ${kwargs.relation} ${kwargs.words_per_paragraph})` };
                }
            }
            return { valid: true, note: 'OK' };
        }

        // === DETECTABLE FORMAT ===
        if (instType === 'detectable_format:number_paragraphs') {
            const count = extractCleanParagraphs(response).length;
            const valid = checkRelation(count, kwargs.relation, kwargs.num_paragraphs);
            return { valid, note: `Found ${count} paragraphs (expected ${kwargs.relation} ${kwargs.num_paragraphs})` };
        }

        if (instType === 'detectable_format:sentence_count') {
            const count = extractCleanSentences(response).length;
            const valid = checkRelation(count, kwargs.relation, kwargs.num_sentences);
            return { valid, note: `Found ${count} sentences (expected ${kwargs.relation} ${kwargs.num_sentences})` };
        }

        if (instType === 'detectable_format:numbered_list') {
            const count = countNumberedItems(response);
            const valid = checkRelation(count, kwargs.relation, kwargs.num_numbered_items);
            return { valid, note: `Found ${count} numbered items (expected ${kwargs.relation} ${kwargs.num_numbered_items})` };
        }

        if (instType === 'detectable_format:number_bullet_lists') {
            const count = countBulletPoints(response);
            const valid = checkRelation(count, kwargs.relation, kwargs.num_bullets);
            return { valid, note: `Found ${count} bullet points (expected ${kwargs.relation} ${kwargs.num_bullets})` };
        }

        if (instType === 'detectable_format:json_format') {
            try {
                const fenced = response.match(/```json\s*(\{[\s\S]*?\})\s*```/);
                if (fenced) {
                    JSON.parse(fenced[1]);
                    return { valid: true, note: 'OK' };
                }
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (!jsonMatch) return { valid: false, note: 'No JSON object found' };
                JSON.parse(jsonMatch[0]);
                return { valid: true, note: 'OK' };
            } catch (e) {
                return { valid: false, note: `Invalid JSON: ${e.message}` };
            }
        }

        if (instType === 'detectable_format:title') {
            const firstLine = response.split('\n')[0].trim();
            // Accept multiple title formats:
            // 1. <<Title>> format
            // 2. # Title (markdown h1-h6)
            // 3. **Title** (bold)
            const isWrappedTitle = firstLine.startsWith('<<') && firstLine.endsWith('>>');
            const isMarkdownTitle = /^#{1,6}\s*\S/.test(firstLine);
            const isBoldTitle = firstLine.startsWith('**') && firstLine.endsWith('**') && firstLine.length > 4;

            const valid = isWrappedTitle || isMarkdownTitle || isBoldTitle;
            let format = '';
            if (isWrappedTitle) format = '<< >>';
            else if (isMarkdownTitle) format = 'Markdown #';
            else if (isBoldTitle) format = '**bold**';

            return {
                valid,
                note: valid ? `Title found (${format}): "${firstLine.substring(0, 50)}${firstLine.length > 50 ? '...' : ''}"` : 'No title found on first line (expected <<>>, # header, or **bold**)'
            };
        }

        if (instType === 'detectable_format:multiple_sections') {
            const splitter = (kwargs.section_splitter || '').trim();
            const headerRe = new RegExp(`^\\s*#{1,6}\\s+${splitter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+\\d+\\b`, 'gmi');
            const sections = response.match(headerRe) || [];
            const count = sections.length;
            const valid = checkRelation(count, kwargs.relation, kwargs.num_sections);
            return { valid, note: `Found ${count} sections (expected ${kwargs.relation} ${kwargs.num_sections})` };
        }

        if (instType === 'detectable_format:sentences_per_paragraph') {
            const paragraphs = extractCleanParagraphs(response);
            for (const p of paragraphs) {
                const sentences = extractCleanSentences(p);
                let count = sentences.length;
                if (count === 0 && p.trim()) count = 1;

                const valid = checkRelation(count, kwargs.relation, kwargs.num_sentences);
                if (!valid) {
                    return { valid: false, note: `Paragraph has ${count} sentences (expected ${kwargs.relation} ${kwargs.num_sentences})` };
                }
            }
            return { valid: true, note: 'OK' };
        }

        if (instType === 'detectable_format:max_paragraph_length') {
            const paragraphs = extractCleanParagraphs(response);
            for (const p of paragraphs) {
                const cleanP = p.replace(/^\s*(?:[-*+]\s+|\d+\.\s+|#+\s+)/, '').trim();
                if (cleanP.length > kwargs.max_chars) {
                    return { valid: false, note: `Paragraph has ${cleanP.length} chars (max ${kwargs.max_chars})` };
                }
            }
            return { valid: true, note: 'OK' };
        }

        // === START/END ===
        if (instType === 'startend:start_checker') {
            const cleanStart = response.replace(/^[^\w]+/, '').toLowerCase();
            const expected = (kwargs.start_phrase || '').toLowerCase();
            const valid = cleanStart.startsWith(expected);
            return { valid, note: valid ? 'OK' : `Does not start with '${kwargs.start_phrase}'` };
        }

        if (instType === 'startend:end_checker') {
            const words = response.trim().split(/\s+/);
            const expectedWords = (kwargs.end_phrase || '').split(/\s+/);
            const lastWords = words.slice(-expectedWords.length).join(' ').replace(/[^\w\s]+$/, '');
            const valid = lastWords.toLowerCase() === kwargs.end_phrase.toLowerCase();
            return { valid, note: valid ? 'OK' : `Does not end with '${kwargs.end_phrase}'` };
        }

        if (instType === 'startend:wrap_checker') {
            const wrap = kwargs.wrap_phrase || '';
            const valid = response.startsWith(wrap) && response.endsWith(wrap);
            return { valid, note: valid ? 'OK' : `Not wrapped with '${wrap}'` };
        }

        if (instType === 'startend:quotation') {
            const valid = response.startsWith('"') && response.endsWith('"');
            return { valid, note: valid ? 'OK' : 'Not wrapped in double quotes' };
        }

        // === DETECTABLE CONTENT ===
        if (instType === 'detectable_content:number_placeholders') {
            const count = countPlaceholders(response);
            const valid = checkRelation(count, kwargs.relation, kwargs.num_placeholders);
            return { valid, note: `Found ${count} placeholders (expected ${kwargs.relation} ${kwargs.num_placeholders})` };
        }

        if (instType === 'detectable_content:numeric_inclusion') {
            const count = (response.match(/\d/g) || []).length;
            const valid = checkRelation(count, kwargs.relation, kwargs.num_numbers);
            return { valid, note: `Found ${count} digits (expected ${kwargs.relation} ${kwargs.num_numbers})` };
        }

        if (instType === 'detectable_content:postscript') {
            const marker = (kwargs.postscript_marker || 'PS:').trim();
            const lines = response.split('\n').filter(l => l.trim());
            const lastLine = lines.length > 0 ? lines[lines.length - 1].trim() : '';
            const valid = lastLine.startsWith(marker) && lastLine.length > marker.length;
            return { valid, note: valid ? 'OK' : `Postscript must start with '${marker}'` };
        }

        // === SEMANTIC INSTRUCTIONS (require LLM) ===
        // These types cannot be validated deterministically
        const semanticTypes = [
            'stylistic:', 'linguistic:', 'situation:',
            'grammatical_mood', 'tone_level', 'mood_type'
        ];

        for (const prefix of semanticTypes) {
            if (instType.includes(prefix)) {
                return { valid: null, note: 'Requires semantic evaluation', semantic: true };
            }
        }

        // Unknown instruction type - mark as semantic for LLM to handle
        return { valid: null, note: `Unknown instruction type: ${instType}`, semantic: true };

    } catch (e) {
        return { valid: false, note: `Validation error: ${e.message}` };
    }
}

/**
 * Validate formatting rules (emojis, em-dash, currency, etc.)
 */
function validateFormatting(response) {
    return {
        emojis: !/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(response) ? 'PASS' : 'FAIL',
        em_dash: !response.includes('\u2014') ? 'PASS' : 'FAIL', // em-dash character
        currency: !/[$\u20AC\u00A3\u00A5]/.test(response) ? 'PASS' : 'FAIL', // $, euro, pound, yen
        latex: !/\\[a-z]+\{|\\frac|\\sqrt|\\sum|\\int/.test(response) ? 'PASS' : 'FAIL',
        preamble: !/^(Sure!|Of course!|Certainly!|Absolutely!|Great!|I'd be happy)/i.test(response.trim()) ? 'PASS' : 'FAIL'
    };
}

// === EXPORT FOR GLOBAL USE ===
window.NvidiaValidator = {
    validateInstruction,
    validateFormatting,
    keywordFrequency,
    extractCleanWords,
    extractCleanSentences,
    extractCleanParagraphs,
    countNumberedItems,
    countBulletPoints,
    countPlaceholders,
    countAllCapsWords,
    countLowercaseWords,
    checkRelation
};
