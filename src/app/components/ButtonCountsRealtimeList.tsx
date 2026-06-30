import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";

type ButtonCountRow = {
  id: number;
  count_value: number;
  device: string | null;
  created_at: string;
};

const MAX_ROWS = 50;
const PULL_TRIGGER_PX = 64;
const PULL_MAX_PX = 96;

function sortByCreatedAtDesc(rows: ButtonCountRow[]) {
  return [...rows].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function upsertRow(rows: ButtonCountRow[], incoming: ButtonCountRow) {
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

export default function ButtonCountsRealtimeList() {
  const [rows, setRows] = useState<ButtonCountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const pullStartYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  const totalCount = useMemo(
    () => rows.reduce((sum, row) => sum + row.count_value, 0),
    [rows],
  );
  const readyToRefresh = pullDistance >= PULL_TRIGGER_PX;

  const fetchRows = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("button_counts")
      .select("id, count_value, device, created_at")
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);

    if (fetchError) {
      setError(fetchError.message);
      if (mode === "initial") {
        setRows([]);
      }
    } else {
      setRows(sortByCreatedAtDesc((data ?? []) as ButtonCountRow[]));
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
          return upsertRow(prevRows, payload.new as ButtonCountRow);
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
      .channel("button_counts-stream")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "button_counts",
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
            BUTTON COUNTS
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
            Rows: {rows.length} / {MAX_ROWS} | Sum: {totalCount}
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
          Loading button_counts...
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
          No rows found in button_counts.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div
          className="max-h-64 overflow-y-auto rounded-xl bg-white"
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
          <ul>
            {rows.map((row) => (
              <li
                key={row.id}
                className="grid grid-cols-[auto_auto_1fr] gap-x-3 gap-y-1 border-b px-3 py-2 last:border-b-0"
                style={{ borderColor: "#f0f0f0" }}
              >
                <span className="text-xs font-semibold text-black">
                  #{row.id}
                </span>
                <span className="text-xs text-black">
                  count: {row.count_value}
                </span>
                <span className="truncate text-xs text-gray-600">
                  device: {row.device ?? "unknown"}
                </span>
                <span className="col-span-3 text-[11px] text-gray-500">
                  created: {formatDateTime(row.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
