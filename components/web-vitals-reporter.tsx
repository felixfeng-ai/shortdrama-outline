"use client"

import { useEffect } from "react"

type MetricName = "FCP" | "LCP" | "INP" | "CLS" | "TTFB"
type Rating = "good" | "needs-improvement" | "poor"

interface LayoutShiftEntry extends PerformanceEntry {
  value: number
  hadRecentInput: boolean
}

interface EventTimingEntry extends PerformanceEntry {
  duration: number
}

const thresholds: Record<MetricName, [number, number]> = {
  FCP: [1_800, 3_000],
  LCP: [2_500, 4_000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  TTFB: [800, 1_800],
}

function rating(name: MetricName, value: number): Rating {
  const [good, poor] = thresholds[name]
  if (value <= good) return "good"
  return value <= poor ? "needs-improvement" : "poor"
}

function deviceType(): "mobile" | "tablet" | "desktop" | "other" {
  const width = window.innerWidth
  if (width <= 640) return "mobile"
  if (width <= 1024) return "tablet"
  return width > 0 ? "desktop" : "other"
}

export function WebVitalsReporter({ release }: { release: string }) {
  useEffect(() => {
    const sent = new Set<MetricName>()
    const latest = new Map<MetricName, number>()
    let inp = 0

    const send = (name: MetricName, value: number) => {
      if (sent.has(name) || !Number.isFinite(value) || value < 0) return
      sent.add(name)
      const connection = (navigator as Navigator & {
        connection?: { effectiveType?: string }
      }).connection as
        | { effectiveType?: string }
        | undefined
      const payload = {
        name,
        value: Math.round(value * 1000) / 1000,
        rating: rating(name, value),
        path: window.location.pathname,
        device: deviceType(),
        connection: connection?.effectiveType ?? "",
        release: release.slice(0, 40),
      }
      const body = new Blob([JSON.stringify(payload)], {
        type: "application/json",
      })
      try {
        if (navigator.sendBeacon("/api/vitals", body)) return
      } catch {}
      void fetch("/api/vitals", {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: true,
      }).catch(() => {})
    }

    const flush = () => {
      for (const [name, value] of latest) send(name, value)
      if (inp > 0) send("INP", inp)
    }

    const observers: PerformanceObserver[] = []
    const observe = (
      type: string,
      callback: (entry: PerformanceEntry) => void,
    ) => {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) callback(entry)
        })
        observer.observe({ type, buffered: true } as PerformanceObserverInit)
        observers.push(observer)
      } catch {}
    }

    observe("paint", (entry) => {
      if (entry.name === "first-contentful-paint") {
        latest.set("FCP", entry.startTime)
        send("FCP", entry.startTime)
      }
    })
    observe("largest-contentful-paint", (entry) => {
      latest.set("LCP", entry.startTime)
    })
    observe("layout-shift", (entry) => {
      const shift = entry as LayoutShiftEntry
      if (shift.hadRecentInput) return
      latest.set("CLS", (latest.get("CLS") ?? 0) + shift.value)
    })
    observe("event", (entry) => {
      const timing = entry as EventTimingEntry
      if (timing.duration > inp) inp = timing.duration
    })

    const navigation = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined
    if (navigation) {
      const value = Math.max(0, navigation.responseStart - navigation.startTime)
      latest.set("TTFB", value)
      send("TTFB", value)
    }

    const timer = window.setTimeout(flush, 5_000)
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush()
    }
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      flush()
      window.clearTimeout(timer)
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", onVisibility)
      observers.forEach((observer) => observer.disconnect())
    }
  }, [release])

  return null
}
