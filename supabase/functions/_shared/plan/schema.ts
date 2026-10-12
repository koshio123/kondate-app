// JSON schema for Claude structured outputs (output_config.format).
// Structured outputs reject numeric/string-length constraints and require
// additionalProperties: false, so ranges are stated in descriptions and checked in validate.ts.

const ingredient = {
  type: "object",
  additionalProperties: false,
  required: ["name", "amount", "unit", "is_pantry"],
  properties: {
    name: { type: "string", description: "食材名(一般的な名前。例: 玉ねぎ、鶏もも肉)" },
    amount: {
      type: ["number", "null"],
      description: "分量の数値。「少々」「適量」は null",
    },
    unit: {
      type: "string",
      description: "単位(g, ml, 個, 本, 束, 枚, 丁, 袋, 大さじ, 小さじ, 合, 少々 など)",
    },
    is_pantry: {
      type: "boolean",
      description: "塩・醤油・油などの常備調味料なら true",
    },
  },
} as const;

const dish = {
  type: "object",
  additionalProperties: false,
  required: ["title", "course", "cook_minutes", "ingredients", "steps", "uses_leftovers"],
  properties: {
    title: { type: "string" },
    course: {
      type: "string",
      enum: ["staple", "main", "side", "soup", "one_dish"],
      description: "staple=主食, main=主菜, side=副菜, soup=汁物, one_dish=丼・麺など主食と主菜を兼ねる一品",
    },
    cook_minutes: { type: "integer", description: "下ごしらえを含む調理時間(分)" },
    ingredients: { type: "array", items: ingredient },
    steps: { type: "array", items: { type: "string" }, description: "手順(各1文、6つ以内)" },
    uses_leftovers: {
      type: "array",
      items: { type: "string" },
      description: "入力の余り物のうち、この料理で使うものの名前(入力と同じ表記)",
    },
  },
} as const;

const outlineDish = {
  type: "object",
  additionalProperties: false,
  required: ["title", "course", "cook_minutes", "main_ingredients", "uses_leftovers"],
  properties: {
    title: dish.properties.title,
    course: dish.properties.course,
    cook_minutes: dish.properties.cook_minutes,
    main_ingredients: {
      type: "array",
      items: { type: "string" },
      description: "主な食材を3〜5個(調味料は含めない)",
    },
    uses_leftovers: dish.properties.uses_leftovers,
  },
} as const;

/** Stage 1: every day's dishes without ingredients or steps. */
export const OUTLINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["days"],
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "dishes"],
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          dishes: { type: "array", items: outlineDish },
        },
      },
    },
  },
} as const;

/** Stage 2: ingredients and steps for the dishes of one day, in the given order. */
export const DAY_DETAIL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["dishes"],
  properties: {
    dishes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "ingredients", "steps"],
        properties: {
          title: dish.properties.title,
          ingredients: dish.properties.ingredients,
          steps: dish.properties.steps,
        },
      },
    },
  },
} as const;

/** One-shot generation (kept for comparison in packages/plan-eval). */
export const PLAN_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["days"],
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "dishes"],
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          dishes: { type: "array", items: dish },
        },
      },
    },
  },
} as const;
