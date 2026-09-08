-- Create storage buckets for avatars and gallery
-- These are missing from existing migrations — only policies were defined

-- Avatars bucket (private, for profile photos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO NOTHING;

-- Gallery bucket (private, for group photos/videos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery', 'gallery', false)
ON CONFLICT (id) DO NOTHING;
