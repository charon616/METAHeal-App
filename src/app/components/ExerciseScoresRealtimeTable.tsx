import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";

type ExerciseScoreRow = {
  id: number;
  created_at: string;
  exercise_type: string;
  set_num: number;
  overall_score: number;
  timing_score: number;
  posture_score: number;
};

const MAX_ROWS = 50;
const PULL_TRIGGER_PX = 64;
const PULL_MAX_PX = 96;

function sortByCreatedAtDesc(rows: ExerciseScoreRow[]) {
  return [...rows].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function upsertRow(rows: ExerciseScoreRow[], incoming: ExerciseScoreRow) {
  const filtered = rows.filter((row) => row.id !== incoming.id);
  return sortByCreatedAtDesc([incoming, ...filtered]).slice(0, MAX_ROWS);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export default function ExerciseScoresRealtimeTable() {
  const [rows, setRows] = useState<ExerciseScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const pullStartYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  const averageOverallScore = useMemo(() => {
    if (rows.length === 0) {
      return 0;
    }
    const total = rows.reduce((sum, row) => sum + row.overall_score, 0);
    return Math.round(total / rows.length);
  }, [rows]);

  const readyToRefresh = pullDistance >= PULL_TRIGGER_PX;

  const fetchRows = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("exercise_scores")
      .select(
        "id, created_at, exercise_type, set_num, overall_score, timing_score, posture_score",
      )
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);

    if (fetchError) {
      setError(fetchError.message);
      if (mode === "initial") {
        setRows([]);
      }
    } else {
      setRows(sortByCreatedAtDesc((data ?? []) as ExerciseScoreRow[]));
      setLastSyncedAt(new Date().toISOString());
    }

    if (mode === "initial") {
      setLoading(false);
    } else {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const handleChange = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ) => {
      setLastSyncedAt(new Date().toISOString());
      setRows((prevRows) => {
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          return upsertRow(prevRows, payload.new as ExerciseScoreRow);
        }

        if (payload.eventType === "DELETE") {
          const deletedId = (payload.old as { id?: number }).id;
          return prevRows.filter((row) => row.id !== deletedId);
        }

        return prevRows;
      });
    };

    void fetchRows("initial");

    const channel = supabase
      .channel("exercise_scores-stream")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "exercise_scores",
        },
        handleChange,
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          setError("Realtime subscription failed.");
        }
        if (status === "SUBSCRIBED" && isMounted) {
          void fetchRows("refresh");
        }
      });

    const refreshTimer = window.setInterval(() => {
      if (isMounted) {
        void fetchRows("refresh");
      }
    }, 10000);

    return () => {
      isMounted = false;
      window.clearInterval(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [fetchRows]);

  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (event) => {
    if (event.currentTarget.scrollTop <= 0 && !refreshing) {
      pullStartYRef.current = event.touches[0]?.clientY ?? null;
      isPullingRef.current = true;
    }
  };

  const handleTouchMove: React.TouchEventHandler<HTMLDivElement> = (event) => {
    if (!isPullingRef.current || pullStartYRef.current === null) {
      return;
    }

    const currentY = event.touches[0]?.clientY ?? pullStartYRef.current;
    const deltaY = currentY - pullStartYRef.current;

    if (deltaY <= 0) {
      setPullDistance(0);
      return;
    }

    event.preventDefault();
    setPullDistance(Math.min(deltaY, PULL_MAX_PX));
  };

  const handleTouchEnd = () => {
    if (isPullingRef.current && pullDistance >= PULL_TRIGGER_PX && !refreshing) {
      void fetchRows("refresh");
    }

    isPullingRef.current = false;
    pullStartYRef.current = null;
    setPullDistance(0);
  };

  return (
    <section
      className="mx-5 mb-5 rounded-2xl p-4"
      style={{ background: "#f5f5f5", border: "1px solid rgba(0,0,0,0.08)" }}
    >
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: "#888", fontFamily: "'Barlow', sans-serif" }}
          >
            Supabase Realtime
          </p>
          <h3
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: 18,
              color: "#0a0a0a",
            }}
          >
            EXERCISE SCORES
          </h3>
          {lastSyncedAt && (
            <p
              className="text-[10px]"
              style={{ color: "#777", fontFamily: "'Barlow', sans-serif" }}
            >
              Last sync: {formatDateTime(lastSyncedAt)}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className="text-[10px] font-semibold"
            style={{ color: "#666", fontFamily: "'Barlow', sans-serif" }}
          >
            Rows: {rows.length} / {MAX_ROWS} | Avg overall: {averageOverallScore}
          </span>
          <button
            type="button"
            onClick={() => {
              void fetchRows("refresh");
            }}
            disabled={refreshing}
            className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
            style={{
              background: refreshing ? "#cfcfcf" : "#0a0a0a",
              color: "#fff",
              fontFamily: "'Barlow', sans-serif",
              cursor: refreshing ? "not-allowed" : "pointer",
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {loading && (
        <p
          className="text-sm"
          style={{ color: "#666", fontFamily: "'Barlow', sans-serif" }}
        >
          Loading exercise_scores...
        </p>
      )}

      {!loading && error && (
        <p
          className="text-sm"
          style={{ color: "#e02020", fontFamily: "'Barlow', sans-serif" }}
        >
          Error: {error}
        </p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p
          className="text-sm"
          style={{ color: "#666", fontFamily: "'Barlow', sans-serif" }}
        >
          No rows found in exercise_scores.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div
          className="max-h-72 overflow-y-auto rounded-xl bg-white"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <div
            className="flex items-center justify-center text-[11px] font-semibold transition-all"
            style={{
              height: pullDistance > 0 ? pullDistance : 0,
              color: readyToRefresh ? "#0a0a0a" : "#888",
              fontFamily: "'Barlow', sans-serif",
              overflow: "hidden",
            }}
          >
            {refreshing
              ? "Refreshing..."
              : readyToRefresh
                ? "Release to refresh"
                : "Pull down to refresh"}
          </div>

          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-600">
                <th className="px-2 py-2">ID</th>
                <th className="px-2 py-2">Created</th>
                <th className="px-2 py-2">Exercise</th>
                <th className="px-2 py-2">Set</th>
                <th className="px-2 py-2">Overall</th>
                <th className="px-2 py-2">Timing</th>
                <th className="px-2 py-2">Posture</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-2 py-2 font-semibold text-black">#{row.id}</td>
                  <td className="px-2 py-2 text-gray-600">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="px-2 py-2 text-black">{row.exercise_type}</td>
                  <td className="px-2 py-2 text-black">{row.set_num}</td>
                  <td className="px-2 py-2 text-black">{row.overall_score}</td>
                  <td className="px-2 py-2 text-black">{row.timing_score}</td>
                  <td className="px-2 py-2 text-black">{row.posture_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
