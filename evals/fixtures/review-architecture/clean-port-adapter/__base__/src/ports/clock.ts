/** The only source of "now" a service is allowed to know about. */
export interface ClockPort {
  nowMs(): number;
}
