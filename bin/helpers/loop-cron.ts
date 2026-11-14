/** A parsed five-field cron expression. */
export interface Cron {
  readonly minutes: ReadonlySet<number>;
  readonly hours: ReadonlySet<number>;
  readonly daysOfMonth: ReadonlySet<number>;
  readonly months: ReadonlySet<number>;
  readonly daysOfWeek: ReadonlySet<number>;
  /** True when a day matches either day field; false when both must match. */
  readonly eitherDay: boolean;
}

export type CronParse = { ok: true; cron: Cron } | { ok: false; issue: string };

interface FieldSpec {
  readonly name: string;
  readonly min: number;
  readonly max: number;
}

const MINUTE: FieldSpec = { name: 'minute', min: 0, max: 59 };
const HOUR: FieldSpec = { name: 'hour', min: 0, max: 23 };
const DAY_OF_MONTH: FieldSpec = { name: 'day of month', min: 1, max: 31 };
const MONTH: FieldSpec = { name: 'month', min: 1, max: 12 };
const DAY_OF_WEEK: FieldSpec = { name: 'day of week', min: 0, max: 7 };

// Month lengths in a non-leap year.
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const MS_PER_MINUTE = 60_000;
const DEFAULT_HORIZON_DAYS = 366;

type FieldParse =
  | { ok: true; values: Set<number> }
  | { ok: false; issue: string };

const integerOf = (text: string): number | undefined =>
  /^\d+$/.test(text) ? Number(text) : undefined;

const range = (from: number, to: number, step: number): number[] =>
  Array.from(
    { length: Math.floor((to - from) / step) + 1 },
    (_, i) => from + i * step,
  );

// One comma-free part: `*`, `n`, `a-b`, each with an optional `/step`.
function partValues(
  part: string,
  spec: FieldSpec,
): { ok: true; values: number[] } | { ok: false; issue: string } {
  const [base = '', stepText, ...extra] = part.split('/');
  const fail = (why: string) => ({
    ok: false as const,
    issue: `${spec.name}: ${why}`,
  });
  if (extra.length > 0) return fail(`"${part}" has more than one step`);
  const step = stepText === undefined ? 1 : integerOf(stepText);
  if (step === undefined || step < 1)
    return fail(`step "${stepText}" must be a whole number of at least 1`);

  const bounds = base.split('-');
  const [fromText = '', toText] = bounds;
  if (bounds.length > 2) return fail(`"${part}" is not a number or a range`);
  const from = fromText === '*' ? spec.min : integerOf(fromText);
  const to =
    fromText === '*'
      ? spec.max
      : toText === undefined
        ? stepText === undefined
          ? from
          : spec.max
        : integerOf(toText);
  if (
    from === undefined ||
    to === undefined ||
    (fromText === '*' && toText !== undefined)
  ) {
    return fail(
      `"${part}" is not a number or a range (names and macros are not accepted)`,
    );
  }
  if (from < spec.min || from > spec.max)
    return fail(`${from} is out of range ${spec.min}-${spec.max}`);
  if (to < spec.min || to > spec.max)
    return fail(`${to} is out of range ${spec.min}-${spec.max}`);
  if (from > to) return fail(`range ${from}-${to} runs backwards`);
  return { ok: true, values: range(from, to, step) };
}

function parseField(text: string, spec: FieldSpec): FieldParse {
  const parts = text.split(',').map((part) => partValues(part, spec));
  const failed = parts.find((part) => !part.ok);
  if (failed && !failed.ok) return failed;
  return {
    ok: true,
    values: new Set(parts.flatMap((part) => (part.ok ? part.values : []))),
  };
}

// A day field starting with `*` is unrestricted, as Vixie cron and cronie read it; Claude Code's own reading is unknown.
const isRestricted = (text: string): boolean => !text.startsWith('*');

function neverFires(
  dom: ReadonlySet<number>,
  months: ReadonlySet<number>,
): boolean {
  return ![...months].some((month) =>
    [...dom].some((day) => day <= (MONTH_LENGTHS[month - 1] ?? 0)),
  );
}

