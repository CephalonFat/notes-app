let notes = JSON.parse(localStorage.getItem('my-notes') || '[]');
let activeNoteIndex = null;

// ── Font changer ── DISCUSS
// This function runs every time the user picks a new font.
// It changes the CSS variable --app-font on the root element,
// which instantly updates every font-family: var(--app-font) on the page.
function changeFont(fontValue) {
  document.documentElement.style.setProperty('--app-font', fontValue);

  // Save the choice to localStorage so it persists after refresh
  localStorage.setItem('preferred-font', fontValue);
}

// ── Load saved font on startup ──
// When the page loads, check if the user previously picked a font.
// If yes, apply it and set the dropdown to match.
function loadSavedFont() {
  const savedFont = localStorage.getItem('preferred-font');

  if (savedFont) {
    // Apply the font to the page
    document.documentElement.style.setProperty('--app-font', savedFont);

    // Set the dropdown to show the right option
    document.getElementById('font-select').value = savedFont;
  }
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.menu-wrapper')) {
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
      menu.style.display = 'none';
    });
  }
});

// ── Render sidebar notes ──
function renderNotes() {
  const list = document.getElementById('notes-list');

  if (notes.length === 0) {
    list.innerHTML = '<p class="empty-state">No notes yet</p>';
    return;
  }

  list.innerHTML = notes.map((note, index) => `
    <div class="sidebar-note" onclick="loadNote(${index})">
      
      <div class="sidebar-note-header">

        <p class="sidebar-note-title">
          ${note.title || 'Untitled'}
        </p>

        <div class="menu-wrapper">
          <button 
            class="menu-btn"
            onclick="event.stopPropagation(); toggleMenu(${index})"
          >
            ⋮
          </button>

          <div class="dropdown-menu" id="menu-${index}">
            <button onclick="event.stopPropagation(); deleteNote(${index})">
              Delete
            </button>
            <button onclick="event.stopPropagation(); exportSingleNote(${index})">
              Export
            </button>
          </div>
        </div>

      </div>

      <p class="sidebar-note-preview">
        ${note.body.substring(0, 40)}...
      </p>

    </div>
  `).join('');
}


function toggleMenu(index) {
  const menu = document.getElementById(`menu-${index}`);

  document.querySelectorAll('.dropdown-menu').forEach(m => {
    if (m !== menu) m.style.display = 'none';
  });

  menu.style.display =
    menu.style.display === 'block' ? 'none' : 'block';
}


// ── Load note into editor (edit mode) ──
function loadNote(index) {
  const note = notes[index];

  document.getElementById('note-title').value = note.title;
  document.getElementById('note-body').value = note.body;

  activeNoteIndex = index;

  document.getElementById('save-btn').textContent = 'Update Note';
}

// ── Save or update note ──
function saveNote(index) {
  const titleInput = document.getElementById('note-title');
  const bodyInput  = document.getElementById('note-body');

  const title = titleInput.value.trim();
  const body  = bodyInput.value.trim();

  if (!body) {
    alert("Note body can't be empty"); // new alert has been added
    return;
  }

  const newNote = {
    title: title,
    body: body,
    date: new Date().toLocaleString()
  };

  if (activeNoteIndex !== null) {
    // update existing
    notes[activeNoteIndex] = newNote;
  } else {
    // create new
    notes.unshift(newNote);
  }

  localStorage.setItem('my-notes', JSON.stringify(notes));

  // reset editor
  titleInput.value = '';
  bodyInput.value = '';
  activeNoteIndex = null;

  document.getElementById('save-btn').textContent = 'Save Note';

  renderNotes();
}

// ── Delete note ──
function deleteNote(index) {
  notes.splice(index, 1);
  localStorage.setItem('my-notes', JSON.stringify(notes));

  // reset editor if needed
  if (activeNoteIndex === index) {
    document.getElementById('note-title').value = '';
    document.getElementById('note-body').value = '';
    activeNoteIndex = null;
  }

  renderNotes();
}

// ── Export all notes ──
function exportNotes(index) {
  const dataStr = JSON.stringify(notes, null, 2);

  const blob = new Blob([dataStr], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'my-notes.txt';
  a.click();

  URL.revokeObjectURL(url);
}

function exportSingleNote(index) {
  const note = notes[index];

  const text =
`${note.title ? note.title + '\n\n' : ''}${note.body}\n\n${note.date}`;

  const blob = new Blob([text], { type: 'text/plain' });

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;

  const safeTitle = (note.title || 'untitled-note')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim();

  a.download = `${safeTitle}.txt`;

  a.click();

  URL.revokeObjectURL(url);
}

// ── Keyboard shortcut ──
document.getElementById('note-body').addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.key === 'Enter') saveNote();
});

// ── Initial render ──
renderNotes();
loadSavedFont(); // this will load the font on startup
