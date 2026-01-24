/**
 * CFBench Automated Review - Configuration
 *
 * IMPORTANT: Keep this file private! Do not commit to public repositories.
 */

const CONFIG = {
    // Gemini API Configuration (Free Tier - 1500 calls/day)
    GEMINI_API_KEY: "AIzaSyDIIrPxRlVrfq9NTrJe1baDBLTcqD33x8Q",
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
