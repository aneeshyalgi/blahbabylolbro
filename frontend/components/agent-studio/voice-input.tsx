"use client";

/**
 * Voice input for the Agent Studio: records speech in the browser and transcribes it with OpenAI
 * (via /api/agents/transcribe) in the studio's selected language, English or German.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS } from "@/lib/api-config";
import { cn } from "@/lib/utils";
import { useStudioText, type StudioLocale, type StudioTextKey } from "./i18n";

const MAX_SECONDS = 120;
const MIN_SECONDS = 0.5;
// RMS level (0–1) a recording must reach at least once to count as speech. Silence is not sent,
// because transcription models tend to fill silent audio with invented text.
const SPEECH_LEVEL = 0.02;
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

type VoiceState = "idle" | "starting" | "recording" | "transcribing";
type VoiceErrorKind = "permission" | "noMic" | "noSpeech" | "failed";

type Session = {
  recorder: MediaRecorder;
  stream: MediaStream;
  context: AudioContext | null;
  frame: number;
  timer: number;
  peak: number;
  startedAt: number;
  cancelled: boolean;
};

function pickMimeType(): string {
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function extensionFor(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

/** Add dictated text after whatever is already typed. */
export function appendTranscript(current: string, text: string): string {
  const trimmed = current.replace(/\s+$/, "");
  return trimmed ? `${trimmed} ${text}` : text;
}

function useVoiceInput({
  language,
  onTranscript,
  onError,
}: {
  language: StudioLocale;
  onTranscript: (text: string) => void;
  onError: (kind: VoiceErrorKind, detail?: string) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [supported, setSupported] = useState(false);
  const callbacks = useRef({ language, onTranscript, onError });
  callbacks.current = { language, onTranscript, onError };
  const session = useRef<Session | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSupported(Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined");
  }, []);

  const release = useCallback(() => {
    const current = session.current;
    if (!current) return;
    window.cancelAnimationFrame(current.frame);
    window.clearInterval(current.timer);
    current.stream.getTracks().forEach((track) => track.stop());
    void current.context?.close().catch(() => undefined);
    session.current = null;
    setLevel(0);
  }, []);

  const transcribe = useCallback(async (blob: Blob, mime: string) => {
    setState("transcribing");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const form = new FormData();
      form.append("file", new File([blob], `speech.${extensionFor(mime)}`, { type: mime.split(";")[0] || "audio/webm" }));
      form.append("language", callbacks.current.language);
      const response = await fetch(API_ENDPOINTS.agentTranscribe, { method: "POST", body: form, signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof payload?.detail === "string" ? payload.detail : `HTTP ${response.status}`);
      const text = String(payload?.text ?? "").trim();
      if (text) callbacks.current.onTranscript(text);
      else callbacks.current.onError("noSpeech");
    } catch (error) {
      if (!controller.signal.aborted) callbacks.current.onError("failed", error instanceof Error ? error.message : undefined);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setState("idle");
    }
  }, []);

  const start = useCallback(async () => {
    if (session.current || state !== "idle") return;
    setState("starting");
    setElapsed(0);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (error) {
      setState("idle");
      const name = error instanceof DOMException ? error.name : "";
      const kind: VoiceErrorKind =
        name === "NotAllowedError" || name === "SecurityError" ? "permission"
          : name === "NotFoundError" || name === "OverconstrainedError" ? "noMic"
            : "failed";
      callbacks.current.onError(kind, error instanceof Error ? error.message : undefined);
      return;
    }

    const mime = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      setState("idle");
      callbacks.current.onError("failed", error instanceof Error ? error.message : undefined);
      return;
    }

    const chunks: Blob[] = [];
    const current: Session = { recorder, stream, context: null, frame: 0, timer: 0, peak: 0, startedAt: performance.now(), cancelled: false };
    session.current = current;

    // Level meter, also used to recognise a recording that contains no speech.
    try {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const value = (sample - 128) / 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / samples.length);
        current.peak = Math.max(current.peak, rms);
        setLevel(Math.min(1, rms * 5));
        current.frame = window.requestAnimationFrame(tick);
      };
      current.context = context;
      current.frame = window.requestAnimationFrame(tick);
    } catch {
      current.peak = 1; // No meter available: let the server decide whether there was speech.
    }

    current.timer = window.setInterval(() => {
      const seconds = (performance.now() - current.startedAt) / 1000;
      setElapsed(seconds);
      if (seconds >= MAX_SECONDS && recorder.state === "recording") recorder.stop();
    }, 200);

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const duration = (performance.now() - current.startedAt) / 1000;
      const { cancelled, peak } = current;
      release();
      if (cancelled) {
        setState("idle");
        return;
      }
      if (duration < MIN_SECONDS || peak < SPEECH_LEVEL || !chunks.length) {
        setState("idle");
        callbacks.current.onError("noSpeech");
        return;
      }
      const type = recorder.mimeType || mime || "audio/webm";
      void transcribe(new Blob(chunks, { type }), type);
    };
    recorder.start(250);
    setState("recording");
  }, [release, state, transcribe]);

  const stop = useCallback(() => {
    const current = session.current;
    if (current && current.recorder.state !== "inactive") current.recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    const current = session.current;
    if (!current) return;
    current.cancelled = true;
    if (current.recorder.state !== "inactive") current.recorder.stop();
    else {
      release();
      setState("idle");
    }
  }, [release]);

  // Leaving the screen discards the recording and any transcription in flight.
  useEffect(() => () => {
    abortRef.current?.abort();
    const current = session.current;
    if (current) {
      current.cancelled = true;
      if (current.recorder.state !== "inactive") current.recorder.stop();
    }
    release();
  }, [release]);

  return { state, elapsed, level, supported, start, stop, cancel };
}

