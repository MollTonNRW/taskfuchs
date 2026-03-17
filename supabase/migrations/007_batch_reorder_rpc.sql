-- Batch-Reorder RPC functions to replace N+1 sequential updates
-- Each function accepts a JSON array and performs all position updates in a single call.

-- ==========================================
-- BATCH REORDER: Lists
-- ==========================================
-- Input: [{"id": "uuid", "position": 0}, ...]
CREATE OR REPLACE FUNCTION batch_reorder_lists(items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE lists
  SET position = (item->>'position')::int
  FROM jsonb_array_elements(items) AS item
  WHERE lists.id = (item->>'id')::uuid
    AND lists.user_id = auth.uid();
END;
$$;

-- ==========================================
-- BATCH REORDER: Tasks (with optional list_id change for cross-list D&D)
-- ==========================================
-- Input: [{"id": "uuid", "position": 0, "list_id": "uuid"}, ...]
-- list_id is optional per item; if omitted, only position is updated.
CREATE OR REPLACE FUNCTION batch_reorder_tasks(items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update position for all items
  UPDATE tasks
  SET
    position = (item->>'position')::int,
    list_id  = COALESCE((item->>'list_id')::uuid, tasks.list_id)
  FROM jsonb_array_elements(items) AS item
  WHERE tasks.id = (item->>'id')::uuid
    AND tasks.user_id = auth.uid();
END;
$$;

-- ==========================================
-- BATCH REORDER: Subtasks (with optional parent_id change)
-- ==========================================
-- Input: [{"id": "uuid", "position": 0, "parent_id": "uuid"}, ...]
-- parent_id is optional per item; if omitted, only position is updated.
CREATE OR REPLACE FUNCTION batch_reorder_subtasks(items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tasks
  SET
    position  = (item->>'position')::int,
    parent_id = COALESCE((item->>'parent_id')::uuid, tasks.parent_id)
  FROM jsonb_array_elements(items) AS item
  WHERE tasks.id = (item->>'id')::uuid
    AND tasks.user_id = auth.uid();
END;
$$;
