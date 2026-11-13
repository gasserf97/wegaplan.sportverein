-- Freizeit Aktiv remains a valid section. This migration is a no-op so that
-- environments which have not yet applied it do not delete the section.
-- (A later restore migration recreates the section if an older destructive
-- version of this file was already applied somewhere.)
SELECT 1;
