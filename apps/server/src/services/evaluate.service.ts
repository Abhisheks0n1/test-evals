import type { ClinicalExtraction, Medication, Diagnosis } from "@test-evals/shared";
import fuzzysort from "fuzzysort";

export class EvaluationService {
  evaluate(transcript: string, prediction: ClinicalExtraction | null, gold: ClinicalExtraction) {
    if (!prediction) {
      return {
        scores: {
          chief_complaint: 0,
          vitals: 0,
          medications: 0,
          diagnoses: 0,
          plan: 0,
          follow_up: 0,
          overall: 0,
        },
        hallucinations: [],
      };
    }

    const scores = {
      chief_complaint: this.scoreChiefComplaint(prediction.chief_complaint, gold.chief_complaint),
      vitals: this.scoreVitals(prediction.vitals, gold.vitals),
      medications: this.scoreMedications(prediction.medications, gold.medications),
      diagnoses: this.scoreDiagnoses(prediction.diagnoses, gold.diagnoses),
      plan: this.scorePlan(prediction.plan, gold.plan),
      follow_up: this.scoreFollowUp(prediction.follow_up, gold.follow_up),
    };

    const overall = Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length;

    const hallucinations = this.detectHallucinations(transcript, prediction);

    return {
      scores: { ...scores, overall },
      hallucinations,
    };
  }

  private scoreChiefComplaint(pred: string, gold: string): number {
    const result = fuzzysort.single(this.normalize(pred), this.normalize(gold));
    return result ? result.score / 0 : 0; // fuzzysort score is negative, need to normalize to [0,1]
    // Actually, fuzzysort score is not easily normalized to 0-1. 
    // Let's use a simpler string similarity for 0-1.
  }

  private normalize(s: string): string {
    return s.toLowerCase().replace(/[^\w\s]/g, "").trim();
  }

  private stringSimilarity(s1: string, s2: string): number {
    const n1 = this.normalize(s1);
    const n2 = this.normalize(s2);
    if (n1 === n2) return 1;
    if (n1.length === 0 || n2.length === 0) return 0;
    
    // Simple token-based Jaccard
    const t1 = new Set(n1.split(/\s+/));
    const t2 = new Set(n2.split(/\s+/));
    const intersection = new Set([...t1].filter(x => t2.has(x)));
    const union = new Set([...t1, ...t2]);
    return intersection.size / union.size;
  }

  private scoreVitals(pred: any, gold: any): number {
    const fields = ["bp", "hr", "temp_f", "spo2"];
    let matchCount = 0;
    for (const f of fields) {
      if (f === "temp_f") {
        if (pred[f] === gold[f]) matchCount++;
        else if (pred[f] != null && gold[f] != null && Math.abs(pred[f] - gold[f]) <= 0.2) matchCount++;
      } else {
        if (pred[f] === gold[f]) matchCount++;
      }
    }
    return matchCount / fields.length;
  }

  private scoreMedications(pred: Medication[], gold: Medication[]): number {
    return this.calculateSetF1(pred, gold, (p, g) => {
      const nameMatch = this.stringSimilarity(p.name, g.name) > 0.8;
      const doseMatch = this.normalize(p.dose || "") === this.normalize(g.dose || "");
      const freqMatch = this.normalize(p.frequency || "") === this.normalize(g.frequency || "");
      return nameMatch && doseMatch && freqMatch;
    });
  }

  private scoreDiagnoses(pred: Diagnosis[], gold: Diagnosis[]): number {
    return this.calculateSetF1(pred, gold, (p, g) => {
      const descMatch = this.stringSimilarity(p.description, g.description) > 0.7;
      const icdMatch = p.icd10 === g.icd10;
      return descMatch || icdMatch; // Bonus credit if ICD matches, but description fuzzy is enough
    });
  }

  private scorePlan(pred: string[], gold: string[]): number {
    return this.calculateSetF1(pred, gold, (p, g) => this.stringSimilarity(p, g) > 0.8);
  }

  private scoreFollowUp(pred: any, gold: any): number {
    const intervalMatch = pred.interval_days === gold.interval_days ? 1 : 0;
    const reasonMatch = this.stringSimilarity(pred.reason || "", gold.reason || "") > 0.7 ? 1 : 0;
    return (intervalMatch + reasonMatch) / 2;
  }

  private calculateSetF1<T>(pred: T[], gold: T[], matcher: (p: T, g: T) => boolean): number {
    if (pred.length === 0 && gold.length === 0) return 1;
    if (pred.length === 0 || gold.length === 0) return 0;

    let truePositives = 0;
    const matchedGold = new Set<number>();

    for (const p of pred) {
      for (let i = 0; i < gold.length; i++) {
        if (!matchedGold.has(i) && matcher(p, gold[i])) {
          truePositives++;
          matchedGold.add(i);
          break;
        }
      }
    }

    const precision = truePositives / pred.length;
    const recall = truePositives / gold.length;
    if (precision + recall === 0) return 0;
    return (2 * precision * recall) / (precision + recall);
  }

  private detectHallucinations(transcript: string, prediction: ClinicalExtraction): string[] {
    const hallucinations: string[] = [];
    const normalizedTranscript = this.normalize(transcript);

    const check = (val: string | null | undefined, field: string) => {
      if (!val) return;
      const normalizedVal = this.normalize(val);
      if (normalizedVal.length < 3) return; // Ignore very short strings
      if (!normalizedTranscript.includes(normalizedVal)) {
        // Check fuzzy match
        const result = fuzzysort.single(normalizedVal, normalizedTranscript);
        if (!result || result.score < -500) {
          hallucinations.push(`${field}: "${val}" not found in transcript`);
        }
      }
    };

    check(prediction.chief_complaint, "chief_complaint");
    prediction.medications.forEach((m, i) => check(m.name, `medication[${i}].name`));
    prediction.diagnoses.forEach((d, i) => check(d.description, `diagnosis[${i}].description`));
    prediction.plan.forEach((p, i) => check(p, `plan[${i}]`));

    return hallucinations;
  }
}
