-- Add tags metadata to custom rules for lobby filtering
ALTER TABLE public.custom_chess_rules
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Ensure existing rows have a non-null array
UPDATE public.custom_chess_rules
SET tags = ARRAY[]::TEXT[]
WHERE tags IS NULL;
