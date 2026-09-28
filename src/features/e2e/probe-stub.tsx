/**
 * What `nwt-e2e-probe` resolves to in every build except E2E ones (ADR-0036): nothing. The
 * alias lives in next.config.ts, so a production build never even reaches the probe file.
 */
export default function RecordProbeStub() {
  return null;
}
