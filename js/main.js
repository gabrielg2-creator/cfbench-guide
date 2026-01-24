/* CFBench Documentation - Shared JavaScript */
/* Version 2.1 - Official Release */

// ==================== DROPDOWN ====================
function toggleDropdown(header) {
    header.parentElement.classList.toggle('open');
}

// ==================== CHECKLIST ====================
function toggleCheck(box) {
    if (typeof box === 'string') {
        // For step cards
        const card = document.getElementById(box);
        if (card) {
            card.classList.toggle('open');
        }
    } else {
        // For checkboxes
        box.classList.toggle('checked');
    }
}

function toggleChecklist(item) {
    item.classList.toggle('checked');
}

// ==================== HELP BUBBLES ====================
function toggleHelp(bubble) {
    const popup = bubble.nextElementSibling;
    const isActive = popup.classList.contains('active');

    // Close all other popups first
    document.querySelectorAll('.help-popup.active').forEach(p => {
        p.classList.remove('active');
        if (p.previousElementSibling) {
            p.previousElementSibling.classList.remove('active');
        }
    });

    // Toggle this one
    if (!isActive) {
        bubble.classList.add('active');
        popup.classList.add('active');
    }
}

function closeHelp(btn) {
    const popup = btn.closest('.help-popup');
    const bubble = popup.previousElementSibling;
    popup.classList.remove('active');
    if (bubble) {
        bubble.classList.remove('active');
    }
}

// Close popups when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.help-wrapper') && !e.target.closest('.inline-help')) {
        document.querySelectorAll('.help-popup.active').forEach(popup => {
            popup.classList.remove('active');
            if (popup.previousElementSibling) {
                popup.previousElementSibling.classList.remove('active');
            }
        });
    }
});

// ==================== FAQ ====================
function toggleFaq(question) {
    const item = question.parentElement;
    item.classList.toggle('open');
}

// ==================== STEP CARDS ====================
function toggleStep(header) {
    const card = header.parentElement;
    card.classList.toggle('open');
}

// ==================== COPY FUNCTIONALITY ====================
function copyPrompt(btn) {
    const promptBox = btn.closest('.prompt-box');
    const content = promptBox.querySelector('.prompt-content');
    const text = content.textContent || content.innerText;

    navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');

        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

function copyCode(btn) {
    const codeBlock = btn.closest('.code-block') || btn.parentElement;
    const code = codeBlock.querySelector('code, pre, .code-content');
    const text = code ? (code.textContent || code.innerText) : '';

    navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');

        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('copied');
        }, 2000);
    });
}

// ==================== THEME TOGGLE ====================
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('cfbench-theme', newTheme);

    // Toggle icons
    const sunIcon = document.getElementById('sunIcon');
    const moonIcon = document.getElementById('moonIcon');
    if (sunIcon && moonIcon) {
        sunIcon.style.display = newTheme === 'light' ? 'none' : 'block';
        moonIcon.style.display = newTheme === 'light' ? 'block' : 'none';
    }
}

// Apply saved theme on load
(function() {
    const savedTheme = localStorage.getItem('cfbench-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    document.addEventListener('DOMContentLoaded', function() {
        const sunIcon = document.getElementById('sunIcon');
        const moonIcon = document.getElementById('moonIcon');
        if (sunIcon && moonIcon) {
            sunIcon.style.display = savedTheme === 'light' ? 'none' : 'block';
            moonIcon.style.display = savedTheme === 'light' ? 'block' : 'none';
        }
    });
})();

// ==================== SEARCH FUNCTIONALITY ====================
// Search data should be defined per page, this is a fallback
let searchData = [];

function initSearch(data) {
    searchData = data || [];
}

document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');

    if (searchInput && searchResults) {
        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase().trim();

            if (query.length < 2) {
                searchResults.classList.remove('active');
                return;
            }

            const matches = searchData.filter(item =>
                item.title.toLowerCase().includes(query) ||
                (item.keywords && item.keywords.toLowerCase().includes(query))
            );

            if (matches.length > 0) {
                searchResults.innerHTML = matches.map(item =>
                    `<div class="search-result-item" onclick="navigateTo('${item.id}')">
                        <strong>${item.title}</strong>
                        <span>Click to navigate</span>
                    </div>`
                ).join('');
                searchResults.classList.add('active');
            } else {
                searchResults.innerHTML = '<div class="search-no-results">No results found</div>';
                searchResults.classList.add('active');
            }
        });

        // Close search results when clicking outside
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.search-wrapper')) {
                searchResults.classList.remove('active');
            }
        });
    }
});

function navigateTo(id) {
    const element = document.getElementById(id) || document.querySelector('.' + id);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const searchResults = document.getElementById('searchResults');
    const searchInput = document.getElementById('searchInput');
    if (searchResults) searchResults.classList.remove('active');
    if (searchInput) searchInput.value = '';
}

// ==================== SCROLL SPY ====================
window.addEventListener('scroll', function() {
    const sections = document.querySelectorAll('.section');
    const links = document.querySelectorAll('.sidebar-nav a[href^="#"]');

    let current = '';
    sections.forEach(section => {
        if (scrollY >= section.offsetTop - 120) {
            current = section.id;
        }
    });

    links.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === '#' + current) {
            link.classList.add('active');
        }
    });
});

// ==================== UTILITY FUNCTIONS ====================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', function() {
    // Auto-open first step card if exists
    const firstStep = document.querySelector('.step-card');
    if (firstStep && !document.querySelector('.step-card.open')) {
        // firstStep.classList.add('open'); // Uncomment to auto-open first step
    }

    // Initialize any tooltips
    const tooltips = document.querySelectorAll('[data-tooltip]');
    tooltips.forEach(el => {
        // Tooltip initialization if needed
    });
});
