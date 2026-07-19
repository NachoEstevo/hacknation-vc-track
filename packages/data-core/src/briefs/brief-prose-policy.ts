const DECISION = "(?:investigate|watch|pass[_ -]?for[_ -]?thesis|needs[_ -]?evidence)";
const DECISION_METADATA = new RegExp(
  `\\b(?:rated?|rating|recommend(?:ation|ed)?|status|decision(?: label)?)\\b.{0,40}\\b${DECISION}\\b|\\b${DECISION}\\b.{0,40}\\b(?:rating|recommendation|status|decision)\\b`,
  "iu",
);
const SCORED_EVALUATION = /\b(?:fit|evidence\s+coverage|(?:founder|market|product(?:[_ -]execution)?|traction)\s+axis)\b.{0,30}\b(?:score|scored|percentage|percent|\d+(?:\.\d+)?%?)\b/iu;
const CRITERION_STATE = /\b(?:criterion|requirement)\b.{0,30}\b(?:match|partial|missing|conflict)\b/iu;
const RANKING = /\b(?:rank(?:s|ed|ing)?|top[- ]ranked)\b.{0,20}\b(?:#?\d+|first|second|third|top|above|below)\b/iu;

export function containsEvaluationMetadata(text: string): boolean {
  return DECISION_METADATA.test(text) || SCORED_EVALUATION.test(text) || CRITERION_STATE.test(text) || RANKING.test(text);
}
