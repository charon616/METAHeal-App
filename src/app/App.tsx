import React, { useEffect, useMemo, useRef, useState } from "react";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import EmojiEventsRounded from "@mui/icons-material/EmojiEventsRounded";
import LocalFireDepartmentRounded from "@mui/icons-material/LocalFireDepartmentRounded";
import AppBottomNav from "./components/AppBottomNav";
import { useIsMobile } from "./components/ui/use-mobile";
import ButtonCountsRealtimeList from "./components/ButtonCountsRealtimeList";
import metaHealLogo from "../assets/MetaHEAL_logo.png";
import aiGreetingVideo from "../assets/ElevenLabs_video_google-veo-3-1-fast_adelie penguin _2026-06-26T06_03_12.mp4";
import bannerBg from "../assets/banner_bg.png";
import bodySvg from "../assets/body.svg";
import planImage1 from "../assets/plan_image1.png";
import planImage2 from "../assets/plan_image2.png";
import planImage3 from "../assets/plan_image3.png";
import planImage4 from "../assets/plan_image4.png";
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Clock3,
  CircleUserRound,
  Phone,
  Stethoscope,
  Target,
  Users,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

type AppMode = "doctor" | "patient" | null;
type PatientTab = "today" | "booking" | "mypage";
type DoctorTab = "overview" | "patients" | "booking";

type TrainingItem = {
  id: number;
  title: string;
  bodyPart: string;
  sets: number;
  reps: number;
  lastPrecision: number;
  imageUrl: string;
  description: string;
};

type Position3D = {
  x: number;
  y: number;
  z: number;
};

type MotionNode = {
  position: Position3D;
};

type MotionFrame = {
  t: number;
  head?: MotionNode;
  leftHand?: MotionNode;
  rightHand?: MotionNode;
};

type MotionSession = {
  sessionId: string;
  performerId: string;
  exerciseId: string;
  recordedAtIsoUtc: string;
  sampleRateHz: number;
  durationSeconds: number;
  frameCount: number;
  frames: MotionFrame[];
};

type SessionHistoryItem = {
  day: number;
  dateLabel: string;
  precision: number | null;
};

type ExerciseScoreRow = {
  id: number;
  created_at: string;
  exercise_type: string;
  set_num: number;
  overall_score: number;
  timing_score: number;
  posture_score: number;
};

const trainingItems: TrainingItem[] = [
  {
    id: 1,
    title: "Shoulder External Rotation",
    bodyPart: "Shoulder",
    sets: 3,
    reps: 12,
    lastPrecision: 84,
    imageUrl: planImage1,
    description:
      "Strengthen rotator cuff control with a slow outward pull. Keep your elbow tucked by your side and avoid shrugging the shoulder.",
  },
  {
    id: 2,
    title: "Straight Leg Raise",
    bodyPart: "Hip Flexor",
    sets: 3,
    reps: 10,
    lastPrecision: 79,
    imageUrl: planImage2,
    description:
      "Build hip and quadriceps strength while protecting the knee. Lift one straight leg with core engaged and lower with control.",
  },
  {
    id: 3,
    title: "Clamshell",
    bodyPart: "Hip",
    sets: 4,
    reps: 14,
    lastPrecision: 82,
    imageUrl: planImage3,
    description:
      "Target glute medius activation for pelvic stability. Keep feet together and open the top knee without rolling your trunk.",
  },
  {
    id: 4,
    title: "Scapular Retraction",
    bodyPart: "Upper Back",
    sets: 3,
    reps: 12,
    lastPrecision: 77,
    imageUrl: planImage4,
    description:
      "Improve postural control by drawing shoulder blades back and down. Maintain a long neck and avoid arching through the lower back.",
  },
];

const bodyProgress = [
  { name: "Right Knee", done: 72 },
  { name: "Hip Flexor", done: 63 },
  { name: "Lower Back", done: 41 },
];

const bodySpotPositionByName: Record<string, { x: string; y: string; view: "front" | "back"; radius: number }> = {
  "Right Knee": { x: "58%", y: "83%", view: "front", radius: 30 },
  "Hip Flexor": { x: "52%", y: "45%", view: "front", radius: 34 },
  "Lower Back": { x: "50%", y: "50%", view: "back", radius: 36 },
};

function getBodyHeatColor(level: number, alpha = 1) {
  const safeLevel = Math.max(0, Math.min(1, level));
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  // Unified thermal palette for all symptoms: blue -> green -> yellow -> red.
  const hue = 235 - safeLevel * 235;
  return `hsla(${hue}, 95%, 52%, ${safeAlpha})`;
}

function getBodyHeatSeverity(progress: number) {
  const clamped = Math.max(0, Math.min(100, progress));
  const rawSeverity = 1 - clamped / 100;
  // Make differences more prominent: high progress shifts cooler faster, low progress stays warmer.
  const contrasted = Math.pow(Math.max(0, Math.min(1, (rawSeverity - 0.08) / 0.84)), 1.25);
  return contrasted;
}

function getBodyHeatIntensity(progress: number) {
  const severity = getBodyHeatSeverity(progress);
  return 0.24 + severity * 0.9;
}

function getProgressBarGradient(progress: number) {
  const severity = getBodyHeatSeverity(progress);
  const cool = getBodyHeatColor(Math.max(0, severity - 0.35), 0.96);
  const mid = getBodyHeatColor(Math.max(0, severity - 0.1), 0.96);
  const warm = getBodyHeatColor(Math.min(1, severity + 0.28), 0.96);
  return `linear-gradient(90deg, ${cool} 0%, ${mid} 42%, ${warm} 100%)`;
}

