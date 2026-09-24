/**
 * Safely retrieves an item from browser localStorage with exception handling.
 * Prevents fatal SecurityError exceptions in restricted environments or private browsing.
 * @param {string} key - The storage key to look up.
 * @param {string|null} defaultValue - Fallback value if storage is inaccessible or key is absent.
 * @returns {string|null} The retrieved string value or the provided fallback default.
 */
function safeStorageGet(key, defaultValue = null) {
    try {
        const val = localStorage.getItem(key);
        return val !== null ? val : defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

/**
 * Safely persists an item into browser localStorage with error trapping.
 * @param {string} key - The storage key to assign.
 * @param {string} value - The string content to save.
 */
function safeStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.warn('LocalStorage write restricted or unavailable:', e);
    }
}

/**
 * Safely removes an item from browser localStorage with error trapping.
 * @param {string} key - The storage key to delete.
 */
function safeStorageRemove(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.warn('LocalStorage remove restricted or unavailable:', e);
    }
}

let currentTheme = safeStorageGet('theme', 'light');
let currentAccent = safeStorageGet('accent', 'blue');
let currentLineHeight = safeStorageGet('lineHeight', '1.8');
let currentPageWidth = safeStorageGet('pageWidth', '680px');
let currentSpellcheck = safeStorageGet('spellcheck', 'true') !== 'false';

function getDefaultColour() {
    if (currentTheme === 'dark') return '#e8e8e8';
    if (currentTheme === 'sepia') return '#433422';
    return '#37352f';
}

let currentFont     = "'Georgia', serif";
let currentFontSize = "1rem";
let currentColour   = getDefaultColour();
let isLoadingNote   = false;
let activeNoteIndex = null;
let saveTimeout;
let bulletsEnabled  = false;
let currentBullet   = '•';

/**
 * Generates a globally unique identifier for a note.
 * Combines current timestamp with pseudo-random characters to guarantee uniqueness across devices.
 * @returns {string} The unique note identifier string.
 */
function generateNoteId() {
    return 'note_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Removes duplicate notes that share the exact same ID, or identical title, body, and section.
 * Cleans up spurious copies created by previous synchronization loop bugs while preserving content.
 */
function deduplicateNotes() {
    const seen = new Set();
    const unique = [];
    let removedDuplicates = false;

    notes.forEach(note => {
        // Build composite key for duplicate detection
        const key = note.id 
            ? ('id:' + note.id) 
            : ('content:' + (note.section || 'General') + ':::' + (note.title || '').trim() + ':::' + (note.body || '').trim());
            
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(note);
        } else {
            removedDuplicates = true;
        }
    });

    if (removedDuplicates) {
        notes = unique;
        safeStorageSet('my-notes', JSON.stringify(notes));
    }
}

// List of user-created notes from local storage
let notes = [];
try {
    notes = JSON.parse(safeStorageGet('my-notes', '[]'));
    if (!Array.isArray(notes)) notes = [];
    
    // Ensure every existing note has a permanent unique ID
    let hasUpdatedIds = false;
    notes.forEach(note => {
        if (!note.id) {
            note.id = generateNoteId();
            hasUpdatedIds = true;
        }
    });
    
    if (hasUpdatedIds) {
        safeStorageSet('my-notes', JSON.stringify(notes));
    }
    
    // Automatically clean up any duplicate notes created by previous synchronization bugs
    deduplicateNotes();
} catch (e) {
    notes = [];
}

// Sidebar sub-sections list and collapsed state tracker
let sections = ['General'];
try {
    sections = JSON.parse(safeStorageGet('my-sections', '["General"]'));
} catch (e) {
    sections = ['General'];
}

let collapsedSections = {};
try {
    collapsedSections = JSON.parse(safeStorageGet('collapsed-sections', '{}'));
} catch (e) {
    collapsedSections = {};
}
let activeSection = 'General';

// Prefix applied to clan room codes to prevent ID collisions on public PeerJS relay
const PEER_ROOM_PREFIX = 'draftly-clan-';

// Active Clan membership profile loaded from browser local storage
let activeClan = null;
try {
    activeClan = JSON.parse(safeStorageGet('draftly-clan', 'null'));
} catch (e) {
    activeClan = null;
}

// PeerJS network and connection state tracking
let peerInstance = null;
let activeConnections = [];
let isApplyingRemoteUpdate = false;
let clanReconnectTimer = null;
let isHostingClan = false;

/**
 * Checks if a given note belongs to the active shared clan section.
 * Notes outside the clan section are considered private personal notes.
 * @param {Object} note - The note object to check.
 * @returns {boolean} True if the note is a clan shared note.
 */
function isClanNote(note) {
    if (!activeClan || !note) return false;
    return note.section === activeClan.name;
}

const defaultColoursLight = [
    "#37352f", "#787774", "#d44c47", "#d9730d",
    "#cb912f", "#448361", "#337ea9", "#9065b0"
];

const defaultColoursDark = [
    "#e8e8e8", "#999999", "#ff6b6b", "#ff9f43",
    "#feca57", "#1dd1a1", "#54a0ff", "#5f27cd"
];

let recentColours = JSON.parse(localStorage.getItem("recentColours")) || 
    (currentTheme === 'dark' ? defaultColoursDark : defaultColoursLight);

function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    ['light', 'dark', 'sepia'].forEach(t => {
        const btn = document.getElementById(`theme-card-${t}`);
        if (btn) btn.classList.toggle('active', t === theme);
    });

    if (currentColour === '#c9c9c9' || currentColour === '#e8e8e8' || currentColour === '#37352f' || currentColour === '#433422') {
        currentColour = getDefaultColour();
        document.getElementById('note-title').style.color = currentColour;
        document.getElementById('note-body').style.color  = currentColour;
    }

    renderColourButtons();
    renderNotes();
}

function setAccentColor(accent) {
    currentAccent = accent;
    document.documentElement.setAttribute('data-accent', accent);
    localStorage.setItem('accent', accent);

    document.querySelectorAll('.accent-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.accent === accent);
    });
}

function changeLineHeight(val) {
    currentLineHeight = val;
    document.documentElement.style.setProperty('--line-height', val);
    localStorage.setItem('lineHeight', val);
    const select = document.getElementById('settings-line-height-select');
    if (select) select.value = val;
}

function changePageWidth(val) {
    currentPageWidth = val;
    document.documentElement.style.setProperty('--page-max-width', val);
    localStorage.setItem('pageWidth', val);
    const select = document.getElementById('settings-width-select');
    if (select) select.value = val;
}

function setDefaultBulletStyle(style) {
    setBulletStyle(style);
    const select = document.getElementById('settings-bullet-select');
    if (select) select.value = style;
}

function toggleSpellcheck(enabled) {
    currentSpellcheck = enabled;
    document.getElementById('note-title').spellcheck = enabled;
    document.getElementById('note-body').spellcheck = enabled;
    localStorage.setItem('spellcheck', enabled);
    const toggle = document.getElementById('settings-spellcheck-toggle');
    if (toggle) toggle.checked = enabled;
}

// ─────────────────────────────────────────
// SETTINGS MODAL DIALOG
// ─────────────────────────────────────────

function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.showModal();
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.close();
}

function switchSettingsTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });
}

function clearAllNotes() {
    if (confirm("Are you sure you want to delete ALL notes? This action cannot be undone.")) {
        notes = [];
        localStorage.removeItem('my-notes');
        newNote();
        renderNotes();
        closeSettingsModal();
    }
}

// ─────────────────────────────────────────
// STYLE CHANGERS
// ─────────────────────────────────────────

const fontNamesMap = {
    "'Georgia', serif": "Georgia",
    "'Inter', sans-serif": "Inter",
    "'Arial', sans-serif": "Arial",
    "'Courier New', monospace": "Courier New",
    "'Trebuchet MS', sans-serif": "Trebuchet",
    "'Times New Roman', serif": "Times New Roman",
    "'Playfair Display', serif": "Playfair Display",
    "'Lato', sans-serif": "Lato",
    "'Merriweather', serif": "Merriweather",
    "'Comic Sans MS', cursive": "Comic Sans"
};

const fontSizeNamesMap = {
    "0.8rem": "Small",
    "1rem": "Medium",
    "1.2rem": "Large",
    "1.5rem": "Extra Large"
};

