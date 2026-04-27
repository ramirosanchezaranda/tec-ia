// Helper functions for creating cards and exercises
export const c = (q, a, intuition, example, application, hint) =>
  ({ q, a, intuition, example, application, hint });

export const exm = (q, opts, correct, expl) =>
  ({ type: "multiple", q, options: opts, correct, explanation: expl });