/**
 * Système de télémétrie avec scrubbing PII
 */

export interface TelemetryEvent {
  timestamp: string;
  event: string;
  [key: string]: any;
}

const PII_KEYS = new Set(['email', 'apiKey', 'token', 'password', 'secret']);

export function trackEvent(event: string, payload: Record<string, any>): void {
  const sanitized = scrubPII(payload);
  
  const telemetryEvent: TelemetryEvent = {
    timestamp: new Date().toISOString(),
    event,
    ...sanitized
  };
  
  console.log('[Telemetry]', JSON.stringify(telemetryEvent));
}

function scrubPII(payload: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(payload)) {
    if (PII_KEYS.has(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = scrubPII(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}