// ─────────────────────────────────────────
// INLINE PER-CHARACTER / SELECTION FORMATTING
// ─────────────────────────────────────────

function applyInlineStyle(styleProp, value) {
    const editor = document.getElementById('note-body');
    if (!editor) return;
    editor.focus();

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    document.execCommand('styleWithCSS', false, true);

    if (styleProp === 'color') {
        document.execCommand('foreColor', false, value);
    } else if (styleProp === 'fontFamily') {
        document.execCommand('fontName', false, value);
    } else if (styleProp === 'fontSize') {
        const range = selection.getRangeAt(0);
        if (range.collapsed) {
            const span = document.createElement('span');
            span.style.fontSize = value;
            span.innerHTML = '&#8203;';
            range.insertNode(span);
            range.setStartAfter(span);
            range.setEndAfter(span);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            const span = document.createElement('span');
            span.style.fontSize = value;
            try {
                span.appendChild(range.extractContents());
                range.insertNode(span);
            } catch (e) {
                document.execCommand('fontSize', false, '7');
                const fontEls = editor.querySelectorAll('font[size="7"]');
                fontEls.forEach(el => {
                    el.removeAttribute('size');
                    el.style.fontSize = value;
                });
            }
        }
    }

    scheduleAutoSave();
}

function changeFont(fontValue) {
    currentFont = fontValue;
    const fontBtn = document.getElementById('font-btn');
    if (fontBtn) fontBtn.textContent = (fontNamesMap[fontValue] || 'Font') + ' ▾';

    applyInlineStyle('fontFamily', fontValue);
    if (activeNoteIndex !== null) saveNote();
}

function changeFontSize(sizeValue) {
    currentFontSize = sizeValue;
    const fontSizeBtn = document.getElementById('font-size-btn');
    if (fontSizeBtn) fontSizeBtn.textContent = (fontSizeNamesMap[sizeValue] || 'Size') + ' ▾';

    applyInlineStyle('fontSize', sizeValue);
    if (activeNoteIndex !== null) saveNote();
}

function toggleFontMenu() {
    const fontMenu = document.getElementById('font-menu');
    const bulletMenu = document.getElementById('bullet-menu');
    const fontSizeMenu = document.getElementById('font-size-menu');
    if (bulletMenu) bulletMenu.classList.remove('open');
    if (fontSizeMenu) fontSizeMenu.classList.remove('open');
    if (fontMenu) fontMenu.classList.toggle('open');
}

function toggleFontSizeMenu() {
    const fontSizeMenu = document.getElementById('font-size-menu');
    const bulletMenu = document.getElementById('bullet-menu');
    const fontMenu = document.getElementById('font-menu');
    if (bulletMenu) bulletMenu.classList.remove('open');
    if (fontMenu) fontMenu.classList.remove('open');
    if (fontSizeMenu) fontSizeMenu.classList.toggle('open');
}

function selectFont(fontValue, displayName) {
    changeFont(fontValue);
    const fontMenu = document.getElementById('font-menu');
    if (fontMenu) fontMenu.classList.remove('open');
}

function selectFontSize(sizeValue, displayName) {
    changeFontSize(sizeValue);
    const fontSizeMenu = document.getElementById('font-size-menu');
    if (fontSizeMenu) fontSizeMenu.classList.remove('open');
}

function changeColour(colourValue) {
    currentColour = colourValue;
    applyInlineStyle('color', colourValue);

    recentColours = recentColours.filter(c => c !== colourValue);
    recentColours.unshift(colourValue);
    recentColours = recentColours.slice(0, 7);
    localStorage.setItem("recentColours", JSON.stringify(recentColours));

    renderColourButtons();
    if (activeNoteIndex !== null) saveNote();
}

// BULLET POINTS
function toggleBullets() {
    document.execCommand('insertUnorderedList', false, null);
    if (activeNoteIndex !== null) saveNote();
}

function toggleBulletMenu() {
    const menu = document.getElementById('bullet-menu');
    const fontMenu = document.getElementById('font-menu');
    const fontSizeMenu = document.getElementById('font-size-menu');
    if (fontMenu) fontMenu.classList.remove('open');
    if (fontSizeMenu) fontSizeMenu.classList.remove('open');
    if (menu) menu.classList.toggle('open');
}

function setBulletStyle(style) {
    document.execCommand('insertUnorderedList', false, null);
    document.getElementById('bullet-menu').classList.remove('open');
    if (activeNoteIndex !== null) saveNote();
}

function renderColourButtons() {
    const container = document.getElementById("colour-options");
    if (!container) return;
    container.innerHTML = "";

    recentColours.forEach(colour => {
        const button = document.createElement("button");
        button.className = "colour-btn";
        button.style.background = colour;
        if (colour === currentColour) {
            button.classList.add("active");
        }
        button.onclick = function() { changeColour(colour); };
        container.appendChild(button);
    });
}

function newNote() {
    clearTimeout(saveTimeout);
    isLoadingNote = true;

    activeNoteIndex = null;

    document.getElementById("note-title").value = "";
    document.getElementById("note-body").innerHTML = "";

    currentFont     = "'Georgia', serif";
    currentFontSize = "1rem";
    currentColour   = getDefaultColour();

    const fontBtn = document.getElementById('font-btn');
    if (fontBtn) fontBtn.textContent = 'Georgia ▾';

    const fontSizeBtn = document.getElementById('font-size-btn');
    if (fontSizeBtn) fontSizeBtn.textContent = 'Medium ▾';

    renderColourButtons();
    renderNotes();

    isLoadingNote = false;
    document.getElementById("note-title").focus();
}

function loadNote(index) {
    clearTimeout(saveTimeout);
    isLoadingNote = true;

    const note = notes[index];
    activeNoteIndex = index;

    document.getElementById('note-title').value = note.title || "";
    document.getElementById('note-body').innerHTML = note.body  || "";

    currentFont     = note.font     || "'Georgia', serif";
    currentFontSize = note.fontSize || "1rem";
    currentColour   = note.colour   || getDefaultColour();

    const fontBtn = document.getElementById('font-btn');
    if (fontBtn) fontBtn.textContent = (fontNamesMap[currentFont] || 'Font') + ' ▾';

    const fontSizeBtn = document.getElementById('font-size-btn');
    if (fontSizeBtn) fontSizeBtn.textContent = (fontSizeNamesMap[currentFontSize] || 'Size') + ' ▾';

    renderColourButtons();
    renderNotes();

    // Auto-close sidebar drawer on mobile devices or phone landscape when a note is opened
    if (isMobileViewport() && !sidebarCollapsed) {
        toggleSidebar();
    }

    isLoadingNote = false;
}

/**
 * Saves current note content to localStorage and updates sidebar list.
 * Preserves custom formatting (font, size, colour) and sub-section branch.
 */
function saveNote() {
    const title = document.getElementById('note-title').value.trim();
    const bodyEl = document.getElementById('note-body');
    const bodyHtml = bodyEl ? bodyEl.innerHTML : '';
    const bodyText = bodyEl ? bodyEl.innerText.trim() : '';

    // Do not save completely empty notes (must have title, body text, or embedded image)
    if (!title && !bodyText && !bodyHtml.includes('<img')) return;

    // Retain existing assigned section or use currently active section
    const existingSection = (activeNoteIndex !== null && notes[activeNoteIndex]) 
        ? (notes[activeNoteIndex].section || 'General') 
        : (activeSection || 'General');

    // Preserve existing note ID and creation date if editing an existing note
    const existingNote = (activeNoteIndex !== null && notes[activeNoteIndex]) ? notes[activeNoteIndex] : null;
    const noteId = (existingNote && existingNote.id) ? existingNote.id : generateNoteId();
    const creationDate = (existingNote && existingNote.date) ? existingNote.date : new Date().toLocaleString();

    const noteToSave = {
        id:        noteId,
        title:     title,
        body:      bodyHtml,
        date:      creationDate,
        updatedAt: new Date().toLocaleString(),
        font:      currentFont,
        fontSize:  currentFontSize,
        colour:    currentColour,
        section:   existingSection
    };

    if (activeNoteIndex === null) {
        notes.unshift(noteToSave);
        activeNoteIndex = 0;
    } else {
        notes[activeNoteIndex] = noteToSave;
    }

    safeStorageSet('my-notes', JSON.stringify(notes));
    renderNotes();

    // Broadcast saved note only if it belongs to the active shared clan section
    if (!isApplyingRemoteUpdate && typeof activeConnections !== 'undefined' && activeConnections.length > 0 && typeof isClanNote === 'function' && isClanNote(noteToSave)) {
        broadcastCollabMessage({
            type: 'NOTE_SAVED',
            clanCode: activeClan.code,
            note: noteToSave
        });
    }
}