function formatElapsed(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Microphone button: click to dictate, click again to transcribe the speech into the text box. */
export function VoiceInputButton({
  onTranscript,
  disabled = false,
  className,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t, locale } = useStudioText();
  const { toast } = useToast();
  const voice = useVoiceInput({
    language: locale,
    onTranscript,
    onError: (kind, detail) =>
      toast({
        title: t(`voice.error.${kind}` as StudioTextKey),
        description: kind === "failed" ? detail : undefined,
        variant: kind === "noSpeech" ? undefined : "destructive",
      }),
  });
  const { state, cancel } = voice;

  useEffect(() => {
    if (state !== "recording" && state !== "transcribing") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state, cancel]);

  if (state === "recording" || state === "transcribing") {
    const recording = state === "recording";
    return (
      <span
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border px-1.5 text-[11px] tabular-nums",
          recording ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-[#303845] bg-[#0b1017] text-[#aeb8c7]",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <button type="button" onClick={cancel} className="rounded p-0.5 text-[#8c96a8] hover:text-white" aria-label={t("voice.cancel")} title={t("voice.cancel")}>
          <X className="h-3.5 w-3.5" />
        </button>
        {recording ? (
          <>
            <span className="flex h-4 items-center gap-[2px]" aria-hidden="true">
              {[0.55, 1, 0.75].map((scale, index) => (
                <span
                  key={index}
                  className="w-[3px] rounded-full bg-red-400 transition-[height] duration-75"
                  style={{ height: `${Math.max(3, voice.level * scale * 16)}px` }}
                />
              ))}
            </span>
            <span>{formatElapsed(voice.elapsed)}</span>
            <span className="sr-only">{t("voice.recording")}</span>
            <button
              type="button"
              onClick={voice.stop}
              className="flex h-6 w-6 items-center justify-center rounded bg-red-500 text-white hover:bg-red-400"
              aria-label={t("voice.stop")}
              title={t("voice.stop")}
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          </>
        ) : (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="pr-1">{t("voice.transcribing")}</span>
          </>
        )}
      </span>
    );
  }

  const label = voice.supported ? t("voice.start", { language: t("voice.languageName") }) : t("voice.unsupported");
  return (
    <button
      type="button"
      onClick={() => void voice.start()}
      disabled={disabled || !voice.supported || state === "starting"}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md border border-[#303845] text-[#aeb8c7] transition-colors hover:border-[#f5c400]/50 hover:text-[#f5c400] disabled:opacity-40 disabled:hover:border-[#303845] disabled:hover:text-[#aeb8c7]",
        className,
      )}
      aria-label={label}
      title={label}
    >
      {state === "starting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}
