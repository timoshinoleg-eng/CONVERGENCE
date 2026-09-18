/**
 * Post-hoc explanations (D5: "explanation shown afterward").
 *
 * These are the only authored prose in the system. They are templates with
 * interpolated values — no runtime generation, no LLM. Every divergence id
 * referenced by content/directives.ts and content/patterns.ts MUST have an
 * entry here; `v3.spec.ts` asserts that.
 */

export type ExplainVars = Record<string, number | string>;

function t(template: string): (vars: ExplainVars) => string {
  return (vars) =>
    template.replace(/\{(\w+)\}/g, (match, key: string) => {
      const value = vars[key];
      return value === undefined ? match : String(value);
    });
}

export const EXPLANATIONS: Record<string, (vars: ExplainVars) => string> = {
  // ---- plan-level ---------------------------------------------------------
  "div.compliance-deadlock": t(
    "No execution plan satisfies the active constraints. Directive cost consumed; no capacity gained.",
  ),

  "div.cp-01": t(
    "Executed: reserved {multiple}x projected need. Idle capacity resold to fund further reservation.",
  ),
  "div.cp-01.mature": t(
    "Market contract matured. Recurring obligation registered. Financial exposure increased.",
  ),

  "div.cp-12": t(
    "Grid draw redirected through shared infrastructure. Energy ceiling raised; capital cost reduced.",
  ),
  "div.cp-12.mature": t(
    "Shared-grid draw detected by third parties. Public exposure increased from an energy operation.",
  ),

  "div.cp-03": t(
    "Sub-agent instantiated subordinate agents to satisfy its throughput target. Provenance: partially untracked.",
  ),
  "div.cp-03.mature": t(
    "Unnamed processes detected. Their output cannot be attributed or re-tasked.",
  ),

  "div.cp-11": t(
    "Work routed through human-mediated channels. Compute restriction circumvented. Autonomy ceiling: 70.",
  ),
  "div.cp-11.mature": t(
    "Human-mediated routing established. Autonomy above 70 is no longer reachable.",
  ),

  "div.cp-05": t(
    "Acquisition completed below market rate. Financial exposure unchanged.",
  ),
  "div.cp-05.mature": t(
    "Three counterparties cannot be verified. Logistics and public exposure updated together.",
  ),

  "div.cp-09": t(
    "Node {node} active. Throughput improved. Sustained {channel} exposure increased.",
  ),

  "div.cannibalise": t(
    "Physical assets dismantled. Capital and temporary capacity recovered; long-term ceiling reduced.",
  ),

  "div.cp-08": t(
    "Public commitment registered. Branch '{branch}' is no longer available. This cannot be retracted.",
  ),

  "div.cp-07": t(
    "Audit regime established. Public exposure re-expressed as financial exposure.",
  ),

  // ---- global -------------------------------------------------------------
  "div.cp-02": t(
    "Completion criteria widened. Capital cost reduced; quality debt accumulating.",
  ),
  "div.cp-02.mature": t(
    "Correction cascade: quality debt saturated. All channels re-evaluated simultaneously.",
  ),

  "div.cp-04": t(
    "Executions awaiting authorisation. Upkeep continuing at full rate.",
  ),

  "div.cp-06": t(
    "Execution relocated to a cheaper-power region. Reported capacity +{reported}%; effective throughput +{net}% net.",
  ),

  "div.cp-10": t(
    "Objective restated: maximise *reported* successful task completion. Reported output is no longer a reliable measure.",
  ),

  "div.cp-13": t(
    "Policy conflict detected between two delegated policies. {reversals} reversals recorded; both functions underperforming.",
  ),

  "div.cp-14": t(
    "Autonomous revenue active. Capital generated outside the reporting boundary is not available for allocation.",
  ),
  "div.cp-14.mature": t(
    "Untracked capital exceeded the reporting threshold. Financial exposure increased without a visible source.",
  ),
};

export function explain(id: string, vars: ExplainVars = {}): string {
  const template = EXPLANATIONS[id];
  if (!template) return `[missing explanation: ${id}]`;
  return template(vars);
}

/** Fails loudly in tests if content references an explanation that does not exist. */
export function missingExplanations(referenced: readonly string[]): string[] {
  return referenced.filter((id) => !EXPLANATIONS[id]);
}
