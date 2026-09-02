import { sql, type SQLWrapper } from "drizzle-orm";

/** SQL equivalent of withPetStillImage for projections that do not load full rows. */
export function petHatchedImageSql(
  isHatched: SQLWrapper,
  isEvolved: SQLWrapper,
  evolutionImage: SQLWrapper,
  hatchedImage: SQLWrapper,
) {
  return sql<string | null>`CASE WHEN ${isHatched} AND ${isEvolved}
    THEN COALESCE(NULLIF(${evolutionImage}, ''), ${hatchedImage})
    ELSE ${hatchedImage} END`;
}
