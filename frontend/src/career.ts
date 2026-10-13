import { formatSpan } from "./format";
import { isOngoing, monthIndex, MONTHS_PER_YEAR } from "./months";
import type { Experience } from "./types";

export interface CareerSegment {
  // Position on the strip, as percentages of its width.
  left: number;
  width: number;
  // Overlapping jobs sit on separate lanes so neither hides the other.
  lane: number;
  isCurrent: boolean;
  label: string;
  span: string;
}

export interface CareerStrip {
  firstYear: number;
  lastYear: number;
  laneCount: number;
  segments: CareerSegment[];
}

interface DatedJob {
  job: Experience;
  start: number;
  end: number;
}

function datedJobs(experience: Experience[], today: Date): DatedJob[] {
  return experience
    .map((job) => ({ job, start: monthIndex(job.start, false, today), end: monthIndex(job.end, true, today) }))
    .filter((dated): dated is DatedJob => dated.start !== null && dated.end !== null && dated.end >= dated.start)
    .sort((a, b) => a.start - b.start);
}

// Greedy interval partitioning: each job takes the lowest lane that is free by its start.
function assignLanes(jobs: DatedJob[]): number[] {
  const laneEnds: number[] = [];
  return jobs.map(({ start, end }) => {
    const free = laneEnds.findIndex((laneEnd) => laneEnd < start);
    const lane = free === -1 ? laneEnds.length : free;
    laneEnds[lane] = end;
    return lane;
  });
}

export function careerStrip(experience: Experience[], today: Date): CareerStrip | null {
  const jobs = datedJobs(experience, today);
  if (jobs.length === 0) return null;

  const firstYear = Math.floor(jobs[0].start / MONTHS_PER_YEAR);
  const lastYear = Math.floor(Math.max(...jobs.map((dated) => dated.end)) / MONTHS_PER_YEAR);
  const axisStart = firstYear * MONTHS_PER_YEAR;
  const axisMonths = (lastYear - firstYear + 1) * MONTHS_PER_YEAR;
  const lanes = assignLanes(jobs);

  return {
    firstYear,
    lastYear,
    laneCount: Math.max(...lanes) + 1,
    segments: jobs.map(({ job, start, end }, index) => ({
      left: ((start - axisStart) / axisMonths) * 100,
      width: ((end - start + 1) / axisMonths) * 100,
      lane: lanes[index],
      isCurrent: isOngoing(job.end),
      label: [job.role, job.company].filter(Boolean).join(", ") || "Role",
      span: formatSpan(job.start, job.end),
    })),
  };
}
