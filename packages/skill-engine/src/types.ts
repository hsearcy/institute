export type SkillId = string;

/**
 * A single math skill the system can practice and assess.
 * `prereqs` must be skills that are at least `practicing` before this one becomes eligible.
 * `difficultyBand` is the [min, max] difficulty (0..1) of problems generated for this skill.
 */
export type Skill = {
  id: SkillId;
  description: string;
  prereqs: SkillId[];
  difficultyBand: readonly [number, number];
};

export type Taxonomy = ReadonlyArray<Skill>;
