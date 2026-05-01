"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { RunSummary } from "@test-evals/shared";

export default function Home() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRuns();
  }, []);

  const fetchRuns = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8787"}/api/v1/runs`);
      const data = await res.json();
      setRuns(data);
    } catch (err) {
      console.error("Failed to fetch runs", err);
    } finally {
      setLoading(false);
    }
  };

  const startRun = async (strategy: string) => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8787"}/api/v1/runs`, {
        method: "POST",
        body: JSON.stringify({ strategy, model: "claude-haiku-4-5-20251001" }),
      });
      fetchRuns();
    } catch (err) {
      console.error("Failed to start run", err);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">HEALOSBENCH</h1>
        <div className="flex gap-2">
          {["zero_shot", "few_shot", "cot"].map(s => (
            <button
              key={s}
              onClick={() => startRun(s)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
            >
              Run {s}
            </button>
          ))}
          <Link href="/compare" className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300 transition">
            Compare
          </Link>
        </div>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="grid gap-4">
          {runs.map(run => (
            <Link
              key={run.id}
              href={`/runs/${run.id}`}
              className="border rounded-lg p-4 hover:shadow-md transition block"
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-lg font-semibold">{run.strategy}</div>
                  <div className="text-sm text-gray-500">{run.model}</div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-medium ${run.status === "completed" ? "text-green-600" : "text-blue-600"}`}>
                    {run.status.toUpperCase()} ({run.progress}%)
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(run.createdAt))} ago
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-8">
                <div>
                  <div className="text-xs text-gray-400 uppercase">Cost</div>
                  <div className="font-mono">${run.totalCostUsd}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase">Duration</div>
                  <div className="font-mono">{(run.totalDurationMs / 1000).toFixed(1)}s</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase">Cases</div>
                  <div className="font-mono">{run.completedCases}/{run.totalCases}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
