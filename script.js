let currentTheme = localStorage.getItem('theme') || 'light';
let currentAccent = localStorage.getItem('accent') || 'blue';
let currentLineHeight = localStorage.getItem('lineHeight') || '1.8';
let currentPageWidth = localStorage.getItem('pageWidth') || '680px';
let currentSpellcheck = localStorage.getItem('spellcheck') !== 'false';

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

// List of user-created notes from local storage
let notes = JSON.parse(localStorage.getItem('my-notes') || '[]');

// Sidebar sub-sections list and collapsed state tracker
let sections = JSON.parse(localStorage.getItem('my-sections') || '["General"]');
let collapsedSections = JSON.parse(localStorage.getItem('collapsed-sections') || '{}');
let activeSection = 'General';

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

    // Auto-close sidebar drawer on mobile devices when a note is opened
    if (window.innerWidth <= 768 && !sidebarCollapsed) {
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
    const bodyHtml = bodyEl.innerHTML;
    const bodyText = bodyEl.innerText.trim();

    if (!bodyText && !bodyHtml.includes('<img')) return;

    // Retain existing assigned section or use currently active section
    const existingSection = (activeNoteIndex !== null && notes[activeNoteIndex]) 
        ? (notes[activeNoteIndex].section || 'General') 
        : (activeSection || 'General');

    const noteToSave = {
        title:    title,
        body:     bodyHtml,
        date:     new Date().toLocaleString(),
        font:     currentFont,
        fontSize: currentFontSize,
        colour:   currentColour,
        section:  existingSection
    };

    if (activeNoteIndex === null) {
        notes.unshift(noteToSave);
        activeNoteIndex = 0;
    } else {
        notes[activeNoteIndex] = noteToSave;
    }

    localStorage.setItem('my-notes', JSON.stringify(notes));
    renderNotes();
}

function scheduleAutoSave() {
    if (isLoadingNote) return;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        const bodyEl = document.getElementById("note-body");
        if (bodyEl && (bodyEl.innerText.trim() !== "" || bodyEl.innerHTML.includes('<img'))) {
            saveNote();
        }
    }, 800);
}

document.getElementById("note-title").addEventListener("input", scheduleAutoSave);
document.getElementById("note-body").addEventListener("input", scheduleAutoSave);

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
        // Update note's section assignment
        notes[noteIndex].section = sectionName;
        // Auto-expand destination section so the user sees their moved note
        collapsedSections[sectionName] = false;

        localStorage.setItem('my-notes', JSON.stringify(notes));
        localStorage.setItem('collapsed-sections', JSON.stringify(collapsedSections));
        renderNotes();
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

        return `
            <div class="sidebar-section ${isCollapsed ? 'collapsed' : ''}" 
                 id="section-${safeSectionName}"
                 ondragover="handleSectionDragOver(event, '${safeSectionName}')"
                 ondragleave="handleSectionDragLeave(event, '${safeSectionName}')"
                 ondrop="handleSectionDrop(event, '${safeSectionName}')">
                <div class="section-header" onclick="toggleSectionCollapse('${safeSectionName}')">
                    <div class="section-title-group">
                        <span class="section-toggle-icon">▾</span>
                        <span class="section-title">${safeSectionName}</span>
                        <span class="section-count">${sectionNotes.length}</span>
                    </div>
                    <div class="section-actions" onclick="event.stopPropagation()">
                        <button class="section-icon-btn" onclick="promptCreateNoteInSection('${safeSectionName}')" title="Add note to ${safeSectionName}">+</button>
                        ${sectionName !== 'General' ? `
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
    notes.splice(index, 1);
    localStorage.setItem('my-notes', JSON.stringify(notes));

    if (activeNoteIndex === index) {
        activeNoteIndex = null;
        document.getElementById('note-title').value = '';
        document.getElementById('note-body').value  = '';
    } else if (activeNoteIndex > index) {
        activeNoteIndex--;
    }

    renderNotes();
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
 * Called when the user clicks the "📥 Import Note" button in the editor action bar.
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

        // Create new imported note object with default font, color, and section settings
        const importedNote = {
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

        // Persist updated notebook list to LocalStorage
        localStorage.setItem('my-notes', JSON.stringify(notes));

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

// Check saved preference or default to collapsed on mobile screens (<= 768px)
let savedSidebarState = localStorage.getItem("sidebarCollapsed");
let sidebarCollapsed = savedSidebarState !== null ? savedSidebarState === "true" : window.innerWidth <= 768;

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