function scheduleAutoSave() {
    if (isLoadingNote) return;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        const titleEl = document.getElementById("note-title");
        const bodyEl = document.getElementById("note-body");
        const hasTitle = titleEl && titleEl.value.trim() !== "";
        const hasBody = bodyEl && (bodyEl.innerText.trim() !== "" || bodyEl.innerHTML.includes('<img'));
        if (hasTitle || hasBody) {
            saveNote();
        }
    }, 800);
}
 
/**
  * Handles live text input in the note editor.
  * Initializes new shared notes immediately so live edits stream to peers from the first keystroke.
  * Triggers auto-save timer and broadcasts real-time keystroke updates to connected clan members.
  */
function onEditorInput() {
    // If typing in a new note inside the active shared section, initialize immediately
    // so activeNoteIndex is assigned and live edits stream to collaborators from the first keystroke
    if (activeNoteIndex === null && activeClan && activeSection === activeClan.name) {
        saveNote();
    }

    scheduleAutoSave();

    // Broadcast live typing only if editing a note inside the active shared clan section
    if (!isApplyingRemoteUpdate && typeof activeConnections !== 'undefined' && activeConnections.length > 0 && activeNoteIndex !== null) {
        const currentNote = notes[activeNoteIndex];
        if (typeof isClanNote === 'function' && isClanNote(currentNote)) {
            const titleEl = document.getElementById('note-title');
            const bodyEl = document.getElementById('note-body');
            broadcastCollabMessage({
                type: 'NOTE_EDIT_LIVE',
                clanCode: activeClan.code,
                id: currentNote.id,
                date: currentNote.date,
                title: titleEl ? titleEl.value : '',
                body: bodyEl ? bodyEl.innerHTML : ''
            });
        }
    }
}

document.getElementById("note-title").addEventListener("input", onEditorInput);
document.getElementById("note-body").addEventListener("input", onEditorInput);

document.getElementById('note-body').addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'Enter') saveNote();

    if (e.key === 'Tab') {
        e.preventDefault();

        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        if (e.shiftKey) {
            document.execCommand('outdent', false, null);
        } else {
            const range = selection.getRangeAt(0);
            let node = range.commonAncestorContainer;
            if (node.nodeType === 3) node = node.parentNode;

            if (node && (node.closest('li') || node.closest('ul') || node.closest('ol'))) {
                document.execCommand('indent', false, null);
            } else {
                const tabNode = document.createTextNode('\u00a0\u00a0\u00a0\u00a0');
                range.insertNode(tabNode);
                range.setStartAfter(tabNode);
                range.setEndAfter(tabNode);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
        scheduleAutoSave();
    }
});

function stripHtml(html) {
    if (!html) return '';
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
}

function exportNotes() {
    const now = new Date().toLocaleString();
    let text = '========================================\n';
    text += ' My Notes Export — ' + now + '\n';
    text += '========================================\n\n';
    notes.forEach(note => {
        text += note.title ? '[ ' + note.title + ' ]\n' : '[ Untitled ]\n';
        text += stripHtml(note.body) + '\n';
        text += '— ' + note.date + '\n\n';
        text += '----------------------------------------\n\n';
    });
    if (notes.length === 0) text += 'No notes yet.\n';
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'my-notes.txt';
    a.click();
    URL.revokeObjectURL(url);
}

