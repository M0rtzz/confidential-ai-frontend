export const mockAuditEvents = [
  {
    eventType: 'A100_SIMULATION_DOMAIN_VERIFIED',
    subjectId: 'a100-domain-a',
    securityProfile: 'a100-sim',
    simulated: true,
    createdAt: '2026-09-01T10:20:00Z',
  },
  {
    eventType: 'REQUEST_BLOCKED',
    subjectId: 'a100-domain-b',
    securityProfile: 'a100-sim',
    simulated: true,
    createdAt: '2026-09-01T10:18:00Z',
  },
];
