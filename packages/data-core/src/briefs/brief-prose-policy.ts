const EVALUATION_METADATA = /\b(?:recommend(?:ation|ed|ing)?|decision labels?|rank(?:s|ed|ing)?|rat(?:e|ed|es|ing)|fit|coverage|score(?:s|d|ing)?|axis|axes|criterion|criteria|match(?:es|ed|ing)?|partial|missing|conflict(?:s|ed|ing)?|investigate|watch(?:es|ed|ing)?|pass[_ -]?for[_ -]?thesis|needs[_ -]?evidence)\b/iu;

export function containsEvaluationMetadata(text: string): boolean {
  return EVALUATION_METADATA.test(text);
}