function getBodyHeatmapGradient(view: "front" | "back") {
  const baseLayer =
    "radial-gradient(circle at 50% 35%, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0.2) 58%, rgba(255, 255, 255, 0.16) 100%)";

  const heatLayers = bodyProgress.flatMap((part) => {
    const spot = bodySpotPositionByName[part.name];
    if (!spot || spot.view !== view) {
      return [];
    }

    const severity = getBodyHeatSeverity(part.done);
    const intensity = getBodyHeatIntensity(part.done);
    const core = getBodyHeatColor(Math.min(1, severity + 0.35), 0.44 + intensity * 0.46);
    const midWarm = getBodyHeatColor(Math.min(1, severity + 0.16), 0.3 + intensity * 0.34);
    const midCool = getBodyHeatColor(Math.max(0, severity - 0.18), 0.2 + intensity * 0.24);
    const outerCool = getBodyHeatColor(Math.max(0, severity - 0.42), 0.12 + intensity * 0.18);
    const radiusBoost = Math.round((intensity - 0.35) * 14);
    const effectiveRadius = spot.radius + radiusBoost;
    const warmStop = Math.max(10, effectiveRadius - 16);
    const midStop = Math.max(16, effectiveRadius - 8);
    const outerStop = effectiveRadius;
    const fadeStop = effectiveRadius + 16;

    return [
      `radial-gradient(circle at ${spot.x} ${spot.y}, ${core} 0%, ${midWarm} ${warmStop}%, ${midCool} ${midStop}%, ${outerCool} ${outerStop}%, transparent ${fadeStop}%)`,
    ];
  });

  return [...heatLayers, baseLayer].join(", ");
}

const completedSessionPrecisions = [72, 77, 80, 74, 82, 79, 83, 76, 81, 78, 85, 84];
const rehabProgramHistory: SessionHistoryItem[] = Array.from({ length: 20 }, (_, index) => {
  const date = new Date(2026, 5, 1 + index);
  const precision = completedSessionPrecisions[index] ?? null;

  return {
    day: index + 1,
    dateLabel: `${date.getMonth() + 1}/${date.getDate()}`,
    precision,
  };
});

