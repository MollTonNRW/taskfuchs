-- Input-Laengenbegrenzung: CHECK Constraints fuer Tasks und Listen
ALTER TABLE lists
  ADD CONSTRAINT lists_title_length CHECK (char_length(title) <= 100);

ALTER TABLE tasks
  ADD CONSTRAINT tasks_text_length CHECK (char_length(text) <= 500),
  ADD CONSTRAINT tasks_note_length CHECK (char_length(note) <= 5000);
