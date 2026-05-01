"use client";

import { useEffect, useState, use } from "react";
import type { RunSummary, RunResult } from "@test-evals/shared";
import { formatDistanceToNow } from "date-fns";

export default function RunDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<(RunSummary & { results: RunResult[] }) | null>(null);
  const [selectedCase, setSelectedCase] = useState<RunResult | null>(null);

  useEffect(() => {
    fetchRun();
    const eventSource = new EventSource(`${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8787"}/api/v1/runs/${id}/stream`);
    eventSource.addEventListener("progress", (event) => {
      const data = JSON.parse(event.data);
      setRun(prev => prev ? { ...prev, ...data } : null);
      if (data.status === "completed") {
        fetchRun(); // Refetch to get all results
        eventSource.close();
      }
    });
    return () => eventSource.close();
  }, [id]);

  const fetchRun = async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8787"}/api/v1/runs/${id}`);
    const data = await res.json();
    setRun(data);
  };

  if (!run) return <div>Loading...</div>;

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-4">{run.strategy} Run Detail</h1>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="border rounded p-4">
          <div className="text-xs text-gray-500 uppercase">Status</div>
          <div className="font-semibold">{run.status}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-xs text-gray-500 uppercase">Cost</div>
          <div className="font-semibold">${run.totalCostUsd}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-xs text-gray-500 uppercase">Duration</div>
          <div className="font-semibold">{(run.totalDurationMs / 1000).toFixed(1)}s</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-xs text-gray-500 uppercase">Progress</div>
          <div className="font-semibold">{run.completedCases}/{run.totalCases}</div>
        </div>
      </div>

      <div className="flex gap-8">
        <div className="w-1/3 border rounded overflow-hidden">
          <div className="bg-gray-100 p-2 font-bold border-b">Cases</div>
          <div className="max-h-[600px] overflow-y-auto">
            {run.results?.map(result => (
              <div
                key={result.id}
                onClick={() => setSelectedCase(result)}
                className={`p-3 border-b cursor-pointer hover:bg-blue-50 transition ${selectedCase?.id === result.id ? "bg-blue-100" : ""}`}
              >
                <div className="flex justify-between">
                  <span className="font-mono text-sm">{result.transcriptId}</span>
                  <span className="font-bold text-blue-600">{(result.scores.overall * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="w-2/3">
          {selectedCase ? (
            <div className="border rounded p-6">
              <h2 className="text-2xl font-bold mb-4">Case: {selectedCase.transcriptId}</h2>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <h3 className="font-bold mb-2">Scores</h3>
                  <div className="space-y-1">
                    {Object.entries(selectedCase.scores).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-sm">
                        <span className="capitalize">{k.replace("_", " ")}</span>
                        <span className="font-mono">{(v * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="font-bold mb-2">Metadata</h3>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Tokens</span>
                      <span className="font-mono">{selectedCase.inputTokens + selectedCase.outputTokens}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Duration</span>
                      <span className="font-mono">{selectedCase.durationMs}ms</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Cost</span>
                        <span className="font-mono">${selectedCase.costUsd}</span>
                    </div>
                  </div>
                </div>
              </div>

              {selectedCase.hallucinations.length > 0 && (
                <div className="bg-red-50 border border-red-200 p-4 rounded mb-6">
                  <h3 className="text-red-800 font-bold mb-2">Hallucinations Detected</h3>
                  <ul className="list-disc list-inside text-sm text-red-700">
                    {selectedCase.hallucinations.map((h, i) => <li key={i}>{h}</li>)}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 gap-8">
                <div>
                  <h3 className="font-bold mb-2">Gold Standard</h3>
                  <pre className="text-xs bg-gray-50 p-2 rounded max-h-96 overflow-auto">
                    {JSON.stringify(selectedCase.gold, null, 2)}
                  </pre>
                </div>
                <div>
                  <h3 className="font-bold mb-2">Prediction</h3>
                  <pre className="text-xs bg-gray-50 p-2 rounded max-h-96 overflow-auto">
                    {JSON.stringify(selectedCase.prediction, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="mt-8">
                <h3 className="font-bold mb-2">LLM Trace (Attempts)</h3>
                <div className="space-y-4">
                  {selectedCase.attempts.map((a: any, i: number) => (
                    <div key={i} className="border rounded p-4 text-xs">
                      <div className="font-bold mb-1">Attempt {i + 1}</div>
                      <details>
                        <summary className="cursor-pointer text-blue-600">View details</summary>
                        <div className="mt-2">
                           <div className="font-semibold">Response:</div>
                           <pre className="bg-gray-100 p-1 mt-1 overflow-auto">{JSON.stringify(a.response.content, null, 2)}</pre>
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="border rounded h-full flex items-center justify-center text-gray-400">
              Select a case to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
