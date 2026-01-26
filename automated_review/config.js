/**
 * CFBench Automated Review - Configuration
 *
 * API Key is stored in localStorage (entered by user in the UI)
 * DO NOT hardcode API keys here!
 */

const CONFIG = {
    // Gemini API Configuration (Free Tier - 1500 calls/day)
    // API key is entered by user and stored in localStorage
    GEMINI_API_KEY: null,
    GEMINI_MODEL: "gemini-2.5-flash-lite",
    GEMINI_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai",

    // Rate Limits
    RATE_LIMIT_RPM: 30,           // Requests per minute
    RATE_LIMIT_RPD: 1500,         // Requests per day
    RATE_LIMIT_DELAY_MS: 2100,    // Delay between calls (ms)

    // Context Window
    MAX_CONTEXT_TOKENS: 1000000   // 1 million tokens
};

// Export for use in browser
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}
