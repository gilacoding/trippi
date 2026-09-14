CREATE TABLE IF NOT EXISTS public.saved_trips (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  destination text NOT NULL DEFAULT '',
  snapshot    jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_trips_user ON public.saved_trips(user_id, updated_at DESC);

ALTER TABLE public.saved_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_trips_select ON public.saved_trips
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY saved_trips_insert ON public.saved_trips
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY saved_trips_update ON public.saved_trips
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY saved_trips_delete ON public.saved_trips
  FOR DELETE USING (user_id = auth.uid());

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.handle_saved_trip_updated()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS saved_trips_updated ON public.saved_trips;
CREATE TRIGGER saved_trips_updated
  BEFORE UPDATE ON public.saved_trips
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_saved_trip_updated();

-- Grant privileges to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_trips TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