/**
 * Parses a five-field cron expression (minute, hour, day of month, month, day of week).
 * Each field takes `*`, a number, `a-b`, a step on either, or a comma list; day of week
 * runs 0-7 with 7 read as Sunday. Names, `@` macros, and a seconds field are refused.
 * It also refuses a schedule that never fires: day of month restricted, day of week
 * unrestricted, and no listed month holds a listed day in a non-leap year (`0 0 30 2 *`, `0 0 29 2 *`).
 */
export function parseCron(expr: string): CronParse {
  const fields = expr.trim().split(/\s+/);
  const [minuteText, hourText, domText, monthText, dowText] = fields;
  if (
    fields.length !== 5 ||
    minuteText === undefined ||
    hourText === undefined ||
    domText === undefined ||
    monthText === undefined ||
    dowText === undefined
  ) {
    return {
      ok: false,
      issue: `a schedule needs five fields (minute hour day-of-month month day-of-week), got ${fields.filter((f) => f !== '').length}`,
    };
  }
  const minutes = parseField(minuteText, MINUTE);
  const hours = parseField(hourText, HOUR);
  const daysOfMonth = parseField(domText, DAY_OF_MONTH);
  const months = parseField(monthText, MONTH);
  const daysOfWeek = parseField(dowText, DAY_OF_WEEK);
  for (const field of [minutes, hours, daysOfMonth, months, daysOfWeek]) {
    if (!field.ok) return field;
  }
  if (
    !minutes.ok ||
    !hours.ok ||
    !daysOfMonth.ok ||
    !months.ok ||
    !daysOfWeek.ok
  ) {
    return { ok: false, issue: 'a field did not parse' };
  }
  const domRestricted = isRestricted(domText);
  const dowRestricted = isRestricted(dowText);
  if (
    domRestricted &&
    !dowRestricted &&
    neverFires(daysOfMonth.values, months.values)
  ) {
    return {
      ok: false,
      issue: `day of month: no day in "${domText}" exists in month "${monthText}", so the schedule never fires`,
    };
  }
  return {
    ok: true,
    cron: {
      minutes: minutes.values,
      hours: hours.values,
      daysOfMonth: daysOfMonth.values,
      months: months.values,
      daysOfWeek: new Set([...daysOfWeek.values].map((day) => day % 7)),
      eitherDay: domRestricted && dowRestricted,
    },
  };
}

function dayMatches(cron: Cron, at: Date): boolean {
  const inMonth = cron.daysOfMonth.has(at.getDate());
  const inWeek = cron.daysOfWeek.has(at.getDay());
  return cron.eitherDay ? inMonth || inWeek : inMonth && inWeek;
}

const startOfLocalDay = (at: Date): Date =>
  new Date(at.getFullYear(), at.getMonth(), at.getDate());

/**
 * The latest whole minute at or before `at`, in local time, that `cron` matches, or
 * undefined when none falls within `horizonDays`. It walks back by real instants, so a
 * minute a spring-forward skips never matches and a repeated fall-back hour is walked twice.
 */
export function previousFire(
  cron: Cron,
  at: Date,
  horizonDays = DEFAULT_HORIZON_DAYS,
): Date | undefined {
  const floor = Math.floor(at.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE;
  const limit = floor - horizonDays * 24 * 60 * MS_PER_MINUTE;
  // Each step moves back by real time; a mismatched day or hour skips to that unit's last minute.
  const next = (ms: number): number => {
    const t = new Date(ms);
    if (!cron.months.has(t.getMonth() + 1) || !dayMatches(cron, t))
      return startOfLocalDay(t).getTime() - MS_PER_MINUTE;
    if (!cron.hours.has(t.getHours()))
      return ms - (t.getMinutes() + 1) * MS_PER_MINUTE;
    return ms - MS_PER_MINUTE;
  };
  const matches = (t: Date): boolean =>
    cron.months.has(t.getMonth() + 1) &&
    dayMatches(cron, t) &&
    cron.hours.has(t.getHours()) &&
    cron.minutes.has(t.getMinutes());
  for (let ms = floor; ms >= limit; ms = next(ms)) {
    const t = new Date(ms);
    if (matches(t)) return t;
  }
  return undefined;
}
