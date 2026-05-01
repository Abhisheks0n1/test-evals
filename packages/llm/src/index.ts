import Anthropic from "@anthropic-ai/sdk";
import { ClinicalExtractionSchema, type ClinicalExtraction, type RunStrategy } from "@test-evals/shared";
import { zodToJsonSchema } from "zod-to-json-schema";

export class LLMService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async extract(
    transcript: string,
    strategy: RunStrategy,
    model: string = "claude-haiku-4-5-20251001",
    options: { maxRetries?: number } = {}
  ) {
    const { maxRetries = 3 } = options;
    const attempts: any[] = [];
    let currentPrompt = this.getSystemPrompt(strategy);
    let currentInput = transcript;
    let schemaErrors: string[] = [];

    const extractionJsonSchema = zodToJsonSchema(ClinicalExtractionSchema, "ClinicalExtraction");

    for (let i = 0; i < maxRetries; i++) {
      const response = await this.client.messages.create({
        model,
        max_tokens: 4096,
        system: [
          {
            type: "text",
            text: currentPrompt,
            cache_control: { type: "ephemeral" }
          }
        ],
        messages: [
          {
            role: "user",
            content: i === 0 ? currentInput : `The previous output had schema validation errors: ${schemaErrors.join(", ")}. Please fix them and provide the corrected JSON.`,
          }
        ],
        tools: [
          {
            name: "extract_clinical_data",
            description: "Extract structured clinical data from a transcript.",
            input_schema: extractionJsonSchema as any
          }
        ],
        tool_choice: { type: "tool", name: "extract_clinical_data" }
      });

      const toolUse = response.content.find(c => c.type === "tool_use") as Anthropic.ToolUseBlock;
      const extraction = toolUse?.input as any;

      attempts.push({
        request: { transcript, strategy, model, attempt: i + 1 },
        response: {
          id: response.id,
          content: response.content,
          usage: response.usage
        }
      });

      const validation = ClinicalExtractionSchema.safeParse(extraction);
      if (validation.success) {
        return {
          prediction: validation.data,
          attempts,
          schemaErrors: [],
          usage: response.usage
        };
      } else {
        schemaErrors = validation.error.errors.map(e => `${e.path.join(".")}: ${e.message}`);
      }
    }

    return {
      prediction: null,
      attempts,
      schemaErrors,
      usage: attempts[attempts.length - 1].response.usage
    };
  }

  private getSystemPrompt(strategy: RunStrategy): string {
    const base = "You are a clinical data extraction assistant. Your job is to extract structured JSON from clinical transcripts according to the provided schema.";
    
    switch (strategy) {
      case "zero_shot":
        return `${base}\nExtract the information accurately and concisely.`;
      case "few_shot":
        return `${base}\nHere are some examples of high-quality extractions...\n[Examples would go here]`;
      case "cot":
        return `${base}\nBefore extracting, think step-by-step about each field. Identify the relevant portions of the transcript for each vital sign, medication, and diagnosis.`;
      default:
        return base;
    }
  }
}
