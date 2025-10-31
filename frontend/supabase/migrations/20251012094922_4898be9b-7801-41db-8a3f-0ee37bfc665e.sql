-- Create profiles table to store usernames
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Messages policies
CREATE POLICY "Anyone authenticated can read messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Writers can insert messages"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Writers can update their own messages"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.username = messages.username
    )
  );

CREATE POLICY "Writers can delete their own messages"
  ON public.messages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.username = messages.username
    )
  );

-- Create writer_semaphore table (only one row allowed)
CREATE TABLE IF NOT EXISTS public.writer_semaphore (
  id INTEGER PRIMARY KEY DEFAULT 1,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  acquired_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT single_row CHECK (id = 1)
);

-- Enable RLS on writer_semaphore
ALTER TABLE public.writer_semaphore ENABLE ROW LEVEL SECURITY;

-- Semaphore policies
CREATE POLICY "Anyone authenticated can read semaphore"
  ON public.writer_semaphore FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can acquire semaphore when empty"
  ON public.writer_semaphore FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can release their own semaphore"
  ON public.writer_semaphore FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Enable realtime for messages and semaphore
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.writer_semaphore;

-- Trigger to update updated_at on messages
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();