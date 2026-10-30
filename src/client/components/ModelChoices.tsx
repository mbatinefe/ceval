import { ArrowUpRight, Check } from "lucide-react";
import { modelCandidateKey, type ModelCandidate } from "../../shared/scan";

export function ModelChoices({
  candidates,
  onChoose,
}: {
  candidates: ModelCandidate[];
  onChoose: (key: string) => void;
}) {
  return (
    <div className="model-choices">
      {candidates.map((candidate) => (
        <div className="model-choice" key={modelCandidateKey(candidate)}>
          <strong>
            {candidate.brand} {candidate.model}
          </strong>
          {candidate.variant && <span>{candidate.variant}</span>}
          <details className="model-reason">
            <summary>How to check</summary>
            <p>{candidate.reason}</p>
          </details>
          <div className="model-choice-actions">
            <button
              className="text-link"
              onClick={() => onChoose(modelCandidateKey(candidate))}
            >
              <Check size={14} /> Use this model
            </button>
            <a
              className="text-link"
              href={`https://www.google.com/search?${new URLSearchParams({ q: [candidate.brand, candidate.model, candidate.variant].filter(Boolean).join(" ") })}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Look up model <ArrowUpRight size={13} />
            </a>
          </div>
        </div>
      ))}
      <p className="result-note">
        None match? Show the model label and scan again.
      </p>
    </div>
  );
}
