let currentFont     = "'Georgia', serif";
let currentFontSize = "1rem";
let currentColour   = "#c9c9c9";
let isLoadingNote   = false;
let activeNoteIndex = null;
let saveTimeout;

let notes = JSON.parse(localStorage.getItem('my-notes') || '[]');

let recentColours = JSON.parse(localStorage.getItem("recentColours")) || [
    "#c9c9c9", "#ffffff", "#a8d8a8", "#a8c4e8",
    "#e8c4a8", "#e8a8c4", "#d4a8e8"
];

// ─────────────────────────────────────────
// STYLE CHANGERS
// Each one updates the global variable, applies the style visually,
// then saves the current note immediately (only if one is open).
// ─────────────────────────────────────────

function changeFont(fontValue) {
    currentFont = fontValue;
    document.getElementById('note-title').style.fontFamily = fontValue;
    document.getElementById('note-body').style.fontFamily  = fontValue;
    if (activeNoteIndex !== null) saveNote();
}

function changeFontSize(sizeValue) {
    currentFontSize = sizeValue;
    document.getElementById('note-title').style.fontSize = sizeValue;
    document.getElementById('note-body').style.fontSize  = sizeValue;
    if (activeNoteIndex !== null) saveNote();
}

function changeColour(colourValue, btn) {
    currentColour = colourValue;
    document.getElementById('note-title').style.color = colourValue;
    document.getElementById('note-body').style.color  = colourValue;

    // Update recent colours list
    recentColours = recentColours.filter(c => c !== colourValue);
    recentColours.unshift(colourValue);
    recentColours = recentColours.slice(0, 7);
    localStorage.setItem("recentColours", JSON.stringify(recentColours));

    renderColourButtons();
    if (activeNoteIndex !== null) saveNote();
}

function chooseCustomColour(colour) {
    changeColour(colour, null);
}

// ─────────────────────────────────────────
// RENDER COLOUR BUTTONS
// Rebuilds the colour button row from recentColours.
// Marks whichever colour matches currentColour as active.
// ─────────────────────────────────────────

function renderColourButtons() {
    const container = document.getElementById("colour-options");
    container.innerHTML = "";

    recentColours.forEach(colour => {
        const button = document.createElement("button");
        button.className = "colour-btn";
        button.style.background = colour;
        if (colour === currentColour) {
            button.classList.add("active");
        }
        button.onclick = function() { changeColour(colour, button); };
        container.appendChild(button);
    });
}

// ─────────────────────────────────────────
// NEW NOTE
// Clears the editor and resets all styles to defaults.
// Sets activeNoteIndex to null so saveNote() creates a new note.
// ─────────────────────────────────────────

function newNote() {
    clearTimeout(saveTimeout);
    isLoadingNote = true;

    activeNoteIndex = null;

    document.getElementById("note-title").value = "";
    document.getElementById("note-body").value  = "";

    currentFont     = "'Georgia', serif";
    currentFontSize = "1rem";
    currentColour   = "#c9c9c9";

    document.getElementById('note-title').style.fontFamily = currentFont;
    document.getElementById('note-body').style.fontFamily  = currentFont;
    document.getElementById('note-title').style.fontSize   = currentFontSize;
    document.getElementById('note-body').style.fontSize    = currentFontSize;
    document.getElementById('note-title').style.color      = currentColour;
    document.getElementById('note-body').style.color       = currentColour;

    document.getElementById('font-select').value      = "'Georgia', serif";
    document.getElementById('font-size-select').value = "1rem";

    renderColourButtons();

    isLoadingNote = false;
    document.getElementById("note-title").focus();
}

// ─────────────────────────────────────────
// LOAD NOTE
// Loads a saved note into the editor.
// Sets isLoadingNote = true to block autosave while loading.
// ─────────────────────────────────────────

function loadNote(index) {
    clearTimeout(saveTimeout);
    isLoadingNote = true;

    const note = notes[index];
    activeNoteIndex = index;

    document.getElementById('note-title').value = note.title || "";
    document.getElementById('note-body').value  = note.body  || "";

    // Read saved styles, fall back to defaults if not set
    currentFont     = note.font     || "'Georgia', serif";
    currentFontSize = note.fontSize || "1rem";
    currentColour   = note.colour   || "#c9c9c9";

    // Apply styles to the editor
    document.getElementById('note-title').style.fontFamily = currentFont;
    document.getElementById('note-body').style.fontFamily  = currentFont;
    document.getElementById('note-title').style.fontSize   = currentFontSize;
    document.getElementById('note-body').style.fontSize    = currentFontSize;
    document.getElementById('note-title').style.color      = currentColour;
    document.getElementById('note-body').style.color       = currentColour;

    // Sync dropdowns to match
    document.getElementById('font-select').value      = currentFont;
    document.getElementById('font-size-select').value = currentFontSize;

    renderColourButtons();

    isLoadingNote = false;
}

