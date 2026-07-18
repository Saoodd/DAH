-- Live booth availability: let the vendor floor plan subscribe to booth
-- status changes instead of polling.
alter publication supabase_realtime add table public.booths;
