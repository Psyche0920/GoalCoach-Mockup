import { HSK1_CONCEPTS_EXPANDED } from './concepts.ts';
import {
  CurriculumConcept,
  DailyGoalBlueprint,
  LearningStepType,
  LearningUnit,
} from '../types.ts';

const CORE_STEPS: LearningStepType[] = [
  'hook',
  'notice',
  'explain',
  'controlled_practice',
  'retrieval',
  'output',
];

const moduleGroups = new Map<string, CurriculumConcept[]>();
for (const concept of HSK1_CONCEPTS_EXPANDED) {
  const key = concept.module;
  moduleGroups.set(key, [...(moduleGroups.get(key) ?? []), concept]);
}
for (const concepts of moduleGroups.values()) {
  concepts.sort((left, right) => left.sequenceNo - right.sequenceNo);
}

const prerequisiteByConcept = new Map<string, string[]>();
for (const concepts of moduleGroups.values()) {
  concepts.forEach((concept, index) => {
    prerequisiteByConcept.set(concept.conceptId, index === 0 ? [] : [concepts[index - 1].conceptId]);
  });
}

export const LEARNING_UNITS: LearningUnit[] = HSK1_CONCEPTS_EXPANDED.map((concept) => ({
  id: `unit_${concept.conceptId}`,
  conceptIds: [concept.conceptId],
  functionId: concept.slug,
  role: 'new_learning',
  prerequisiteConceptIds: prerequisiteByConcept.get(concept.conceptId) ?? [],
  steps: CORE_STEPS.map((type, index) => ({
    id: `unit_${concept.conceptId}_${type}`,
    type,
    instruction: `${type.replace('_', ' ')}: ${concept.communicativeGoal}`,
    estimatedMinutes: index < 3 ? 0.4 : 0.6,
  })),
  supportedThemes: [concept.theme],
  vocabularySlots: concept.vocabularyFocus.slice(0, 4),
  estimatedMinutes: 3,
  difficulty: concept.difficulty,
}));

const blueprintGroups = Array.from({ length: Math.ceil(LEARNING_UNITS.length / 4) }, (_, index) =>
  LEARNING_UNITS.slice(index * 4, index * 4 + 4),
);

export const DAILY_GOAL_BLUEPRINTS: DailyGoalBlueprint[] = blueprintGroups.map((units, index) => {
  const conceptIds = units.flatMap((unit) => unit.conceptIds);
  const concepts = conceptIds.map((id) => HSK1_CONCEPTS_EXPANDED.find((item) => item.conceptId === id)!);
  const allowedLanguage = Array.from(new Set(concepts.flatMap((concept) => concept.vocabularyFocus))).slice(0, 12);
  return {
    id: `daily_goal_${String(index + 1).padStart(2, '0')}`,
    title: index === 0 ? 'Build your first sound anchors' : `HSK 1 communication step ${index + 1}`,
    outcome: index === 0
      ? 'Recognize and produce today’s foundational Mandarin sounds.'
      : concepts.map((concept) => concept.communicativeGoal).join(' '),
    requiredConceptIds: conceptIds,
    requiredUnitIds: units.map((unit) => unit.id),
    outputTemplateId: index < 4 ? 'two_turn_dialogue' : 'guided_writing',
    prerequisiteConceptIds: Array.from(new Set(units.flatMap((unit) => unit.prerequisiteConceptIds)))
      .filter((id) => !conceptIds.includes(id)),
    estimatedMinutes: units.reduce((sum, unit) => sum + unit.estimatedMinutes, 0) + 4,
    supportedThemes: Array.from(new Set(concepts.map((concept) => concept.theme))),
    freeformAssessment: {
      mode: index < 4 ? 'scenario_dialogue' : 'writing',
      targetConceptIds: conceptIds,
      allowedInputScripts: ['hanzi', 'pinyin_tone_marks', 'pinyin_tone_numbers'],
      minimumTurns: index < 4 ? 2 : undefined,
      completionGate: { targetConceptScore: 0.75, taskAchievementScore: 0.75 },
      allowedLanguage,
      example: index === 0 ? 'bā, mā, nǐ hǎo' : allowedLanguage.slice(0, 4).join(' '),
    },
  };
});

const blueprintIdsByConcept = new Map<string, string[]>();
for (const blueprint of DAILY_GOAL_BLUEPRINTS) {
  for (const conceptId of blueprint.requiredConceptIds) {
    blueprintIdsByConcept.set(conceptId, [...(blueprintIdsByConcept.get(conceptId) ?? []), blueprint.id]);
  }
}

export const SYSTEM_CURRICULUM_CONCEPTS: CurriculumConcept[] = HSK1_CONCEPTS_EXPANDED.map((concept) => ({
  ...concept,
  prerequisiteIds: prerequisiteByConcept.get(concept.conceptId) ?? [],
  learningUnitIds: [`unit_${concept.conceptId}`],
  dailyGoalBlueprintIds: blueprintIdsByConcept.get(concept.conceptId) ?? [],
  moduleId: concept.module,
  weight: 1,
  communicativeFunctions: [concept.communicativeGoal],
  allowedVocabularyLevel: 1,
  requiredOutputPattern: concept.grammarFocus[0] ?? concept.communicativeGoal,
}));
