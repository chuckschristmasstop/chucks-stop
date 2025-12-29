-- Drop the ensuring constraint that prevents 0
ALTER TABLE "votes" DROP CONSTRAINT IF EXISTS "votes_rating_check";

-- Re-add constraint allowing 0 (for 'Ran Out') up to 5
ALTER TABLE "votes" ADD CONSTRAINT "votes_rating_check" CHECK (rating >= 0 AND rating <= 5);