// ─────────────────────────────────────────
// SAVE NOTE
// Saves or updates the current note.
// For new notes: adds to the END so existing indexes don't shift.
// For existing notes: updates in place at activeNoteIndex.
// ─────────────────────────────────────────

function saveNote() {
    const title = document.getElementById('note-title').value.trim();
    const body  = document.getElementById('note-body').value.trim();

    if (!body) return;

    const noteToSave = {
        title:    title,
        body:     body,
        date:     new Date().toLocaleString(),
        font:     currentFont,
        fontSize: currentFontSize,
        colour:   currentColour
    };

    if (activeNoteIndex === null) {
        // New note — push to front, then track its index
        notes.unshift(noteToSave);
        activeNoteIndex = 0;
        // Shift all other activeNoteIndex tracking isn't needed
        // because we immediately set activeNoteIndex = 0
    } else {
        // Existing note — update in place
        notes[activeNoteIndex] = noteToSave;
    }

    localStorage.setItem('my-notes', JSON.stringify(notes));
    renderNotes();
}

// ─────────────────────────────────────────
// AUTOSAVE
// Fires 800ms after the user stops typing.
// Blocked while a note is loading to prevent overwriting.
// ─────────────────────────────────────────

function scheduleAutoSave() {
    if (isLoadingNote) return;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        const body = document.getElementById("note-body").value.trim();
        if (body !== "") saveNote();
    }, 800);
}

document.getElementById("note-title").addEventListener("input", scheduleAutoSave);
document.getElementById("note-body").addEventListener("input", scheduleAutoSave);
document.getElementById('note-body').addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'Enter') saveNote();
});

// ─────────────────────────────────────────
// RENDER NOTES (sidebar)
// ─────────────────────────────────────────

function renderNotes() {
    const list = document.getElementById('notes-list');

    if (notes.length === 0) {
        list.innerHTML = '<p class="empty-state">No notes yet</p>';
        return;
    }

    list.innerHTML = notes.map((note, index) => `
        <div class="sidebar-note" onclick="loadNote(${index})">
            <div class="sidebar-note-header">
                <p class="sidebar-note-title" style="color: ${note.colour || '#c9c9c9'};">
                    ${note.title || 'Untitled'}
                </p>
                <div class="menu-wrapper">
                    <button class="menu-btn" onclick="event.stopPropagation(); toggleMenu(${index})">⋮</button>
                    <div class="dropdown-menu" id="menu-${index}">
                        <button onclick="event.stopPropagation(); deleteNote(${index})">Delete</button>
                        <button onclick="event.stopPropagation(); exportSingleNote(${index})">Export</button>
                    </div>
                </div>
            </div>
            <p class="sidebar-note-preview">${note.body.substring(0, 40)}...</p>
        </div>
    `).join('');
}

// ─────────────────────────────────────────
// DELETE NOTE
// ─────────────────────────────────────────

function deleteNote(index) {
    notes.splice(index, 1);
    localStorage.setItem('my-notes', JSON.stringify(notes));

    if (activeNoteIndex === index) {
        activeNoteIndex = null;
        document.getElementById('note-title').value = '';
        document.getElementById('note-body').value  = '';
    } else if (activeNoteIndex > index) {
        // Shift activeNoteIndex down because an earlier note was removed
        activeNoteIndex--;
    }

    renderNotes();
}

// ─────────────────────────────────────────
// TOGGLE MENU
// ─────────────────────────────────────────

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
});

// ─────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────

function exportNotes() {
    const now = new Date().toLocaleString();
    let text = '========================================\n';
    text += ' My Notes Export — ' + now + '\n';
    text += '========================================\n\n';
    notes.forEach(note => {
        text += note.title ? '[ ' + note.title + ' ]\n' : '[ Untitled ]\n';
        text += note.body + '\n';
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
    const text = `${note.title ? note.title + '\n\n' : ''}${note.body}\n\n${note.date}`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const safeTitle = (note.title || 'untitled-note').replace(/[\\/:*?"<>|]/g, '').trim();
    a.download = `${safeTitle}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

document.getElementById("more-colours-btn").addEventListener("click", function() {
    document.getElementById("custom-colour").click();
});

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
renderNotes();
renderColourButtons();
