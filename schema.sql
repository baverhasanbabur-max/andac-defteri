CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  motto TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  target INTEGER DEFAULT 5
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  writer_name TEXT NOT NULL,
  relationship TEXT DEFAULT '',
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  FOREIGN KEY(student_id) REFERENCES students(id)
);
CREATE INDEX IF NOT EXISTS idx_notes_student ON notes(student_id);
CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status);
