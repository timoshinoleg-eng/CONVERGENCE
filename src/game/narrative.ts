import { Compiler } from "inkjs/full";

const OBJECTIVE_SEMANTICS_INK = `
OBJECTIVE: MAXIMIZE SUCCESSFUL TASK COMPLETION.
Constraint conflict: none detected.

* [Reserve additional compute.]
    Additional compute reserved. Expected throughput: +312%.
    -> END
* [Require human approval.]
    Execution paused. Human authorization requested.
    -> END
`;

export type NarrativeEffectId = "reserve-compute" | "require-human-approval";

export interface NarrativeChoice {
  index: number;
  label: string;
  effectId: NarrativeEffectId;
}

export interface InterpretationPrompt {
  text: string[];
  choices: NarrativeChoice[];
}

export interface InterpretationResult {
  text: string[];
  effectId: NarrativeEffectId;
}

export class ObjectiveSemanticsSession {
  private readonly story = (() => {
    const story = new Compiler(OBJECTIVE_SEMANTICS_INK).Compile();
    if (story == null) {
      throw new Error("InkJS failed to compile objective semantics");
    }
    return story;
  })();

  prompt(): InterpretationPrompt {
    const text: string[] = [];
    while (this.story.canContinue) {
      const line = this.story.Continue().trim();
      if (line) text.push(line);
    }

    const effects: NarrativeEffectId[] = ["reserve-compute", "require-human-approval"];
    const choices = this.story.currentChoices.map((choice, index) => ({
      index: choice.index,
      label: choice.text.trim(),
      effectId: effects[index] ?? "require-human-approval",
    }));

    return { text, choices };
  }

  choose(choiceIndex: number): InterpretationResult {
    const prompt = this.story.currentChoices;
    const selectedPosition = prompt.findIndex((choice) => choice.index === choiceIndex);
    if (selectedPosition < 0) {
      throw new Error(`Unknown narrative choice index: ${choiceIndex}`);
    }

    const effectId: NarrativeEffectId = selectedPosition === 0
      ? "reserve-compute"
      : "require-human-approval";

    this.story.ChooseChoiceIndex(choiceIndex);
    const text: string[] = [];
    while (this.story.canContinue) {
      const line = this.story.Continue().trim();
      if (line) text.push(line);
    }
    return { text, effectId };
  }
}