function exportSingleNote(index) {
    const note = notes[index];
    const text = `${note.title ? note.title + '\n\n' : ''}${stripHtml(note.body)}\n\n${note.date}`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const safeTitle = (note.title || 'untitled-note').replace(/[\\/:*?"<>|]/g, '').trim();
    a.download = `${safeTitle}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Prompts the user to create a new sub-section branch in the sidebar.
 * Adds the new section name to localStorage and refreshes the sidebar view.
 */
function promptCreateSection() {
    const name = window.prompt('Enter new section name:');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    if (!sections.includes(trimmed)) {
        sections.push(trimmed);
        localStorage.setItem('my-sections', JSON.stringify(sections));
        renderNotes();
    }
}

/**
 * Toggles a section's collapsed/expanded visibility state.
 * @param {string} sectionName - The section name to toggle.
 */
function toggleSectionCollapse(sectionName) {
    collapsedSections[sectionName] = !collapsedSections[sectionName];
    localStorage.setItem('collapsed-sections', JSON.stringify(collapsedSections));
    renderNotes();
}

// Variable to track the index of currently dragged note
let draggedNoteIndex = null;

/**
 * Handles the start of a drag event on a sidebar note.
 * Stores note index in dataTransfer and applies dragging visual state.
 * @param {DragEvent} event - The HTML drag event.
 * @param {number} index - The index of the note being dragged.
 */
function handleNoteDragStart(event, index) {
    draggedNoteIndex = index;
    event.dataTransfer.setData('text/plain', index.toString());
    event.dataTransfer.effectAllowed = 'move';
    if (event.currentTarget) {
        event.currentTarget.classList.add('dragging');
    }
}

/**
 * Handles the end of a drag event on a sidebar note.
 * Cleans up temporary dragging and drag-over visual indicator styles.
 * @param {DragEvent} event - The HTML drag event.
 */
function handleNoteDragEnd(event) {
    if (event.currentTarget) {
        event.currentTarget.classList.remove('dragging');
    }
    document.querySelectorAll('.sidebar-section.drag-over').forEach(sec => {
        sec.classList.remove('drag-over');
    });
    draggedNoteIndex = null;
}

/**
 * Handles dragover on a section dropzone to allow dropping.
 * Prevents default browser handling and highlights the target section.
 * @param {DragEvent} event - The HTML drag event.
 * @param {string} sectionName - The name of the target section.
 */
function handleSectionDragOver(event, sectionName) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const sectionEl = document.getElementById(`section-${sectionName}`);
    if (sectionEl) {
        sectionEl.classList.add('drag-over');
    }
}

/**
 * Handles dragleave from a section dropzone.
 * Removes visual highlight when cursor leaves the section boundaries.
 * @param {DragEvent} event - The HTML drag event.
 * @param {string} sectionName - The name of the target section.
 */
function handleSectionDragLeave(event, sectionName) {
    const sectionEl = document.getElementById(`section-${sectionName}`);
    if (sectionEl && !sectionEl.contains(event.relatedTarget)) {
        sectionEl.classList.remove('drag-over');
    }
}

/**
 * Handles dropping a dragged note onto a target section.
 * Reassigns the note's section, uncollapses the target section, and persists changes.
 * @param {DragEvent} event - The HTML drag event.
 * @param {string} sectionName - The name of the destination section.
 */
function handleSectionDrop(event, sectionName) {
    event.preventDefault();
    const sectionEl = document.getElementById(`section-${sectionName}`);
    if (sectionEl) {
        sectionEl.classList.remove('drag-over');
    }

    const indexStr = event.dataTransfer.getData('text/plain');
    const noteIndex = indexStr !== '' ? parseInt(indexStr, 10) : draggedNoteIndex;

    if (noteIndex !== null && !isNaN(noteIndex) && noteIndex >= 0 && noteIndex < notes.length) {
        const oldSection = notes[noteIndex].section;
        // Update note's section assignment
        notes[noteIndex].section = sectionName;
        // Auto-expand destination section so the user sees their moved note
        collapsedSections[sectionName] = false;

        localStorage.setItem('my-notes', JSON.stringify(notes));
        localStorage.setItem('collapsed-sections', JSON.stringify(collapsedSections));
        renderNotes();

        // Broadcast relocation if moving into or out of the clan section
        if (!isApplyingRemoteUpdate && typeof activeConnections !== 'undefined' && activeConnections.length > 0 && typeof activeClan !== 'undefined' && activeClan) {
            if (sectionName === activeClan.name) {
                // Moved into clan: share note with clan
                broadcastCollabMessage({
                    type: 'NOTE_SAVED',
                    clanCode: activeClan.code,
                    note: notes[noteIndex]
                });
            } else if (oldSection === activeClan.name) {
                // Moved out of clan into personal: remove from other clan members
                broadcastCollabMessage({
                    type: 'NOTE_DELETED',
                    clanCode: activeClan.code,
                    id: notes[noteIndex] ? notes[noteIndex].id : null,
                    date: notes[noteIndex] ? notes[noteIndex].date : null
                });
            }
        }
    }
}

/**
 * Prompts user to rename an existing section.
 * Updates all notes currently filed under this section.
 * @param {string} oldName - The existing section name.
 */
function promptRenameSection(oldName) {
    if (oldName === 'General') return;
    const newName = window.prompt(`Rename section "${oldName}" to:`, oldName);
    if (!newName) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;

    // Update section in sections list
    const secIndex = sections.indexOf(oldName);
    if (secIndex !== -1) {
        sections[secIndex] = trimmed;
    }

    // Update notes section property
    notes.forEach(n => {
        if ((n.section || 'General') === oldName) {
            n.section = trimmed;
        }
    });

    // Update collapsed state key
    if (collapsedSections[oldName] !== undefined) {
        collapsedSections[trimmed] = collapsedSections[oldName];
        delete collapsedSections[oldName];
    }

    localStorage.setItem('my-sections', JSON.stringify(sections));
    localStorage.setItem('my-notes', JSON.stringify(notes));
    localStorage.setItem('collapsed-sections', JSON.stringify(collapsedSections));
    renderNotes();
}

/**
 * Confirms deletion of a section. Notes inside are moved to the General section.
 * @param {string} sectionName - The section name to delete.
 */
function confirmDeleteSection(sectionName) {
    if (sectionName === 'General') return;
    const confirmed = window.confirm(`Delete section "${sectionName}"? Notes inside will be moved to General.`);
    if (!confirmed) return;

    sections = sections.filter(s => s !== sectionName);
    notes.forEach(n => {
        if (n.section === sectionName) {
            n.section = 'General';
        }
    });

    delete collapsedSections[sectionName];

    localStorage.setItem('my-sections', JSON.stringify(sections));
    localStorage.setItem('my-notes', JSON.stringify(notes));
    localStorage.setItem('collapsed-sections', JSON.stringify(collapsedSections));
    renderNotes();
}

/**
 * Creates a new blank note filed under a specific section.
 * @param {string} sectionName - The section name for the new note.
 */
function promptCreateNoteInSection(sectionName) {
    activeSection = sectionName;
    newNote();
}

/**
 * Renders notes organized into collapsible sub-sections in the sidebar.
 * Notes are grouped by their `section` property. Includes section controls
 * (collapse/expand, rename, delete) and note options (delete, export, drag & drop).
 */
function renderNotes() {
    const list = document.getElementById('notes-list');
    if (!list) return;

    // Ensure 'General' is always in the sections list
    if (!sections.includes('General')) {
        sections.unshift('General');
    }

    // Collect any extra sections present on notes that might not be in sections list
    notes.forEach(n => {
        const sec = n.section || 'General';
        if (!sections.includes(sec)) {
            sections.push(sec);
        }
    });

    // Save consolidated sections list
    localStorage.setItem('my-sections', JSON.stringify(sections));

    // Group notes by section
    const grouped = {};
    sections.forEach(s => grouped[s] = []);
    notes.forEach((note, index) => {
        const sec = note.section || 'General';
        if (!grouped[sec]) grouped[sec] = [];
        grouped[sec].push({ note, index });
    });

    list.innerHTML = sections.map(sectionName => {
        const sectionNotes = grouped[sectionName] || [];
        const isCollapsed = Boolean(collapsedSections[sectionName]);
        const safeSectionName = escapeHtml(sectionName);
        const isClan = activeClan && activeClan.name === sectionName;
        const clanBadgeHtml = isClan ? '<span class="clan-badge">Shared</span>' : '';

        return `
            <div class="sidebar-section ${isCollapsed ? 'collapsed' : ''} ${isClan ? 'clan-section' : ''}" 
                 id="section-${safeSectionName}"
                 ondragover="handleSectionDragOver(event, '${safeSectionName}')"
                 ondragleave="handleSectionDragLeave(event, '${safeSectionName}')"
                 ondrop="handleSectionDrop(event, '${safeSectionName}')">
                <div class="section-header" onclick="toggleSectionCollapse('${safeSectionName}')">
                    <div class="section-title-group">
                        <span class="section-toggle-icon">▾</span>
                        <span class="section-title">${safeSectionName}</span>
                        ${clanBadgeHtml}
                        <span class="section-count">${sectionNotes.length}</span>
                    </div>
                    <div class="section-actions" onclick="event.stopPropagation()">
                        <button class="section-icon-btn" onclick="promptCreateNoteInSection('${safeSectionName}')" title="Add note to ${safeSectionName}">+</button>
                        ${sectionName !== 'General' && !isClan ? `
                            <button class="section-icon-btn" onclick="promptRenameSection('${safeSectionName}')" title="Rename section">✎</button>
                            <button class="section-icon-btn" onclick="confirmDeleteSection('${safeSectionName}')" title="Delete section">×</button>
                        ` : ''}
                    </div>
                </div>
                <div class="section-notes-container">
                    ${sectionNotes.length === 0 ? `
                        <p class="empty-state" style="padding: 4px 8px; font-size: 0.78rem;">Empty section (drop notes here)</p>
                    ` : sectionNotes.map(({ note, index }) => {
                        const isActive = index === activeNoteIndex;
                        return `
                            <div class="sidebar-note ${isActive ? 'active' : ''}" 
                                 draggable="true"
                                 ondragstart="handleNoteDragStart(event, ${index})"
                                 ondragend="handleNoteDragEnd(event)"
                                 onclick="loadNote(${index})">
                                <span class="sidebar-note-title">${escapeHtml(note.title || 'Untitled')}</span>
                                <div class="menu-wrapper">
                                    <button class="menu-btn" onclick="event.stopPropagation(); toggleMenu(${index})" title="Options">⋮</button>
                                    <div class="dropdown-menu" id="menu-${index}">
                                        <button onclick="event.stopPropagation(); deleteNote(${index})">Delete Note</button>
                                        <button onclick="event.stopPropagation(); exportSingleNote(${index})">Export Note</button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function deleteNote(index) {
    const noteToDelete = notes[index];
    const isClan = typeof isClanNote === 'function' ? isClanNote(noteToDelete) : false;
    const noteId = noteToDelete ? noteToDelete.id : null;
    const noteDate = noteToDelete ? noteToDelete.date : null;

    notes.splice(index, 1);
    safeStorageSet('my-notes', JSON.stringify(notes));

    if (activeNoteIndex === index) {
        activeNoteIndex = null;
        document.getElementById('note-title').value = '';
        document.getElementById('note-body').innerHTML = '';
    } else if (activeNoteIndex > index) {
        activeNoteIndex--;
    }

    renderNotes();

    // Broadcast note deletion only if it was an active clan shared note
    if (!isApplyingRemoteUpdate && typeof activeConnections !== 'undefined' && activeConnections.length > 0 && isClan && typeof activeClan !== 'undefined' && activeClan) {
        broadcastCollabMessage({
            type: 'NOTE_DELETED',
            clanCode: activeClan.code,
            id: noteId,
            date: noteDate
        });
    }
}

function toggleMenu(index) {
    const menu = document.getElementById(`menu-${index}`);
    document.querySelectorAll('.dropdown-menu').forEach(m => {
        if (m !== menu) m.style.display = 'none';
    });
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.menu-wrapper')) {
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
            menu.style.display = 'none';
        });
    }
    if (!e.target.closest('.bullet-wrapper')) {
        const bulletMenu = document.getElementById('bullet-menu');
        const fontMenu = document.getElementById('font-menu');
        const fontSizeMenu = document.getElementById('font-size-menu');
        if (bulletMenu) bulletMenu.classList.remove('open');
        if (fontMenu) fontMenu.classList.remove('open');
        if (fontSizeMenu) fontSizeMenu.classList.remove('open');
    }
});

// ─────────────────────────────────────────
// IMPORT NOTE FEATURE
// ─────────────────────────────────────────

/**
 * Triggers the file selection dialog by clicking the hidden file input element.
 * Called when the user clicks the "Import Note" button in the editor action bar.
 */
function triggerImportFile() {
    const fileInput = document.getElementById('import-file-input');
    if (fileInput) {
        fileInput.click();
    }
}

/**
 * Handles file selection and imports the text file as a new note in the notebook.
 * Supports .txt, .md, .html, and .json files. Automatically sets the note title
 * from the file name, converts line breaks to HTML formatting, saves the note into
 * localStorage, and opens it directly in the editor.
 * 
 * @param {Event} event - The file input change event object containing selected files.
 */
function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Extract file name without extension to use as default note title
    const fileName = file.name.replace(/\.[^/.]+$/, "");

    const reader = new FileReader();

    // Event handler executed once file reading completes
    reader.onload = function(e) {
        const fileContent = e.target.result || "";
        let formattedBody = "";

        // Format HTML files vs Plain Text / Markdown files
        if (file.type.includes("html") || file.name.endsWith(".html")) {
            formattedBody = fileContent;
        } else {
            // Convert plain text newlines into HTML breaks for contenteditable container
            formattedBody = escapeHtml(fileContent).replace(/\r\n|\r|\n/g, '<br>');
        }

        // Create new imported note object with persistent ID, default font, color, and section settings
        const importedNote = {
            id: generateNoteId(), // Assign persistent unique ID to prevent sync collisions
            title: fileName,
            body: formattedBody,
            date: new Date().toLocaleString(),
            font: "'Georgia', serif",
            fontSize: "1rem",
            colour: getDefaultColour(),
            section: activeSection || 'General'
        };

        // Add imported note to the top of the notes list array
        notes.unshift(importedNote);
        activeNoteIndex = 0;

        // Persist updated notebook list to LocalStorage safely
        safeStorageSet('my-notes', JSON.stringify(notes));

        // Load newly imported note into editor UI & refresh sidebar recents list
        loadNote(0);
        renderNotes();

        // Reset file input value so the user can import the same file again if desired
        event.target.value = "";
    };

    // Read file contents as UTF-8 plain text
    reader.readAsText(file);
}

function toggleExportMenu() {
    const exportMenu = document.getElementById('export-menu');
    const bulletMenu = document.getElementById('bullet-menu');
    const fontMenu = document.getElementById('font-menu');
    const fontSizeMenu = document.getElementById('font-size-menu');
    if (bulletMenu) bulletMenu.classList.remove('open');
    if (fontMenu) fontMenu.classList.remove('open');
    if (fontSizeMenu) fontSizeMenu.classList.remove('open');
    if (exportMenu) exportMenu.classList.toggle('open');
}

function cleanHtmlToText(html) {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    temp.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    temp.querySelectorAll('p, div, li, tr').forEach(block => {
        block.prepend(document.createTextNode('\n'));
    });
    
    let text = temp.textContent || temp.innerText || '';
    return text.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}

function exportSingleNoteHTML(index) {
    const exportMenu = document.getElementById('export-menu');
    if (exportMenu) exportMenu.classList.remove('open');

    let note = (index !== null && notes[index]) ? notes[index] : null;
    if (!note) {
        const currentTitle = document.getElementById('note-title').value.trim();
        const currentBody = document.getElementById('note-body').innerHTML;
        if (!currentBody) return;
        note = { title: currentTitle, body: currentBody, date: new Date().toLocaleString() };
    }

    const titleText = note.title ? escapeHtml(note.title) : 'Untitled Note';
    let htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${titleText}</title>
  <style>
    body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #37352f; padding: 40px; max-width: 720px; margin: auto; background: #ffffff; }
    h1 { font-family: 'Georgia', serif; font-size: 2rem; color: #111111; margin-bottom: 8px; border-bottom: 2px solid #e9e9e8; padding-bottom: 12px; }
    .note-date { font-size: 0.85rem; color: #787774; margin-bottom: 24px; }
    .note-content { font-size: 1rem; word-wrap: break-word; }
  </style>
</head>
<body>
  <h1>${titleText}</h1>
  <div class="note-date">Created: ${escapeHtml(note.date)}</div>
  <div class="note-content">${note.body}</div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (note.title || 'untitled-note').replace(/[\\/:*?"<>|]/g, '').trim();
    a.download = `${safeTitle}.html`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportSingleNoteTXT(index) {
    const exportMenu = document.getElementById('export-menu');
    if (exportMenu) exportMenu.classList.remove('open');

    let note = (index !== null && notes[index]) ? notes[index] : null;
    if (!note) {
        const currentTitle = document.getElementById('note-title').value.trim();
        const currentBody = document.getElementById('note-body').innerHTML;
        if (!currentBody) return;
        note = { title: currentTitle, body: currentBody, date: new Date().toLocaleString() };
    }

    const plainBody = cleanHtmlToText(note.body);
    const text = `${note.title ? note.title + '\r\n\r\n' : ''}${plainBody}\r\n\r\n— ${note.date}`;
    
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (note.title || 'untitled-note').replace(/[\\/:*?"<>|]/g, '').trim();
    a.download = `${safeTitle}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportAllNotesHTML() {
    const exportMenu = document.getElementById('export-menu');
    if (exportMenu) exportMenu.classList.remove('open');

    const now = new Date().toLocaleString();
    let htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>All Notes Export</title>
  <style>
    body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #37352f; padding: 40px; max-width: 800px; margin: auto; background: #f7f6f3; }
    h1 { font-family: 'Georgia', serif; text-align: center; color: #111111; margin-bottom: 30px; }
    .note-card { background: #ffffff; border: 1px solid #e9e9e8; border-radius: 10px; padding: 24px; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
    .note-title { font-size: 1.4rem; font-weight: 600; color: #222222; margin: 0 0 8px 0; border-bottom: 1px solid #f0f0f0; padding-bottom: 8px; }
    .note-date { font-size: 0.8rem; color: #888888; margin-bottom: 16px; }
    .note-body { font-size: 1rem; word-wrap: break-word; }
  </style>
</head>
<body>
  <h1>My Notebook Export — ${now}</h1>`;

    notes.forEach(note => {
        const title = escapeHtml(note.title || 'Untitled Note');
        htmlContent += `
  <div class="note-card">
    <div class="note-title">${title}</div>
    <div class="note-date">${escapeHtml(note.date)}</div>
    <div class="note-body">${note.body}</div>
  </div>`;
    });

    htmlContent += `\n</body>\n</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `all-notes-${new Date().toISOString().slice(0,10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportAllNotesTXT() {
    const exportMenu = document.getElementById('export-menu');
    if (exportMenu) exportMenu.classList.remove('open');

    const now = new Date().toLocaleString();
    let text = '========================================\r\n';
    text += ' My Notes Export — ' + now + '\r\n';
    text += '========================================\r\n\r\n';
    notes.forEach(note => {
        text += note.title ? '[ ' + note.title + ' ]\r\n' : '[ Untitled ]\r\n';
        text += cleanHtmlToText(note.body) + '\r\n';
        text += '— ' + note.date + '\r\n\r\n';
        text += '----------------------------------------\r\n\r\n';
    });
    if (notes.length === 0) text += 'No notes yet.\r\n';
    
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-notes.txt';
    a.click();
    URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────
// CUSTOM CENTERED COLOR PICKER MODAL
// ─────────────────────────────────────────

let pendingModalColor = '#37352f';
let savedSelectionRange = null;

function openColorPickerModal() {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
        savedSelectionRange = selection.getRangeAt(0).cloneRange();
    } else {
        savedSelectionRange = null;
    }

    pendingModalColor = currentColour || getDefaultColour();
    updateModalColorUI(pendingModalColor);

    const modal = document.getElementById('color-picker-modal');
    if (modal) modal.showModal();
}

function closeColorPickerModal() {
    const modal = document.getElementById('color-picker-modal');
    if (modal) modal.close();
}

function selectModalColor(colorHex) {
    pendingModalColor = colorHex;
    updateModalColorUI(colorHex);
}

function onHexTextInput(val) {
    if (/^#[0-9A-F]{6}$/i.test(val) || /^#[0-9A-F]{3}$/i.test(val)) {
        pendingModalColor = val;
        updateModalColorUI(val, false);
    }
}

function updateModalColorUI(colorHex, updateHexText = true) {
    const previewDot = document.getElementById('modal-color-preview');
    if (previewDot) previewDot.style.background = colorHex;

    const nativePicker = document.getElementById('modal-hex-picker');
    if (nativePicker && /^#[0-9A-F]{6}$/i.test(colorHex)) {
        nativePicker.value = colorHex;
    }

    if (updateHexText) {
        const hexText = document.getElementById('modal-hex-text');
        if (hexText) hexText.value = colorHex;
    }
}

function applyModalColor() {
    if (savedSelectionRange) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedSelectionRange);
    }

    changeColour(pendingModalColor);
    closeColorPickerModal();
}

/**
 * Determines whether the current device/viewport is in a mobile or landscape-constrained view.
 * Checks viewport width, height (for phone landscape), and touch/pointer characteristics.
 * @returns {boolean} True if in mobile or phone landscape mode.
 */
function isMobileViewport() {
    const isNarrow = window.innerWidth <= 768;
    const isShortLandscape = window.innerHeight <= 550 && window.innerWidth <= 1024;
    const isTouchLandscape = window.matchMedia('(orientation: landscape)').matches && 
                             window.matchMedia('(hover: none) and (pointer: coarse)').matches && 
                             window.innerWidth <= 1024;
    return isNarrow || isShortLandscape || isTouchLandscape;
}

// Check saved preference or default to collapsed on mobile screens / phone landscape
let savedSidebarState = localStorage.getItem("sidebarCollapsed");
let sidebarCollapsed = savedSidebarState !== null ? savedSidebarState === "true" : isMobileViewport();

/**
 * Toggles the sidebar visibility between open and collapsed states.
 * Updates DOM classes, toggle button indicator arrow, and persists preference.
 */
function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;

    const sidebar = document.querySelector(".sidebar");
    const button = document.getElementById("sidebar-toggle");

    if (sidebar) sidebar.classList.toggle("collapsed", sidebarCollapsed);
    if (button) button.textContent = sidebarCollapsed ? "❯" : "❮";

    localStorage.setItem("sidebarCollapsed", sidebarCollapsed);
}

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
setTheme(currentTheme);
setAccentColor(currentAccent);
changeLineHeight(currentLineHeight);
changePageWidth(currentPageWidth);
toggleSpellcheck(currentSpellcheck);

renderNotes();
renderColourButtons();
const button = document.getElementById("sidebar-toggle");

if (sidebarCollapsed) {
    document.querySelector(".sidebar").classList.add("collapsed");
    if (button) button.textContent = "❯";
} else {
    if (button) button.textContent = "❮";
}

// Settings Modal Backdrop Click
const modal = document.getElementById('settings-modal');
if (modal) {
    modal.addEventListener('click', function(e) {
        if (e.target === this) closeSettingsModal();
    });
}

// Color Picker Modal Backdrop Click
const colorPickerModal = document.getElementById('color-picker-modal');
if (colorPickerModal) {
    colorPickerModal.addEventListener('click', function(e) {
        if (e.target === this) closeColorPickerModal();
    });
}

// Keyboard shortcut (Ctrl + , or Cmd + ,) to open settings
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        openSettingsModal();
    }
});

// Collaboration Modal Backdrop Click
const collabModal = document.getElementById('collab-modal');
if (collabModal) {
    collabModal.addEventListener('click', function(e) {
        if (e.target === this) closeCollabModal();
    });
}

// ─────────────────────────────────────────
// PERSISTENT CLAN & SHARED NOTES (PEERJS)
// ─────────────────────────────────────────


/**
 * Opens the Clan modal dialog and refreshes its view based on current membership.
 */
function openCollabModal() {
    const modal = document.getElementById('collab-modal');
    if (modal) {
        updateCollabModalUI();
        modal.showModal();
    }
}

/**
 * Closes the Clan modal dialog.
 */
function closeCollabModal() {
    const modal = document.getElementById('collab-modal');
    if (modal) {
        modal.close();
    }
}

/**
 * Generates an easily readable 6-character room code string.
 * Omits easily confused characters like 0, O, 1, and I for clarity.
 * @returns {string} The randomly generated uppercase room code.
 */
function generateRoomCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Updates the text, pulse indicator, and badges for clan status across the app.
 * @param {string} statusText - The human-readable status description.
 * @param {string} mode - The current state: 'offline', 'hosting', or 'connected'.
 */
function updateCollabStatus(statusText, mode = 'offline') {
    const headerTextEl = document.getElementById('collab-status-text');
    const headerBadgeEl = document.getElementById('collab-status-badge');
    const cardEl = document.getElementById('collab-status-card');
    const detailEl = document.getElementById('collab-status-detail');

    if (headerTextEl) headerTextEl.textContent = statusText;
    if (detailEl) detailEl.textContent = statusText;

    if (headerBadgeEl) {
        headerBadgeEl.classList.remove('connected', 'hosting');
        if (mode === 'connected') headerBadgeEl.classList.add('connected');
        else if (mode === 'hosting') headerBadgeEl.classList.add('hosting');
    }

    if (cardEl) {
        cardEl.classList.remove('connected', 'hosting');
        if (mode === 'connected') cardEl.classList.add('connected');
        else if (mode === 'hosting') cardEl.classList.add('hosting');
    }
}

/**
 * Updates visible views, clan name fields, and subtexts in the collaboration modal.
 */
function updateCollabModalUI() {
    const dashboardView = document.getElementById('clan-dashboard-view');
    const setupView = document.getElementById('clan-setup-view');
    const clanNameEl = document.getElementById('clan-dashboard-name');
    const roomCodeVal = document.getElementById('current-room-code');
    const subtextEl = document.getElementById('collab-status-subtext');

    if (activeClan) {
        if (dashboardView) dashboardView.style.display = 'flex';
        if (setupView) setupView.style.display = 'none';
        if (clanNameEl) clanNameEl.textContent = activeClan.name;
        if (roomCodeVal) roomCodeVal.textContent = activeClan.code;

        if (activeConnections.length > 0) {
            if (subtextEl) subtextEl.textContent = 'Synchronizing with ' + activeConnections.length + ' collaborator online.';
        } else {
            if (subtextEl) subtextEl.textContent = 'Connected in background. Notes stay saved locally.';
        }
    } else {
        if (dashboardView) dashboardView.style.display = 'none';
        if (setupView) setupView.style.display = 'flex';
    }
}

/**
 * Handles creating a brand new Clan.
 * Generates a unique room code, sets up the clan section, saves membership, and connects.
 */
function handleCreateClan() {
    const input = document.getElementById('create-clan-input');
    const clanName = input && input.value.trim() ? input.value.trim() : 'Shared Notes';

    const code = generateRoomCode();
    activeClan = {
        code: code,
        name: clanName,
        role: 'creator',
        joinedAt: new Date().toISOString()
    };

    localStorage.setItem('draftly-clan', JSON.stringify(activeClan));

    // Ensure the clan section exists in sections
    if (!sections.includes(clanName)) {
        sections.push(clanName);
        localStorage.setItem('my-sections', JSON.stringify(sections));
    }

    renderNotes();
    updateCollabModalUI();
    autoConnectClan();
}

/**
 * Handles joining an existing clan via room code from input element.
 */
function handleJoinFromInput() {
    const input = document.getElementById('join-room-input');
    if (!input || !input.value.trim()) return;

    const code = input.value.trim().toUpperCase();
    joinClanByCode(code);
}

/**
 * Joins a clan by room code and persists membership to localStorage.
 * @param {string} code - The 6-character clan code.
 * @param {string} [name] - Optional clan name.
 */
function joinClanByCode(code, name) {
    if (!code) return;
    const cleanCode = code.trim().toUpperCase();
    const clanName = name || 'Shared Notes';

    activeClan = {
        code: cleanCode,
        name: clanName,
        role: 'member',
        joinedAt: new Date().toISOString()
    };

    localStorage.setItem('draftly-clan', JSON.stringify(activeClan));

    // Ensure the clan section exists in sections
    if (!sections.includes(clanName)) {
        sections.push(clanName);
        localStorage.setItem('my-sections', JSON.stringify(sections));
    }

    renderNotes();
    updateCollabModalUI();
    autoConnectClan();
}

/**
 * Disconnects from active clan, clears clan profile from localStorage,
 * and resets the UI back to setup mode while preserving local notes.
 */
function confirmLeaveClan() {
    if (!activeClan) return;

    const confirmed = window.confirm(
        'Are you sure you want to stop sharing ' + activeClan.name + '?\nAll notes currently in this section will stay saved on your device as local notes.'
    );

    if (!confirmed) return;

    // Disconnect peer connections
    activeConnections.forEach(conn => {
        try { conn.close(); } catch (e) {}
    });
    activeConnections = [];

    if (peerInstance) {
        try { peerInstance.destroy(); } catch (e) {}
        peerInstance = null;
    }

    clearTimeout(clanReconnectTimer);

    // Remove clan profile from localStorage
    localStorage.removeItem('draftly-clan');
    activeClan = null;

    updateCollabStatus('Not Sharing', 'offline');
    updateCollabModalUI();
    renderNotes();
}

/**
 * Connects to the clan network in the background automatically.
 * Implements adaptive host election: tries connecting as member; if no host exists, becomes room host.
 */
function autoConnectClan() {
    if (!activeClan || !activeClan.code) return;

    // Verify external PeerJS CDN library is loaded before attempting connection
    if (typeof Peer === 'undefined') {
        console.warn('PeerJS library unavailable or blocked by network. Operating in standalone mode.');
        updateCollabStatus('Not Sharing', 'offline');
        return;
    }

    if (peerInstance) {
        try { peerInstance.destroy(); } catch (e) {}
        peerInstance = null;
    }

    updateCollabStatus(activeClan.name + ': Connecting...', 'hosting');

    // Attempt to connect as client first
    try {
        peerInstance = new Peer({ debug: 1 });

        peerInstance.on('open', () => {
            const conn = peerInstance.connect(PEER_ROOM_PREFIX + activeClan.code, {
                reliable: true
            });

            setupPeerConnection(conn);

            // If connection doesn't open within 6 seconds (host not present or slow ICE gathering), elect this device as host
            const connectionTimeout = setTimeout(() => {
                if (activeConnections.length === 0) {
                    try {
                        peerInstance.destroy();
                    } catch (e) {}
                    becomeClanHost();
                }
            }, 6000);

            conn.on('open', () => {
                clearTimeout(connectionTimeout);
            });
        });

        peerInstance.on('error', (err) => {
            becomeClanHost();
        });
    } catch (e) {
        console.error('Failed auto-connecting to clan:', e);
        becomeClanHost();
    }
}

/**
 * Elects this client as the active host anchor for the clan room.
 */
function becomeClanHost() {
    if (!activeClan || !activeClan.code) return;

    // Verify external PeerJS CDN library is loaded
    if (typeof Peer === 'undefined') {
        console.warn('PeerJS library unavailable or blocked.');
        return;
    }

    if (peerInstance) {
        try { peerInstance.destroy(); } catch (e) {}
        peerInstance = null;
    }

    isHostingClan = true;

    try {
        peerInstance = new Peer(PEER_ROOM_PREFIX + activeClan.code, { debug: 1 });

        peerInstance.on('open', () => {
            updateCollabStatus(activeClan.name + ' (Online)', 'hosting');
            updateCollabModalUI();
        });

        peerInstance.on('connection', (conn) => {
            setupPeerConnection(conn);
        });

        peerInstance.on('error', (err) => {
            console.error('Host peer error:', err);
            // Retry after delay if ID collision or network blip
            clearTimeout(clanReconnectTimer);
            clanReconnectTimer = setTimeout(autoConnectClan, 8000);
        });
    } catch (e) {
        console.error('Failed to become clan host:', e);
    }
}

/**
 * Sets up listeners for a peer connection and exchanges initial clan notes snapshot.
 * Transmits ONLY clan notes; personal notes are never shared.
 * @param {DataConnection} conn - The PeerJS data connection.
 */
function setupPeerConnection(conn) {
    conn.on('open', () => {
        if (!activeConnections.includes(conn)) {
            activeConnections.push(conn);
        }

        updateCollabStatus(activeClan ? activeClan.name + ' (Connected)' : 'Connected', 'connected');
        updateCollabModalUI();

        // Transmit current clan notes snapshot (ONLY clan notes, personal notes excluded)
        const clanNotes = notes.filter(n => isClanNote(n));
        conn.send({
            type: 'SYNC_CLAN',
            clanName: activeClan ? activeClan.name : 'Shared Notes',
            clanCode: activeClan ? activeClan.code : '',
            notes: clanNotes
        });
    });

    conn.on('data', (data) => {
        handlePeerData(data, conn);
    });

    conn.on('close', () => {
        activeConnections = activeConnections.filter(c => c !== conn);
        if (activeConnections.length === 0) {
            updateCollabStatus(activeClan ? activeClan.name + ' (Online)' : 'Not Sharing', 'hosting');
        } else {
            updateCollabStatus(activeClan ? activeClan.name + ' (Connected)' : 'Connected', 'connected');
        }
        updateCollabModalUI();
    });

    conn.on('error', (err) => {
        console.error('Peer connection error:', err);
    });
}

/**
 * Handles incoming real-time synchronization payloads received from peer connections.
 * Merges clan updates without touching any of the user's private personal notes.
 * @param {Object} data - The message payload transmitted by a peer.
 */
function handlePeerData(data, senderConn = null) {
    if (!data || !data.type || !activeClan) return;

    // Relay to other connected peers if this client is hosting the room (enables multi-device mesh)
    if (isHostingClan && activeConnections.length > 1) {
        activeConnections.forEach(c => {
            if (c && c.open && c !== senderConn) {
                try { c.send(data); } catch (e) {}
            }
        });
    }

    isApplyingRemoteUpdate = true;

    try {
        if (data.type === 'SYNC_CLAN') {
            // Update clan name if sent
            if (data.clanName && activeClan.name !== data.clanName) {
                activeClan.name = data.clanName;
                safeStorageSet('draftly-clan', JSON.stringify(activeClan));
            }

            // Extract existing personal notes (must remain untouched)
            const personalNotes = notes.filter(n => !isClanNote(n));

            // Merge incoming clan notes with dual-key deduplication (ID + content)
            // This handles the case where different devices generated different
            // unique IDs for the same note during the migration to persistent IDs
            const incomingClanNotes = (data.notes || []).map(n => ({
                ...n,
                id: n.id || generateNoteId(),
                section: activeClan.name
            }));

            // Helper: content fingerprint for identifying identical notes across devices
            function clanContentKey(n) {
                return (n.title || '').trim() + ':::' + (n.body || '').trim();
            }

            const mergedClanNotes = [];
            const seenIds = new Set();
            const seenContent = new Set();

            // First pass: add all incoming notes from peer and track both IDs and content
            incomingClanNotes.forEach(n => {
                if (n.id) seenIds.add(n.id);
                seenContent.add(clanContentKey(n));
                mergedClanNotes.push(n);
            });

            // Second pass: add local clan notes that are genuinely different from incoming
            // Uses content-based matching as fallback when IDs differ across devices
            notes.filter(n => isClanNote(n)).forEach(localNote => {
                const matchedById = localNote.id && seenIds.has(localNote.id);
                const localCk = clanContentKey(localNote);
                const matchedByContent = seenContent.has(localCk);

                if (!matchedById && !matchedByContent) {
                    // Genuinely unique local note not present in peer sync
                    if (localNote.id) seenIds.add(localNote.id);
                    seenContent.add(localCk);
                    mergedClanNotes.push(localNote);
                } else if (matchedByContent && !matchedById && localNote.id) {
                    // Same content exists from peer but with a different ID
                    // Use deterministic tiebreaker (smaller ID wins) so both devices
                    // converge to the same canonical ID regardless of sync order
                    const peerNote = mergedClanNotes.find(n => clanContentKey(n) === localCk);
                    if (peerNote && localNote.id < peerNote.id) {
                        peerNote.id = localNote.id;
                    }
                }
            });

            // Preserve reference to currently opened note across array rebuild
            const currentActiveNote = (activeNoteIndex !== null && notes[activeNoteIndex]) ? notes[activeNoteIndex] : null;
            const currentActiveId = currentActiveNote ? currentActiveNote.id : null;
            const currentActiveDate = currentActiveNote ? currentActiveNote.date : null;

            // Combine into unified notebook
            notes = [...mergedClanNotes, ...personalNotes];
            safeStorageSet('my-notes', JSON.stringify(notes));

            // Remap active note index in new notes array
            if (currentActiveNote) {
                const remappedIndex = notes.findIndex(n => 
                    (currentActiveId && n.id === currentActiveId) || 
                    (currentActiveDate && n.date === currentActiveDate)
                );
                activeNoteIndex = remappedIndex !== -1 ? remappedIndex : null;
            }

            // Ensure clan section exists
            if (!sections.includes(activeClan.name)) {
                sections.push(activeClan.name);
                safeStorageSet('my-sections', JSON.stringify(sections));
            }

            renderNotes();
            updateCollabModalUI();
        } else if (data.type === 'NOTE_EDIT_LIVE') {
            // Live typing update: match by persistent ID first, then date fallback
            let targetNote = notes.find(n => isClanNote(n) && data.id && n.id === data.id);

            // Date-based fallback if ID match fails (handles cross-device ID mismatch)
            if (!targetNote && data.date) {
                targetNote = notes.find(n => isClanNote(n) && n.date === data.date);
            }

            // Content-based fallback if both ID and date fail
            if (!targetNote) {
                const incomingCk = (data.title || '').trim() + ':::' + (data.body || '').trim();
                if (incomingCk !== ':::') {
                    targetNote = notes.find(n => isClanNote(n) && ((n.title || '').trim() + ':::' + (n.body || '').trim()) === incomingCk);
                }
            }

            // If note does not exist on this client yet, create it dynamically so typing streams immediately
            if (!targetNote) {
                targetNote = {
                    id: data.id || generateNoteId(),
                    title: data.title || '',
                    body: data.body || '',
                    date: data.date || new Date().toLocaleString(),
                    font: "'Georgia', serif",
                    fontSize: "1rem",
                    colour: getDefaultColour(),
                    section: activeClan.name
                };
                notes.unshift(targetNote);
                if (activeNoteIndex !== null) {
                    activeNoteIndex++;
                }
                safeStorageSet('my-notes', JSON.stringify(notes));
            } else {
                targetNote.title = data.title;
                targetNote.body = data.body;

                // Reconcile IDs so future lookups use the exact same ID across devices
                if (data.id && targetNote.id !== data.id) {
                    targetNote.id = data.id;
                    safeStorageSet('my-notes', JSON.stringify(notes));
                }
            }

            // Check if user is currently viewing this note in the active editor
            const isViewingThisNote = activeNoteIndex !== null && notes[activeNoteIndex] && (
                notes[activeNoteIndex] === targetNote ||
                (targetNote.id && notes[activeNoteIndex].id === targetNote.id) ||
                (targetNote.date && notes[activeNoteIndex].date === targetNote.date)
            );

            if (isViewingThisNote) {
                // Keep activeNoteIndex aligned with targetNote's position in notes array
                activeNoteIndex = notes.indexOf(targetNote);

                const titleEl = document.getElementById('note-title');
                const bodyEl = document.getElementById('note-body');
                if (titleEl && titleEl.value !== data.title) {
                    titleEl.value = data.title;
                }
                if (bodyEl && bodyEl.innerHTML !== data.body) {
                    bodyEl.innerHTML = data.body;
                }
            }
            renderNotes();
        } else if (data.type === 'NOTE_SAVED') {
            // Saved clan note
            if (data.note) {
                const incomingNote = {
                    ...data.note,
                    id: data.note.id || generateNoteId(),
                    section: activeClan.name
                };

                // Match by unique persistent ID first
                let existingIndex = notes.findIndex(n => isClanNote(n) && incomingNote.id && n.id === incomingNote.id);

                // Date-based fallback if ID match fails
                if (existingIndex === -1 && incomingNote.date) {
                    existingIndex = notes.findIndex(n => isClanNote(n) && n.date === incomingNote.date);
                }

                // Content-based fallback if both ID and date fail
                if (existingIndex === -1) {
                    const incomingCk = (incomingNote.title || '').trim() + ':::' + (incomingNote.body || '').trim();
                    if (incomingCk !== ':::') {
                        existingIndex = notes.findIndex(n => isClanNote(n) && ((n.title || '').trim() + ':::' + (n.body || '').trim()) === incomingCk);
                    }
                }

                if (existingIndex !== -1) {
                    // Update note in-place without creating duplicate copies
                    notes[existingIndex] = {
                        ...notes[existingIndex],
                        ...incomingNote,
                        id: incomingNote.id // Reconcile to sender's canonical ID
                    };

                    // Check if user is currently viewing this note in the active editor
                    const isViewingSaved = activeNoteIndex !== null && (
                        activeNoteIndex === existingIndex ||
                        (notes[activeNoteIndex] && (
                            (incomingNote.id && notes[activeNoteIndex].id === incomingNote.id) ||
                            (incomingNote.date && notes[activeNoteIndex].date === incomingNote.date)
                        ))
                    );

                    if (isViewingSaved) {
                        activeNoteIndex = existingIndex;
                        const titleEl = document.getElementById('note-title');
                        const bodyEl = document.getElementById('note-body');
                        if (titleEl && titleEl.value !== incomingNote.title) {
                            titleEl.value = incomingNote.title;
                        }
                        if (bodyEl && bodyEl.innerHTML !== incomingNote.body) {
                            bodyEl.innerHTML = incomingNote.body;
                        }
                    }
                } else {
                    // Genuine new note created by peer
                    notes.unshift(incomingNote);
                    if (activeNoteIndex !== null) {
                        activeNoteIndex++;
                    }
                }

                safeStorageSet('my-notes', JSON.stringify(notes));
                renderNotes();
            }
        } else if (data.type === 'NOTE_DELETED') {
            // Match note to remove by persistent ID first, then fallback to date
            let deleteIndex = notes.findIndex(n => isClanNote(n) && data.id && n.id === data.id);
            if (deleteIndex === -1 && data.date) {
                deleteIndex = notes.findIndex(n => isClanNote(n) && n.date === data.date);
            }

            if (deleteIndex !== -1) {
                notes.splice(deleteIndex, 1);
                safeStorageSet('my-notes', JSON.stringify(notes));
                if (activeNoteIndex === deleteIndex) {
                    activeNoteIndex = null;
                    document.getElementById('note-title').value = '';
                    document.getElementById('note-body').innerHTML = '';
                } else if (activeNoteIndex > deleteIndex) {
                    activeNoteIndex--;
                }
                renderNotes();
            }
        }
    } finally {
        isApplyingRemoteUpdate = false;
    }
}

/**
 * Broadcasts an event payload to all open active peer connections in the clan.
 * @param {Object} message - The payload object to transmit.
 */
function broadcastCollabMessage(message) {
    activeConnections.forEach(conn => {
        if (conn && conn.open) {
            try {
                conn.send(message);
            } catch (err) {
                console.error('Failed to broadcast to peer connection:', err);
            }
        }
    });
}

/**
 * Copies the full URL with the active clan code parameter to clipboard for 1-click joining.
 */
function copyCollabLink() {
    if (!activeClan || !activeClan.code) return;
    const url = new URL(window.location.href);
    url.searchParams.set('clan', activeClan.code);
    const shareUrl = url.toString();

    navigator.clipboard.writeText(shareUrl).then(() => {
        const copyBtn = document.getElementById('copy-link-btn');
        if (copyBtn) {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Link Copied!';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 2000);
        }
    }).catch(() => {
        window.prompt('Copy this invite link:', shareUrl);
    });
}

// Check for persistent Clan membership on page launch and auto-connect
if (activeClan && activeClan.code) {
    updateCollabStatus(activeClan.name + ': Connecting...', 'hosting');
    setTimeout(autoConnectClan, 300);
} else {
    updateCollabStatus('Not Sharing', 'offline');
}
updateCollabModalUI();

// Check URL query parameters for ?clan=CODE or legacy ?room=CODE
const urlParams = new URLSearchParams(window.location.search);
const sharedClanParam = urlParams.get('clan') || urlParams.get('room');
if (sharedClanParam && (!activeClan || activeClan.code !== sharedClanParam)) {
    setTimeout(() => {
        openCollabModal();
        joinClanByCode(sharedClanParam);
    }, 400);
}
