// ── Load saved notes from the browser's localStorage ──
// JSON.parse turns the saved text back into a JavaScript array.
// If nothing is saved yet, we start with an empty array [].
let notes = JSON.parse(localStorage.getItem('my-notes') || '[]');

// NEW CODE TO DISCUSS IN MEETING

function exportNotes() {
  // Turn the notes array into formatted text
  const dataStr = JSON.stringify(notes, null, 2);

  // Create a temporary invisible download link and click it
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'my-notes.json';
  a.click();

  // Clean up the temporary link
  URL.revokeObjectURL(url);
}

// ── Draw all the notes on screen ──
function renderNotes() {
  const list = document.getElementById('notes-list');

  // If there are no notes, show a friendly empty message
  if (notes.length === 0) {
    list.innerHTML = '<p class="empty-state">No notes yet — write something above!</p>';
    return;
  }

  // Otherwise, loop through every note and build an HTML card for it
  // .map() goes through each note and returns a chunk of HTML
  // .join('') glues all those chunks into one big string
  list.innerHTML = notes.map((note, index) => `
    <div class="note-card">
      <div class="note-content">
        ${note.title ? `<p class="note-card-title">${escapeHTML(note.title)}</p>` : ''}
        <p class="note-card-body">${escapeHTML(note.body)}</p>
        <p class="note-card-date">${note.date}</p>
      </div>
      <button class="delete-btn" onclick="deleteNote(${index})" title="Delete note">×</button>
    </div>
  `).join('');
}

// ── Save a new note ──
function saveNote() {
  const titleInput = document.getElementById('note-title');
  const bodyInput  = document.getElementById('note-body');

  const title = titleInput.value.trim();
  const body  = bodyInput.value.trim();

  // Don't save if the body is empty
  if (!body) return;

  // Create a new note object and add it to the front of the array
  // unshift() adds to the beginning so newest notes appear first
  notes.unshift({
    title: title,
    body:  body,
    date:  new Date().toLocaleString()
  });

  // Save the updated array to localStorage
  // JSON.stringify turns the array into text so it can be stored
  localStorage.setItem('my-notes', JSON.stringify(notes));

  // Clear the input fields
  titleInput.value = '';
  bodyInput.value  = '';

  // Re-draw the notes list
  renderNotes();
}

// ── Delete a note by its position in the array ──
function deleteNote(index) {
  // splice(index, 1) removes 1 item at the given position
  notes.splice(index, 1);
  localStorage.setItem('my-notes', JSON.stringify(notes));
  renderNotes();
}

// ── Safety helper: escapeHTML ──
// This prevents a bug where if someone types <script> in a note,
// the browser would try to run it. This function makes it display
// as plain text instead. Always do this when displaying user input!
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Keyboard shortcut: Ctrl + Enter to save ──
document.getElementById('note-body').addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.key === 'Enter') saveNote();
});

// ── Run renderNotes() once when the page first loads ──
renderNotes();
