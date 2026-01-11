/**
 * GeoQR Theme Engine
 * Handles theme switching, persistence, and smooth transitions
 */

const ThemeEngine = {
    // Available themes
    themes: [
        { id: 'dark-pro', name: 'Dark Pro', icon: '🌙' },
        { id: 'light-clean', name: 'Light Clean', icon: '☀️' },
        { id: 'ocean-blue', name: 'Ocean Blue', icon: '🌊' },
        { id: 'royal-purple', name: 'Royal Purple', icon: '👑' },
        { id: 'emerald-green', name: 'Emerald Green', icon: '🌿' }
    ],

    // Storage key
    STORAGE_KEY: 'geoqrTheme',

    // Default theme
    DEFAULT_THEME: 'dark-pro',

    /**
     * Initialize theme engine
     * Call this on every page load
     */
    init() {
        // Apply saved theme immediately (before DOM loads completely)
        const savedTheme = this.getSavedTheme();
        this.applyTheme(savedTheme, false);

        // Setup theme selector if exists
        document.addEventListener('DOMContentLoaded', () => {
            this.setupSelector();
        });

        return this;
    },

    /**
     * Get saved theme from localStorage
     */
    getSavedTheme() {
        try {
            return localStorage.getItem(this.STORAGE_KEY) || this.DEFAULT_THEME;
        } catch (e) {
            return this.DEFAULT_THEME;
        }
    },

    /**
     * Apply a theme
     * @param {string} themeId - Theme ID to apply
     * @param {boolean} animate - Whether to animate the transition
     */
    applyTheme(themeId, animate = true) {
        // Validate theme exists
        const theme = this.themes.find(t => t.id === themeId);
        if (!theme) {
            console.warn(`Theme "${themeId}" not found, using default`);
            themeId = this.DEFAULT_THEME;
        }

        // Apply theme attribute
        document.documentElement.setAttribute('data-theme', themeId);

        // Save to localStorage
        try {
            localStorage.setItem(this.STORAGE_KEY, themeId);
        } catch (e) {
            console.warn('Could not save theme to localStorage');
        }

        // Update selector UI if exists
        this.updateSelectorUI(themeId);

        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('themechange', { 
            detail: { theme: themeId } 
        }));

        return this;
    },

    /**
     * Get current theme
     */
    getCurrentTheme() {
        return document.documentElement.getAttribute('data-theme') || this.DEFAULT_THEME;
    },

    /**
     * Cycle to next theme
     */
    nextTheme() {
        const current = this.getCurrentTheme();
        const currentIndex = this.themes.findIndex(t => t.id === current);
        const nextIndex = (currentIndex + 1) % this.themes.length;
        this.applyTheme(this.themes[nextIndex].id);
        return this;
    },

    /**
     * Setup theme selector(s) on page
     */
    setupSelector() {
        const selectors = document.querySelectorAll('.theme-selector');
        selectors.forEach(selector => this.populateSelector(selector));
    },

    /**
     * Populate a theme selector container with theme options
     */
    populateSelector(container) {
        if (!container) return;

        const currentTheme = this.getCurrentTheme();

        container.innerHTML = this.themes.map(theme => `
            <div class="theme-option ${theme.id === currentTheme ? 'active' : ''}" 
                 data-theme="${theme.id}" 
                 onclick="ThemeEngine.applyTheme('${theme.id}')"
                 title="${theme.name}">
                <div class="theme-swatch theme-swatch-${theme.id}">
                    <div class="theme-swatch-half"></div>
                    <div class="theme-swatch-half"></div>
                </div>
                <span class="theme-name">${theme.icon} ${theme.name}</span>
            </div>
        `).join('');
    },

    /**
     * Update selector UI to show active theme
     */
    updateSelectorUI(themeId) {
        document.querySelectorAll('.theme-option').forEach(option => {
            option.classList.toggle('active', option.dataset.theme === themeId);
        });
    },

    /**
     * Create a minimal theme toggle button
     * @returns {HTMLElement} Toggle button element
     */
    createToggleButton() {
        const btn = document.createElement('button');
        btn.className = 'theme-toggle-btn';
        btn.innerHTML = '🎨';
        btn.title = 'Switch Theme';
        btn.onclick = () => this.nextTheme();
        return btn;
    },

    /**
     * Render a compact theme selector
     * @param {string} containerId - ID of container element
     */
    renderCompactSelector(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="theme-selector-compact">
                <label class="settings-label">🎨 Theme</label>
                <div class="theme-selector"></div>
            </div>
        `;

        this.populateSelector(container.querySelector('.theme-selector'));
    }
};

// Auto-initialize immediately
ThemeEngine.init();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeEngine;
}