function getCallRoom(name: string) {
  return `metaheal-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function LoginMockScreen({ onSelect }: { onSelect: (mode: AppMode) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <img src={metaHealLogo} alt="MetaHEAL" className="h-auto w-64 mb-6" />
      <h1 className="mt-1 mb-4 text-center text-3xl font-bold" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
        SELECT MODE
      </h1>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          onClick={() => onSelect("patient")}
          className="rounded-2xl bg-black px-5 py-4 text-left text-white"
        >
          <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest">
            <CircleUserRound size={16} />
            Patient
          </span>
          <p className="mt-1 text-xs text-gray-200">Open today training and personal progress</p>
        </button>
        <button
          type="button"
          onClick={() => onSelect("doctor")}
          className="rounded-2xl border border-gray-300 bg-white px-5 py-4 text-left text-black"
        >
          <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest">
            <Stethoscope size={16} />
            Doctor
          </span>
          <p className="mt-1 text-xs text-gray-500">Review patient stats and remote care status</p>
        </button>
      </div>
    </div>
  );
}

function StartTrainingCard() {
  const [todayScore, setTodayScore] = useState<ExerciseScoreRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchLatestTodayScore = async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const { data, error } = await supabase
        .from("exercise_scores")
        .select(
          "id, created_at, exercise_type, set_num, overall_score, timing_score, posture_score",
        )
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (error) {
        setTodayScore(null);
      } else {
        setTodayScore((data as ExerciseScoreRow | null) ?? null);
      }

      setIsLoading(false);
    };

    void fetchLatestTodayScore();

    const channel = supabase
      .channel("exercise_scores-today-banner")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exercise_scores" },
        () => {
          void fetchLatestTodayScore();
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div
      className="mx-5 mb-4 min-h-[280px] rounded-3xl bg-black/80 p-4 text-slate-200"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.45)), url(${bannerBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="flex flex-col items-center justify-between gap-4">
        <h3 className="text-xl font-bold" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          {todayScore ? "TODAY'S RESULT SCORE" : "READY TO MOVE?"}
        </h3>
        {todayScore ? (
          <div className="w-full rounded-2xl bg-black/45 p-4">
            <p className="text-center text-5xl font-bold text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {todayScore.overall_score}%
            </p>
            <p className="mt-1 text-center text-xs uppercase tracking-widest text-slate-300">
              {todayScore.exercise_type} · Set {todayScore.set_num}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white/10 px-3 py-2 text-center">
                <p className="text-slate-300">Timing</p>
                <p className="text-base font-semibold text-white">{todayScore.timing_score}%</p>
              </div>
              <div className="rounded-lg bg-white/10 px-3 py-2 text-center">
                <p className="text-slate-300">Posture</p>
                <p className="text-base font-semibold text-white">{todayScore.posture_score}%</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-center text-sm text-slate-300">
            {isLoading
              ? "Checking today&apos;s result..."
              : "Put on your Meta Quest and begin today&apos;s rehab session."}
          </p>
        )}
      </div>
    </div>
  );
}

function AIGreetingSection() {
  return (
    <div className="mb-3 rounded-2xl bg-white">
      <div className="flex flex-col items-start">
        <div className="relative w-full">
          <video
            className="h-108 w-full flex-shrink-0 rounded-xl object-cover"
            src={aiGreetingVideo}
            autoPlay
            loop
            muted
            playsInline
          />
        </div>
        <div className="relative z-10 mx-3 -mt-5 rounded-xl bg-gray-100 px-3 py-2">
          <p className="text leading-relaxed text-gray-700">
            Hey, it&apos;s your 12th training day. How&apos;s it going? You&apos;re
            doing really well so far, but your doctor pointed out your knee
            alignment in the last session. You can do it!
          </p>
        </div>
      </div>
    </div>
  );
}

function isMotionSession(value: unknown): value is MotionSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MotionSession>;

  return (
    typeof candidate.sessionId === "string" &&
    typeof candidate.performerId === "string" &&
    typeof candidate.exerciseId === "string" &&
    typeof candidate.recordedAtIsoUtc === "string" &&
    typeof candidate.sampleRateHz === "number" &&
    typeof candidate.durationSeconds === "number" &&
    typeof candidate.frameCount === "number" &&
    Array.isArray(candidate.frames)
  );
}

function ExerciseJsonReplaySection() {
  const [session, setSession] = useState<MotionSession | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const frameCount = session?.frames.length ?? 0;
  const currentFrame = session?.frames[currentFrameIndex];

  useEffect(() => {
    if (!session || !isPlaying || frameCount < 2) {
      return;
    }

    const playbackHz = Math.min(Math.max(session.sampleRateHz || 10, 5), 30);
    const intervalMs = Math.round(1000 / playbackHz);
    const interval = window.setInterval(() => {
      setCurrentFrameIndex((prev) => Math.min(prev + 1, frameCount - 1));
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [session, isPlaying, frameCount]);

  useEffect(() => {
    if (!session || !isPlaying) {
      return;
    }

    if (currentFrameIndex >= frameCount - 1) {
      setIsPlaying(false);
    }
  }, [session, isPlaying, currentFrameIndex, frameCount]);

  const bounds = useMemo(() => {
    if (!session || session.frames.length === 0) {
      return { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
    }

    const xs: number[] = [];
    const zs: number[] = [];

    session.frames.forEach((frame) => {
      [frame.head, frame.leftHand, frame.rightHand].forEach((node) => {
        if (node?.position) {
          xs.push(node.position.x);
          zs.push(node.position.z);
        }
      });
    });

    if (xs.length === 0 || zs.length === 0) {
      return { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
    }

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const padX = Math.max((maxX - minX) * 0.1, 0.05);
    const padZ = Math.max((maxZ - minZ) * 0.1, 0.05);

    return {
      minX: minX - padX,
      maxX: maxX + padX,
      minZ: minZ - padZ,
      maxZ: maxZ + padZ,
    };
  }, [session]);

  const toCanvasPoint = (position?: Position3D) => {
    const width = 260;
    const height = 170;

    if (!position) {
      return null;
    }

    const xRange = Math.max(bounds.maxX - bounds.minX, 0.0001);
    const zRange = Math.max(bounds.maxZ - bounds.minZ, 0.0001);
    const x = ((position.x - bounds.minX) / xRange) * width;
    const y = ((position.z - bounds.minZ) / zRange) * height;

    return { x, y };
  };

  const buildPath = (selector: (frame: MotionFrame) => MotionNode | undefined) => {
    if (!session) {
      return "";
    }

    return session.frames
      .map((frame) => toCanvasPoint(selector(frame)?.position))
      .filter((point): point is { x: number; y: number } => point !== null)
      .map((point) => `${point.x},${point.y}`)
      .join(" ");
  };

  const headPath = buildPath((frame) => frame.head);
  const leftPath = buildPath((frame) => frame.leftHand);
  const rightPath = buildPath((frame) => frame.rightHand);

  const currentHead = toCanvasPoint(currentFrame?.head?.position);
  const currentLeft = toCanvasPoint(currentFrame?.leftHand?.position);
  const currentRight = toCanvasPoint(currentFrame?.rightHand?.position);

  const handleFilePicked: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);

      if (!isMotionSession(parsed)) {
        setSession(null);
        setParseError("Invalid format. Expected session metadata and frames array.");
        return;
      }

      setSession(parsed);
      setParseError(null);
      setCurrentFrameIndex(0);
      setIsPlaying(false);
    } catch {
      setSession(null);
      setParseError("Could not parse JSON file.");
    }
  };

  return (
    <div className="mx-5 mb-3 rounded-2xl border border-gray-200 bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        Exercise JSON Preview & Replay
      </p>

      <label className="mt-2 block rounded-xl border border-dashed border-gray-300 p-3">
        <span className="text-xs text-gray-600">
          Upload exercise JSON (session + frames) to preview and replay
        </span>
        <input
          type="file"
          accept=".json,application/json"
          onChange={handleFilePicked}
          className="mt-2 block w-full text-xs"
        />
      </label>

      {parseError && <p className="mt-2 text-xs text-red-600">{parseError}</p>}

      {session && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-700">
            <div className="rounded-lg bg-gray-100 p-2">
              <p className="text-gray-500">Session</p>
              <p className="truncate font-semibold">{session.sessionId}</p>
            </div>
            <div className="rounded-lg bg-gray-100 p-2">
              <p className="text-gray-500">Exercise</p>
              <p className="truncate font-semibold">{session.exerciseId}</p>
            </div>
            <div className="rounded-lg bg-gray-100 p-2">
              <p className="text-gray-500">Duration</p>
              <p className="font-semibold">{session.durationSeconds.toFixed(1)}s</p>
            </div>
            <div className="rounded-lg bg-gray-100 p-2">
              <p className="text-gray-500">Frames / Hz</p>
              <p className="font-semibold">
                {session.frameCount} / {session.sampleRateHz.toFixed(1)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 p-2">
            <svg viewBox="0 0 260 170" className="h-44 w-full rounded-lg bg-gray-50">
              {headPath && (
                <polyline
                  points={headPath}
                  fill="none"
                  stroke="#111827"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {leftPath && (
                <polyline
                  points={leftPath}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {rightPath && (
                <polyline
                  points={rightPath}
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {currentHead && <circle cx={currentHead.x} cy={currentHead.y} r="4" fill="#111827" />}
              {currentLeft && <circle cx={currentLeft.x} cy={currentLeft.y} r="4" fill="#2563eb" />}
              {currentRight && <circle cx={currentRight.x} cy={currentRight.y} r="4" fill="#f97316" />}
            </svg>

            <div className="mt-2 flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-gray-900" />
                Head
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-600" />
                Left hand
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
                Right hand
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (currentFrameIndex >= frameCount - 1) {
                    setCurrentFrameIndex(0);
                  }
                  setIsPlaying((prev) => !prev);
                }}
                className="rounded-full bg-black px-3 py-1.5 text-[11px] font-semibold text-white"
              >
                {isPlaying ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentFrameIndex(0);
                }}
                className="rounded-full border border-gray-300 px-3 py-1.5 text-[11px] font-semibold text-gray-700"
              >
                Reset
              </button>
              <span className="text-[11px] text-gray-500">
                Frame {Math.min(currentFrameIndex + 1, frameCount)} / {frameCount}
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={Math.max(frameCount - 1, 0)}
              value={Math.min(currentFrameIndex, Math.max(frameCount - 1, 0))}
              onChange={(event) => {
                setIsPlaying(false);
                setCurrentFrameIndex(Number(event.target.value));
              }}
              className="mt-2 w-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TodayPlanScreen() {
  const completedDays = rehabProgramHistory.filter((item) => item.precision !== null).length;
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const [selectedTrainingItem, setSelectedTrainingItem] = useState<TrainingItem | null>(null);

  useEffect(() => {
    const container = historyScrollRef.current;
    if (!container) {
      return;
    }

    const target = container.querySelector<HTMLElement>(`[data-day="${completedDays}"]`);
    if (!target) {
      return;
    }

    const centeredLeft = target.offsetLeft - container.clientWidth / 2 + target.clientWidth / 2;
    container.scrollTo({
      left: Math.max(centeredLeft, 0),
      behavior: "smooth",
    });
  }, [completedDays]);

  return (
    <div className="h-full overflow-y-auto pb-5" style={{ scrollbarWidth: "none" }}>

      <AIGreetingSection />
      {/* <ExerciseJsonReplaySection /> */}

      <div className="px-5 pt-6 mb-4">
        <section className="rounded-2xl bg-white">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              DAY {completedDays}: TODAY&apos;S PLAN
            </h2>
            <p className="whitespace-nowrap text-sm font-semibold text-gray-800">
              Day {completedDays} / {rehabProgramHistory.length}
            </p>
          </div>
          <div ref={historyScrollRef} className="mt-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
            <div className="flex min-w-max items-end gap-2">
              {rehabProgramHistory.map((session) => {
                const isCompleted = session.precision !== null;
                const isToday = session.day === completedDays;
                const barHeight = isCompleted ? Math.max(session.precision ?? 0, 10) : 8;

                return (
                  <div key={session.day} data-day={session.day} className="w-10 shrink-0">
                    <p className={`text-center text-[10px] font-semibold ${isCompleted ? "text-blue-700" : "text-gray-400"}`}>
                      {isCompleted ? `${session.precision}%` : "--"}
                    </p>
                    <div className="relative mt-1 flex h-20 items-end rounded-lg bg-gray-100 px-1.5 py-1">
                      {isToday && (
                        <div
                          className="pointer-events-none absolute -inset-1 rounded-[10px] border-2 border-dashed"
                          style={{ borderColor: "#00ff6e" }}
                        />
                      )}
                      <div
                        className={`w-full rounded-md ${
                          isCompleted ? "bg-blue-500" : "border border-dashed border-gray-400 bg-gray-300/70"
                        }`}
                        style={{ height: `${barHeight}%` }}
                      />
                    </div>
                    <p className="mt-1 text-center text-[10px] text-gray-500">{session.dateLabel}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <div className="px-5 mb-4">
        <p className="mb-2 flex items-center text-sm gap-1.5 font-medium text-gray-500">
          <Clock3 size={14} />
          <span>Estimated time: 15 min</span>
        </p>
        <div className="grid grid-cols-1 gap-2.5">
          {trainingItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedTrainingItem(item)}
              className="w-full rounded-2xl border border-gray-200 bg-white text-left pr-2"
            >
              <div className="flex items-center gap-3">
                <div className="relative w-32 shrink-0">
                  <img src={item.imageUrl} alt={item.title} className="h-20 w-full rounded-l-2xl rounded-r-none object-cover" />
                </div>
                <div className="flex-1">
                  <p className="mb-1.5 font-bold text-black" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {item.title}
                  </p>
                  <div className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    <Target size={12} />
                    <span>Last precision {item.lastPrecision}%</span>
                  </div>
                </div>
                <ChevronRight size={16} className="shrink-0 text-gray-400" />
              </div>
            </button>
          ))}
        </div>
      </div>

      <StartTrainingCard />

      {selectedTrainingItem && (
        <TrainingDetailModal item={selectedTrainingItem} onClose={() => setSelectedTrainingItem(null)} />
      )}

      {/* <ButtonCountsRealtimeList /> */}
    </div>
  );
}

function TrainingDetailModal({
  item,
  onClose,
}: {
  item: TrainingItem;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-end bg-black/55 p-3">
      <div className="w-full rounded-2xl bg-white">
        <div className="relative">
          <img src={item.imageUrl} alt={item.title} className="h-44 w-full rounded-t-2xl object-cover" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full bg-black/65 p-1.5 text-white"
            aria-label="Close training detail"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <h3 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            {item.title}
          </h3>

          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">{item.bodyPart}</span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
              {item.sets} sets x {item.reps} reps
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
              <Target size={12} />
              Last precision {item.lastPrecision}%
            </span>
          </div>

          <p className="text-sm leading-relaxed text-gray-600">{item.description}</p>
        </div>
      </div>
    </div>
  );
}

function BodyMapCard() {
  const [activeBodyPart, setActiveBodyPart] = useState<string>("Right Knee");

  return (
    <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-white/90">Body Progress</p>
      <div className="mt-3 space-y-3">
        <div className="flex items-start justify-center gap-3">
          {(["front", "back"] as const).map((view) => (
            <div key={view} className="space-y-1">
              <div className="relative flex h-48 w-28 items-center justify-center rounded-2xl">
                <div
                  className="relative h-[164px] w-full"
                  style={{
                    background: getBodyHeatmapGradient(view),
                    WebkitMaskImage: `url(${bodySvg})`,
                    WebkitMaskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                    WebkitMaskSize: "contain",
                    maskImage: `url(${bodySvg})`,
                    maskRepeat: "no-repeat",
                    maskPosition: "center",
                    maskSize: "contain",
                  }}
                >
                  {bodyProgress.map((part, index) => {
                    const spotPosition = bodySpotPositionByName[part.name];
                    if (!spotPosition || spotPosition.view !== view) {
                      return null;
                    }

                    const isActive = activeBodyPart === part.name;
                    const markerGlow = getBodyHeatColor(getBodyHeatSeverity(part.done), 0.9);

                    return (
                      <button
                        key={`${view}-${part.name}`}
                        type="button"
                        onClick={() => setActiveBodyPart(part.name)}
                        onMouseEnter={() => setActiveBodyPart(part.name)}
                        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{
                          left: spotPosition.x,
                          top: spotPosition.y,
                          width: isActive ? 30 : 22,
                          height: isActive ? 30 : 22,
                          border: "1.5px solid rgba(255,255,255,0.95)",
                          background: isActive ? "rgba(255,255,255,0.26)" : "rgba(255,255,255,0.12)",
                          color: "white",
                          fontSize: "11px",
                          fontWeight: 700,
                          lineHeight: 1,
                          boxShadow: isActive ? `0 0 12px ${markerGlow}` : "0 0 6px rgba(0,0,0,0.2)",
                        }}
                        aria-label={`Highlight ${part.name}`}
                      >
                        {index + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-white/75">{view}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {bodyProgress.map((part, index) => (
            <button
              key={part.name}
              type="button"
              onClick={() => setActiveBodyPart(part.name)}
              onMouseEnter={() => setActiveBodyPart(part.name)}
              className="block w-full text-left"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className={`text-xs font-semibold ${activeBodyPart === part.name ? "text-white" : "text-blue-100"}`}>
                  {index + 1}. {part.name}
                </span>
                <span className="text-xs text-white/80">{part.done}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/35">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${part.done}%`,
                    background: getProgressBarGradient(part.done),
                    boxShadow: activeBodyPart === part.name ? `0 0 8px ${getBodyHeatColor(getBodyHeatSeverity(part.done), 0.9)}` : "none",
                  }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BookingScreen({ onStartCall }: { onStartCall: (room: string) => void }) {
  const [selectedDate, setSelectedDate] = useState("2026-06-27");
  const bookingSessions = [
    { date: "2026-06-27", time: "10:30", doctor: "Dr. Aron", focus: "Right Knee ACL", mode: "Video Call" },
  ];

  const sessionDates = new Set(bookingSessions.map((session) => session.date));
  const sessionsForSelectedDate = bookingSessions.filter((session) => session.date === selectedDate);
  const calendarDays = Array.from({ length: 30 }, (_, index) => {
    const day = index + 1;
    const dateKey = `2026-06-${String(day).padStart(2, "0")}`;
    return { day, dateKey, hasSession: sessionDates.has(dateKey) };
  });

  return (
    <div className="h-full overflow-y-auto pb-5" style={{ scrollbarWidth: "none" }}>
      <div className="px-5 pt-6 pb-3">
        <h2 className="mt-1 text-3xl font-bold" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          BOOKING
        </h2>
      </div>

      <div className="mx-5 mb-3 min-h-[120px] rounded-2xl bg-black p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-300">Upcoming Session</p>
            <p className="mt-1 text-lg font-bold">Dr. Aron | Fri 10:30</p>
          </div>
          <button
            type="button"
            onClick={() => onStartCall(getCallRoom("dr-emma-watson-sarah-m"))}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black"
          >
            <span className="flex items-center gap-1">
              <Phone size={13} />
              Call
            </span>
          </button>
        </div>
      </div>

      <div className="mx-5 mb-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">June 2026</p>
          <p className="text-[11px] text-gray-500">Select a day</p>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-gray-400">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
            <span key={dayName}>{dayName}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={`booking-blank-${index}`} />
          ))}
          {calendarDays.map((item) => {
            const isSelected = item.dateKey === selectedDate;
            return (
              <button
                key={item.dateKey}
                type="button"
                onClick={() => setSelectedDate(item.dateKey)}
                className={`relative h-8 rounded-lg text-xs font-semibold ${
                  isSelected ? "bg-black text-white" : "bg-gray-100 text-gray-700"
                }`}
              >
                {item.day}
                {item.hasSession && (
                  <span
                    className={`absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${
                      isSelected ? "bg-white" : "bg-blue-600"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-5 rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          My Sessions ({selectedDate})
        </p>
        <div className="mt-2 space-y-2">
          {sessionsForSelectedDate.length === 0 && (
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">No sessions booked for this date.</p>
          )}
          {sessionsForSelectedDate.map((session) => (
            <div
              key={`${session.date}-${session.time}-${session.doctor}`}
              className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2"
            >
              <div>
                <p className="text-xs font-semibold text-black">
                  {session.time} · {session.doctor}
                </p>
                <p className="text-[11px] text-gray-500">{session.focus}</p>
              </div>
              <button
                type="button"
                onClick={() => onStartCall(getCallRoom(`${session.doctor}-patient`))}
                className="rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-white"
              >
                {session.mode}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MyPageScreen() {
  const [historyRange, setHistoryRange] = useState("7d" as "7d" | "30d");

  const precisionWindow = useMemo(() => {
    const days = historyRange === "7d" ? 7 : 30;
    return rehabProgramHistory.slice(-days);
  }, [historyRange]);

  const precisionStats = useMemo(() => {
    const values = precisionWindow.filter((item) => item.precision !== null).map((item) => item.precision as number);
    if (values.length === 0) {
      return { latest: null as number | null, average: null as number | null, delta: null as number | null };
    }
    const latest = values[values.length - 1];
    const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    return { latest, average, delta: latest - average };
  }, [precisionWindow]);

  const precisionChart = useMemo(() => {
    const width = 320;
    const height = 140;
    const padX = 18;
    const padTop = 12;
    const padBottom = 24;
    const plotWidth = width - padX * 2;
    const plotHeight = height - padTop - padBottom;

    const toY = (value: number) => padTop + ((100 - value) / 100) * plotHeight;
    const xStep = precisionWindow.length > 1 ? plotWidth / (precisionWindow.length - 1) : 0;

    const points = precisionWindow.map((item, index) => ({
      x: padX + index * xStep,
      y: item.precision !== null ? toY(item.precision) : null,
      label: item.dateLabel,
    }));

    let path = "";
    let hasStarted = false;
    points.forEach((point) => {
      if (point.y === null) {
        hasStarted = false;
        return;
      }
      if (!hasStarted) {
        path += `M ${point.x} ${point.y} `;
        hasStarted = true;
      } else {
        path += `L ${point.x} ${point.y} `;
      }
    });

    const lastValidPoint = [...points].reverse().find((point) => point.y !== null) ?? null;
    const targetY = toY(80);

    return { width, height, padX, points, path, targetY, lastValidPoint };
  }, [precisionWindow]);

  return (
    <div className="h-full overflow-y-auto pb-5" style={{ scrollbarWidth: "none" }}>
      <div className="px-5 pt-6 pb-3">
        <h2 className="mt-1 text-3xl font-bold" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          MY PAGE
        </h2>
      </div>

      <div className="mx-5 grid grid-cols-2 gap-2.5">
        {[
          { label: "Points", value: "2,480", icon: <EmojiEventsRounded sx={{ fontSize: 24, color: "#f59e0b" }} /> },
          { label: "Precision", value: "82%", icon: <AutoAwesomeRounded sx={{ fontSize: 24, color: "#3b82f6" }} /> },
          { label: "Finished Sessions", value: "34", icon: <CheckCircleRounded sx={{ fontSize: 24, color: "#10b981" }} /> },
          { label: "Streak", value: "11 days", icon: <LocalFireDepartmentRounded sx={{ fontSize: 24, color: "#f97316" }} /> },
        ].map(({ label, value, icon }) => (
          <div key={label} className="relative rounded-2xl bg-gray-100 p-3.5">
            <div className="mb-1 text-gray-500">
              <span className="text-[10px] font-semibold uppercase tracking-widest">{label}</span>
            </div>
            <p className="text-2xl font-bold text-black" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {value}
            </p>
            <div className="absolute bottom-3 right-3">{icon}</div>
          </div>
        ))}
      </div>

      <div className="mx-5 mt-3">
        <section className="rounded-2xl border border-gray-200 bg-white p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Precision History</p>
              <p className="text-sm font-semibold text-gray-900">
                {precisionStats.latest !== null ? `Latest ${precisionStats.latest}%` : "No completed data yet"}
                {precisionStats.delta !== null && (
                  <span className={`ml-1 ${precisionStats.delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    ({precisionStats.delta >= 0 ? "+" : ""}
                    {precisionStats.delta}% vs avg)
                  </span>
                )}
              </p>
            </div>
            <div className="inline-flex rounded-full bg-gray-100 p-0.5">
              {(["7d", "30d"] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setHistoryRange(range)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    historyRange === range ? "bg-black text-white" : "text-gray-600"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 rounded-xl bg-gray-50 p-2">
            <svg viewBox={`0 0 ${precisionChart.width} ${precisionChart.height}`} className="h-36 w-full">
              <defs>
                <linearGradient id="myPagePrecisionLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#22c55e" />
                  <stop offset="50%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>

              {[0, 25, 50, 75, 100].map((tick) => {
                const y = 12 + ((100 - tick) / 100) * (precisionChart.height - 12 - 24);
                return (
                  <g key={tick}>
                    <line x1={precisionChart.padX} y1={y} x2={precisionChart.width - precisionChart.padX} y2={y} stroke="#e5e7eb" />
                    <text x={2} y={y + 3} fontSize="9" fill="#9ca3af">
                      {tick}
                    </text>
                  </g>
                );
              })}

              <line
                x1={precisionChart.padX}
                y1={precisionChart.targetY}
                x2={precisionChart.width - precisionChart.padX}
                y2={precisionChart.targetY}
                stroke="#10b981"
                strokeDasharray="4 3"
                strokeWidth="1.2"
              />
              <text x={precisionChart.width - precisionChart.padX - 30} y={precisionChart.targetY - 4} fontSize="9" fill="#059669">
                Goal 80
              </text>

              {precisionChart.path && (
                <path d={precisionChart.path} fill="none" stroke="url(#myPagePrecisionLineGradient)" strokeWidth="3" strokeLinecap="round" />
              )}

              {precisionChart.points.map((point) => {
                if (point.y === null) {
                  return null;
                }
                return <circle key={`${point.label}-${point.x}`} cx={point.x} cy={point.y} r="2.8" fill="#111827" />;
              })}

              {precisionChart.lastValidPoint && (
                <circle
                  cx={precisionChart.lastValidPoint.x}
                  cy={precisionChart.lastValidPoint.y ?? 0}
                  r="4.2"
                  fill="#111827"
                  stroke="#fff"
                  strokeWidth="1.5"
                />
              )}
            </svg>
          </div>
        </section>
      </div>

      <div className="mx-5 mt-3 rounded-2xl">
        <BodyMapCard />
      </div>

      <div className="mx-5 mt-3 pb-2 text-center">
        <a
          href="https://www.magnific.com/free-vector/human-silhouette-medical-grid-background_417325480.htm"
          target="_blank"
          rel="noreferrer noopener"
          className="text-[11px] text-gray-500 underline"
        >
          Image by brgfx on Magnific
        </a>
      </div>
    </div>
  );
}

function DoctorOverview() {
  return (
    <div className="h-full overflow-y-auto pb-5" style={{ scrollbarWidth: "none" }}>
      <div className="px-5 pt-6 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-500">Doctor Mode</p>
        <h2 className="mt-1 text-3xl font-bold" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          PATIENT OVERVIEW
        </h2>
      </div>
      <div className="mx-5 grid grid-cols-1 gap-2.5">
        {[
          {
            label: "Active Patients",
            value: "42",
            icon: <Users size={28} color="#3b82f6" />,
          },
          {
            label: "Today Sessions",
            value: "18",
            icon: <CalendarDays size={28} color="#10b981" />,
          },
          {
            label: "Need Attention",
            value: "5",
            icon: <AlertTriangle size={28} color="#f97316" />,
          },
        ].map((item) => (
          <div key={item.label} className="relative rounded-2xl bg-gray-100 p-3.5">
            <div className="mb-1 text-gray-500">
              <span className="text-sm font-semibold uppercase tracking-widest">{item.label}</span>
            </div>
            <p className="text-4xl font-bold text-black" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {item.value}
            </p>
            <div className="absolute bottom-3 right-3">{item.icon}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DoctorBooking({ onStartCall }: { onStartCall: (room: string) => void }) {
  const [selectedDate, setSelectedDate] = useState("2026-06-27");
  const bookingSessions = [
    { date: "2026-06-27", time: "09:30", patient: "Sarah M.", focus: "Right Knee ACL", mode: "Video Call" },
    { date: "2026-06-27", time: "11:00", patient: "John D.", focus: "Hip Mobility", mode: "In-App Call" },
    { date: "2026-06-27", time: "14:30", patient: "Maria T.", focus: "Lower Back Rehab", mode: "Video Call" },
    { date: "2026-06-27", time: "16:00", patient: "Kevin P.", focus: "Ankle Stability", mode: "In-App Call" },
    { date: "2026-06-28", time: "10:00", patient: "Noah B.", focus: "Shoulder Mobility", mode: "Video Call" },
    { date: "2026-06-29", time: "13:00", patient: "Emma L.", focus: "Post-op Knee Rehab", mode: "In-App Call" },
    { date: "2026-06-30", time: "15:30", patient: "Olivia K.", focus: "Back Stabilization", mode: "Video Call" },
  ];

  const sessionDates = new Set(bookingSessions.map((session) => session.date));
  const sessionsForSelectedDate = bookingSessions.filter((session) => session.date === selectedDate);
  const calendarDays = Array.from({ length: 30 }, (_, index) => {
    const day = index + 1;
    const dateKey = `2026-06-${String(day).padStart(2, "0")}`;
    return { day, dateKey, hasSession: sessionDates.has(dateKey) };
  });

  return (
    <div className="h-full overflow-y-auto pb-5" style={{ scrollbarWidth: "none" }}>
      <div className="px-5 pt-6 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-500">Doctor Mode</p>
        <h2 className="mt-1 text-3xl font-bold" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          BOOKING
        </h2>
      </div>
      <div className="mx-5 mb-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">June 2026</p>
          <p className="text-[11px] text-gray-500">Select a day</p>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-gray-400">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
            <span key={dayName}>{dayName}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={`blank-${index}`} />
          ))}
          {calendarDays.map((item) => {
            const isSelected = item.dateKey === selectedDate;
            return (
              <button
                key={item.dateKey}
                type="button"
                onClick={() => setSelectedDate(item.dateKey)}
                className={`relative h-8 rounded-lg text-xs font-semibold ${
                  isSelected ? "bg-black text-white" : "bg-gray-100 text-gray-700"
                }`}
              >
                {item.day}
                {item.hasSession && (
                  <span
                    className={`absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${
                      isSelected ? "bg-white" : "bg-blue-600"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mx-5 rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Booked Sessions ({selectedDate})
        </p>
        <div className="mt-2 space-y-2">
          {sessionsForSelectedDate.length === 0 && (
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">No sessions booked for this date.</p>
          )}
          {sessionsForSelectedDate.map((session) => (
            <div
              key={`${session.date}-${session.time}-${session.patient}`}
              className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2"
            >
              <div>
                <p className="text-xs font-semibold text-black">
                  {session.time} · {session.patient}
                </p>
                <p className="text-[11px] text-gray-500">{session.focus}</p>
              </div>
              <button
                type="button"
                onClick={() => onStartCall(getCallRoom(`${session.patient}-doctor`))}
                className="rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-white"
              >
                {session.mode}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type DoctorPatientItem = {
  name: string;
  score: string;
  note: string;
  focus: string;
  status: "stable" | "watch" | "critical";
  nextSession: string;
};

function DoctorPatients({ onStartCall }: { onStartCall: (room: string) => void }) {
  const [selectedPatient, setSelectedPatient] = useState<DoctorPatientItem | null>(null);
  const patients: DoctorPatientItem[] = [
    {
      name: "Sarah M.",
      score: "64%",
      note: "Knee precision dropped, follow-up needed",
      focus: "Right Knee ACL rehab",
      status: "watch",
      nextSession: "Today 16:30",
    },
    {
      name: "John D.",
      score: "81%",
      note: "Good consistency, missed one day",
      focus: "Hip mobility and balance",
      status: "stable",
      nextSession: "Tomorrow 09:30",
    },
    {
      name: "Maria T.",
      score: "73%",
      note: "Back mobility improving slowly",
      focus: "Lower back pain management",
      status: "watch",
      nextSession: "Mon 14:00",
    },
    {
      name: "Kevin P.",
      score: "69%",
      note: "Ankle stability still inconsistent on lateral moves",
      focus: "Ankle stability and dynamic balance",
      status: "watch",
      nextSession: "Tue 16:00",
    },
    {
      name: "Olivia K.",
      score: "88%",
      note: "Very consistent form with strong weekly adherence",
      focus: "Post-op knee strengthening",
      status: "stable",
      nextSession: "Wed 11:30",
    },
    {
      name: "Noah B.",
      score: "58%",
      note: "Pain flare-up reported after last session",
      focus: "Shoulder mobility and pain control",
      status: "critical",
      nextSession: "Today 18:00",
    },
    {
      name: "Ava C.",
      score: "76%",
      note: "Steady progress, needs cueing on posture",
      focus: "Core activation and posture control",
      status: "stable",
      nextSession: "Thu 09:00",
    },
    {
      name: "Liam R.",
      score: "62%",
      note: "Missed two sessions this week; motivation support needed",
      focus: "Lower back endurance",
      status: "watch",
      nextSession: "Fri 15:00",
    },
  ];

  return (
    <div className="h-full overflow-y-auto pb-5" style={{ scrollbarWidth: "none" }}>
      <div className="px-5 pt-6 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-500">Doctor Mode</p>
        <h2 className="mt-1 text-3xl font-bold" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          PATIENT LIST
        </h2>
      </div>
      <div className="mx-5 space-y-2.5">
        {patients.map((patient) => (
          <button
            key={patient.name}
            type="button"
            onClick={() => setSelectedPatient(patient)}
            className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left"
          >
            <div className="flex items-center justify-between">
              <p className="text-base font-bold text-black">{patient.name}</p>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold">{patient.score}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">{patient.note}</p>
              <ChevronRight size={14} className="shrink-0 text-gray-400" />
            </div>
          </button>
        ))}
      </div>
      {selectedPatient && (
        <DoctorPatientDetailModal
          patient={selectedPatient}
          onClose={() => setSelectedPatient(null)}
          onStartCall={onStartCall}
        />
      )}
    </div>
  );
}

function DoctorPatientDetailModal({
  patient,
  onClose,
  onStartCall,
}: {
  patient: DoctorPatientItem;
  onClose: () => void;
  onStartCall: (room: string) => void;
}) {
  const statusStyles: Record<DoctorPatientItem["status"], string> = {
    stable: "bg-emerald-50 text-emerald-700",
    watch: "bg-amber-50 text-amber-700",
    critical: "bg-rose-50 text-rose-700",
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end bg-black/55 p-3">
      <div className="w-full rounded-2xl bg-white p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Patient Detail</p>
            <h3 className="mt-1 text-2xl font-bold text-gray-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {patient.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gray-100 p-1.5 text-gray-600"
            aria-label="Close patient detail"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-gray-100 p-2.5">
            <p className="text-gray-500">Latest Score</p>
            <p className="mt-0.5 text-lg font-bold text-gray-900">{patient.score}</p>
          </div>
          <div className={`rounded-xl p-2.5 ${statusStyles[patient.status]}`}>
            <p className="opacity-70">Risk Status</p>
            <p className="mt-0.5 text-lg font-bold capitalize">{patient.status}</p>
          </div>
          <div className="col-span-2 rounded-xl bg-gray-100 p-2.5">
            <p className="text-gray-500">Focus</p>
            <p className="mt-0.5 font-semibold text-gray-900">{patient.focus}</p>
          </div>
          <div className="col-span-2 rounded-xl bg-gray-100 p-2.5">
            <p className="text-gray-500">Next Session</p>
            <p className="mt-0.5 font-semibold text-gray-900">{patient.nextSession}</p>
          </div>
        </div>

        <p className="mt-3 text-sm text-gray-600">{patient.note}</p>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => onStartCall(getCallRoom(`${patient.name}-doctor`))}
            className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white"
          >
            <span className="flex items-center gap-1">
              <Phone size={13} />
              Start Call
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function VideoChatModal({
  room,
  onClose,
}: {
  room: string;
  onClose: () => void;
}) {
  const callUrl = `https://meet.jit.si/${encodeURIComponent(room)}?lang=en#config.prejoinPageEnabled=false&config.defaultLanguage=%22en%22`;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between border-b border-white/15 px-4 py-3 text-white">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-300">Video Chat</p>
          <p className="text-xs font-semibold">{room}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs"
        >
          <X size={14} />
          Close
        </button>
      </div>
      <iframe
        title="MetaHEAL Video Chat"
        src={callUrl}
        className="h-full w-full border-0"
        allow="camera; microphone; fullscreen; display-capture; autoplay"
      />
    </div>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<AppMode>(null);
  const [patientTab, setPatientTab] = useState<PatientTab>("today");
  const [doctorTab, setDoctorTab] = useState<DoctorTab>("overview");
  const [activeCallRoom, setActiveCallRoom] = useState<string | null>(null);

  const containerStyle = useMemo(
    () =>
      isMobile
        ? { width: "100%", minHeight: "100dvh", background: "#ffffff" }
        : {
            width: 390,
            height: 812,
            background: "#ffffff",
            borderRadius: 48,
            boxShadow: "0 28px 70px rgba(0,0,0,0.2), 0 0 0 10px #d4d4d4",
          },
    [isMobile],
  );

  return (
    <div
      className={isMobile ? "min-h-screen" : "min-h-screen flex items-center justify-center"}
      style={{ background: isMobile ? "#ffffff" : "#e8e8e8", fontFamily: "'Barlow', sans-serif" }}
    >
      <div className="relative flex flex-col overflow-hidden" style={containerStyle}>
        <div className="flex-1 overflow-hidden">
          {mode === null && <LoginMockScreen onSelect={setMode} />}
          {mode === "patient" && patientTab === "today" && <TodayPlanScreen />}
          {mode === "patient" && patientTab === "booking" && <BookingScreen onStartCall={setActiveCallRoom} />}
          {mode === "patient" && patientTab === "mypage" && <MyPageScreen />}
          {mode === "doctor" && doctorTab === "overview" && <DoctorOverview />}
          {mode === "doctor" && doctorTab === "patients" && <DoctorPatients onStartCall={setActiveCallRoom} />}
          {mode === "doctor" && doctorTab === "booking" && <DoctorBooking onStartCall={setActiveCallRoom} />}
        </div>

        {mode !== null && (
          <div className="flex-shrink-0 border-t border-gray-100 px-4 pb-4 pt-2">
            <AppBottomNav
              mode={mode}
              patientTab={patientTab}
              doctorTab={doctorTab}
              onPatientTabChange={setPatientTab}
              onDoctorTabChange={setDoctorTab}
            />
          </div>
        )}

        {activeCallRoom && (
          <VideoChatModal room={activeCallRoom} onClose={() => setActiveCallRoom(null)} />
        )}
      </div>
    </div>
  );
}
