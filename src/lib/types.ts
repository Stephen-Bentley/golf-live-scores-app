import { z } from "zod";

export const playingHandicapSchema = z.number().int().min(0).max(54);
export const grossScoreSchema = z.number().int().min(1).max(20);

export const holeSchema = z.object({
  number: z.number().int().min(1).max(18),
  par: z.number().int().min(3).max(6),
  strokeIndex: z.number().int().min(1).max(18),
  distance: z.number().int().min(1).max(1000).nullable().optional(),
});

export const teeSetSnapshotSchema = z.object({
  name: z.string().min(1),
  colour: z.string().min(1),
  rating: z.number().nullable().optional(),
  slope: z.number().int().nullable().optional(),
  holes: z.array(holeSchema).min(9).max(18),
});

export const createRoundSchema = z.object({
  courseName: z.string().min(1),
  courseLocation: z.string().min(1),
  teeSetSnapshot: teeSetSnapshotSchema,
  scoringFormat: z
    .enum(["stableford", "stroke", "modified_stableford"])
    .optional()
    .default("stableford"),
  holesCount: z.union([z.literal(9), z.literal(18)]).optional().default(18),
  courseRating: z.number().optional().nullable(),
  slopeRating: z.number().int().optional().nullable(),
  teamScoring: z.enum(["aggregate", "better_ball"]).optional().default("aggregate"),
});

export const joinRoundSchema = z.object({
  joinCode: z.string().min(4).max(12),
  displayName: z.string().trim().min(1).max(40),
  playingHandicap: playingHandicapSchema,
  teamName: z.string().trim().min(1).max(40).optional(),
});

export const scoreUpdateSchema = z.object({
  holeNumber: z.number().int().min(1).max(18),
  grossScore: grossScoreSchema,
  clientVersion: z.number().int().min(0).optional(),
  mutationId: z.string().optional(),
  playerId: z.string().optional(),
});

export type TeeSetSnapshot = z.infer<typeof teeSetSnapshotSchema>;
export type CreateRoundInput = z.infer<typeof createRoundSchema>;
export type JoinRoundInput = z.infer<typeof joinRoundSchema>;
export type ScoreUpdateInput = z.infer<typeof scoreUpdateSchema>;

export type RoundStatus =
  | "setup"
  | "active"
  | "ready_for_export"
  | "closed"
  | "archived";
