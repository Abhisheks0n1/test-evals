"use client";

import { useEffect, useState } from "react";
import type { RunSummary } from "@test-evals/shared";

export default function CompareView() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runAId, setRunAId] = useState<string>("");
  const [runBId, setRunBId] = useState<string>("");
  const [runA, setRunA] = useState<any>(null);
  const [runB, setRunB] = useState<any>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8787"}/api/v1/runs`)
      .then(res => res.json())
      .then(setRuns);
  }, []);

  const handleCompare = async () => {
    if (!runAId || !runBId) return;
    const [resA, resB] = await Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8787"}/api/v1/runs/${runAId}`),
      fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8787"}/api/v1/runs/${runBId}`),
    ]);
    setRunA(await resA.json());
    setRunB(await resB.json());
  };

  const calculateAggregates = (run: any) => {
    if (!run || !run.results) return {};
    const count = run.results.length;
    const totals: any = {};
    run.results.forEach((r: any) => {
      Object.entries(r.scores).forEach(([k, v]: [string, any]) => {
        totals[k] = (totals[k] || 0) + v;
      });
    });
    const aggregates: any = {};
    Object.entries(totals).forEach(([k, v]: [string, any]) => {
      aggregates[k] = v / count;
    });
    return aggregates;
  };

  const aggA = calculateAggregates(runA);
  const aggB = calculateAggregates(runB);
  const fields = Object.keys({ ...aggA, ...aggB });

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Compare Runs</h1>
      
      <div className="flex gap-4 mb-8 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700">Run A</label>
          <select
            value={runAId}
            onChange={(e) => setRunAId(e.target.value)}
            className="mt-1 block w-full border rounded p-2"
          >
            <option value="">Select a run</option>
            {runs.map(r => (
              <option key={r.id} value={r.id}>{r.strategy} ({r.model}) - {new Date(r.createdAt).toLocaleDateString()}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700">Run B</label>
          <select
            value={runBId}
            onChange={(e) => setRunBId(e.target.value)}
            className="mt-1 block w-full border rounded p-2"
          >
            <option value="">Select a run</option>
            {runs.map(r => (
              <option key={r.id} value={r.id}>{r.strategy} ({r.model}) - {new Date(r.createdAt).toLocaleDateString()}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleCompare}
          disabled={!runAId || !runBId}
          className="bg-blue-600 text-white px-6 py-2 rounded disabled:opacity-50"
        >
          Compare
        </button>
      </div>

      {runA && runB && (
        <div className="grid gap-8">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-4">Field</th>
                  <th className="p-4">{runA.strategy} (A)</th>
                  <th className="p-4">{runB.strategy} (B)</th>
                  <th className="p-4">Delta</th>
                  <th className="p-4">Winner</th>
                </tr>
              </thead>
              <tbody>
                {fields.map(field => {
                  const valA = aggA[field] || 0;
                  const valB = aggB[field] || 0;
                  const delta = valB - valA;
                  const winner = delta > 0.01 ? "B" : delta < -0.01 ? "A" : "Draw";
                  
                  return (
                    <tr key={field} className="border-b hover:bg-gray-50">
                      <td className="p-4 capitalize">{field.replace("_", " ")}</td>
                      <td className="p-4 font-mono">{(valA * 100).toFixed(1)}%</td>
                      <td className="p-4 font-mono">{(valB * 100).toFixed(1)}%</td>
                      <td className={`p-4 font-mono ${delta > 0 ? "text-green-600" : delta < 0 ? "text-red-600" : ""}`}>
                        {delta > 0 ? "+" : ""}{(delta * 100).toFixed(1)}%
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${winner === "B" ? "bg-green-100 text-green-800" : winner === "A" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}`}>
                          {winner}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-8">
             <div className="border rounded p-4">
                <h3 className="font-bold mb-4">Summary stats (Run A)</h3>
                <div className="space-y-2 text-sm">
                   <div className="flex justify-between"><span>Avg F1</span><span>{(aggA.overall * 100).toFixed(1)}%</span></div>
                   <div className="flex justify-between"><span>Total Cost</span><span>${runA.totalCostUsd}</span></div>
                   <div className="flex justify-between"><span>Total Tokens</span><span>{runA.totalInputTokens + runA.totalOutputTokens}</span></div>
                </div>
             </div>
             <div className="border rounded p-4">
                <h3 className="font-bold mb-4">Summary stats (Run B)</h3>
                <div className="space-y-2 text-sm">
                   <div className="flex justify-between"><span>Avg F1</span><span>{(aggB.overall * 100).toFixed(1)}%</span></div>
                   <div className="flex justify-between"><span>Total Cost</span><span>${runB.totalCostUsd}</span></div>
                   <div className="flex justify-between"><span>Total Tokens</span><span>{runB.totalInputTokens + runB.totalOutputTokens}</span></div>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
